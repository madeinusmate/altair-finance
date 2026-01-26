import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, rm, readFile, copyFile, unlink } from "fs/promises";
import fs from "fs";
import path from "path";
import os from "os";
import { getDbPath, dbFileExists, initializeDb, runMigrations } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";
import {
  validateImportedDatabase,
  backupDatabase,
  forceCloseConnections,
  extractZipFile,
} from "@/lib/db/import-utils";
import Database from "better-sqlite3-multiple-ciphers";

export const dynamic = "force-dynamic";

type DatabaseInstance = InstanceType<typeof Database>;

const escapeSqlString = (value: string): string => {
  return value.replaceAll("'", "''");
};

const applyCipherPragmas = (sqlite: DatabaseInstance, encryptionKey: string): void => {
  sqlite.pragma("cipher = 'sqlcipher'");
  sqlite.pragma("legacy = 4");
  sqlite.pragma(`key = '${escapeSqlString(encryptionKey)}'`);
  sqlite.pragma("journal_mode = WAL");
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  let tempDir: string | undefined = undefined;
  let backupPath: string | null = null;

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const key = formData.get("key") as string | null;
    const validateOnly = formData.get("validateOnly") === "true";

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: "No file provided",
          errorCode: "INVALID_ZIP_FORMAT",
          details: [
            {
              category: "format",
              technical: "File field is missing from form data",
              userFriendly: "Please select a database backup file to import.",
            },
          ],
        },
        { status: 400 }
      );
    }

    if (!key) {
      return NextResponse.json(
        {
          success: false,
          error: "No encryption key provided",
          errorCode: "INVALID_KEY_FORMAT",
          details: [
            {
              category: "key",
              technical: "Encryption key field is missing from form data",
              userFriendly: "Please provide the encryption key for the database.",
            },
          ],
        },
        { status: 400 }
      );
    }

    // Validate key format
    if (!validateEncryptionKey(key)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid encryption key format",
          errorCode: "INVALID_KEY_FORMAT",
          details: [
            {
              category: "key",
              technical: "Encryption key must be at least 8 characters",
              userFriendly: "The encryption key must be at least 8 characters long.",
            },
          ],
        },
        { status: 400 }
      );
    }

    // Check if database already exists (block import unless during onboarding or validate-only)
    const dbExists = dbFileExists();
    if (dbExists && !validateOnly) {
      return NextResponse.json(
        {
          success: false,
          error: "Database already exists. Please delete it first before importing.",
          errorCode: "DATABASE_EXISTS",
          details: [
            {
              category: "format",
              technical: "Database file already exists at target location",
              userFriendly:
                "A database already exists. Please delete it from settings before importing a new one.",
            },
          ],
        },
        { status: 409 }
      );
    }

    // Validate file type
    if (!file.name.endsWith(".zip") && file.type !== "application/zip") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file format",
          errorCode: "INVALID_ZIP_FORMAT",
          details: [
            {
              category: "format",
              technical: `File type: ${file.type}, expected ZIP archive`,
              userFriendly: "Please select a valid ZIP backup file exported from Netly.",
            },
          ],
        },
        { status: 400 }
      );
    }

    // Warn about large files but allow
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 100) {
      console.warn(`Large file being imported: ${fileSizeMB.toFixed(2)}MB`);
    }

    // Create temporary directory for extraction
    tempDir = await mkdir(path.join(os.tmpdir(), `netly-import-${Date.now()}`), {
      recursive: true,
    });

    if (!tempDir) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to create temporary directory",
          errorCode: "IMPORT_FAILED",
          details: [
            {
              category: "data",
              technical: "mkdir returned undefined",
              userFriendly: "Failed to create temporary directory for import. Please try again.",
            },
          ],
        },
        { status: 500 }
      );
    }

    // Save uploaded file to temp directory
    const zipPath = path.join(tempDir, file.name);
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(zipPath, Buffer.from(arrayBuffer));

    // Extract ZIP file
    let extractedFiles;
    try {
      extractedFiles = await extractZipFile(zipPath, tempDir);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to extract ZIP file",
          errorCode: "INVALID_ZIP_FORMAT",
          details: [
            {
              category: "format",
              technical: error instanceof Error ? error.message : String(error),
              userFriendly:
                "The ZIP file could not be extracted. Please ensure it's a valid Netly backup file.",
            },
          ],
        },
        { status: 400 }
      );
    }

    // Validate extracted database
    const validation = await validateImportedDatabase(extractedFiles.dbPath, key);
    if (!validation.valid) {
      // Clean up temp files
      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
      return NextResponse.json(
        {
          success: false,
          error: validation.error || "Database validation failed",
          errorCode: validation.errorCode || "IMPORT_FAILED",
          details: validation.details,
        },
        { status: 400 }
      );
    }

    // If validate-only mode, return stats and clean up
    if (validateOnly) {
      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
      return NextResponse.json({
        success: true,
        stats: validation.stats,
      });
    }

    // Backup existing database (shouldn't exist at this point, but be safe)
    if (dbFileExists()) {
      backupPath = backupDatabase();
      if (!backupPath) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to backup existing database",
            errorCode: "IMPORT_FAILED",
            details: [
              {
                category: "data",
                technical: "Could not create backup of existing database",
                userFriendly:
                  "Failed to backup existing database. Import cancelled to prevent data loss.",
              },
            ],
          },
          { status: 500 }
        );
      }
    }

    // Close all database connections
    forceCloseConnections();

    // Get target database path
    const dbPath = getDbPath();
    const dbDir = path.dirname(dbPath);
    await mkdir(dbDir, { recursive: true });

    // Copy database file
    const dbContent = await readFile(extractedFiles.dbPath);
    await writeFile(dbPath, dbContent);

    // Copy WAL file if present, otherwise create empty one
    const walPath = `${dbPath}-wal`;
    if (extractedFiles.walPath) {
      const walContent = await readFile(extractedFiles.walPath);
      await writeFile(walPath, walContent);
    } else {
      // Create empty WAL file
      await writeFile(walPath, Buffer.alloc(0));
    }

    // Copy SHM file if present, otherwise create empty one
    const shmPath = `${dbPath}-shm`;
    if (extractedFiles.shmPath) {
      const shmContent = await readFile(extractedFiles.shmPath);
      await writeFile(shmPath, shmContent);
    } else {
      // Create empty SHM file
      await writeFile(shmPath, Buffer.alloc(0));
    }

    // Validate imported database at final location
    const finalValidation = await validateImportedDatabase(dbPath, key);
    if (!finalValidation.valid) {
      // Restore backup if it exists
      if (backupPath && fs.existsSync(backupPath)) {
        const backupWalPath = `${backupPath}-wal`;
        const backupShmPath = `${backupPath}-shm`;
        try {
          await copyFile(backupPath, dbPath);
          if (fs.existsSync(backupWalPath)) {
            await copyFile(backupWalPath, walPath);
          }
          if (fs.existsSync(backupShmPath)) {
            await copyFile(backupShmPath, shmPath);
          }
        } catch {
          // Ignore restore errors
        }
      } else {
        // No backup, remove imported files
        try {
          if (fs.existsSync(dbPath)) {
            await unlink(dbPath);
          }
          if (fs.existsSync(walPath)) {
            await unlink(walPath);
          }
          if (fs.existsSync(shmPath)) {
            await unlink(shmPath);
          }
        } catch {
          // Ignore cleanup errors
        }
      }

      // Clean up temp files
      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: finalValidation.error || "Database validation failed after import",
          errorCode: finalValidation.errorCode || "IMPORT_FAILED",
          details: finalValidation.details,
        },
        { status: 500 }
      );
    }

    // Run migrations if needed
    try {
      const sqlite = new Database(dbPath);
      applyCipherPragmas(sqlite, key);
      runMigrations(sqlite);
      sqlite.close();
    } catch (error) {
      console.error("Migration error:", error);
      // Migration errors are non-fatal, continue
    }

    // Clean up temp files
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    return NextResponse.json({
      success: true,
      stats: finalValidation.stats,
    });
  } catch (error) {
    // Clean up temp files on error
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    // Restore backup if import failed
    if (backupPath && fs.existsSync(backupPath)) {
      const dbPath = getDbPath();
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      const backupWalPath = `${backupPath}-wal`;
      const backupShmPath = `${backupPath}-shm`;
      try {
        await copyFile(backupPath, dbPath);
        if (fs.existsSync(backupWalPath)) {
          await copyFile(backupWalPath, walPath);
        }
        if (fs.existsSync(backupShmPath)) {
          await copyFile(backupShmPath, shmPath);
        }
      } catch {
        // Ignore restore errors
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: `Import failed: ${errorMessage}`,
        errorCode: "IMPORT_FAILED",
        details: [
          {
            category: "data",
            technical: errorMessage,
            userFriendly: "An unexpected error occurred during import. Please try again.",
          },
        ],
      },
      { status: 500 }
    );
  }
};

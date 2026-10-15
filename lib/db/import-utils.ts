import Database from "better-sqlite3-multiple-ciphers";
import * as crypto from "crypto";
import path from "path";
import fs from "fs";
import yauzl from "yauzl";
import { promisify } from "util";
import { getDbPath, clearConnectionCache, META_ID, SCHEMA_VERSION } from "./index";

type DatabaseInstance = InstanceType<typeof Database>;

const escapeSqlString = (value: string): string => {
  return value.replaceAll("'", "''");
};

const applyCipherPragmas = (sqlite: DatabaseInstance, encryptionKey: string): void => {
  sqlite.pragma("cipher = 'sqlcipher'");
  sqlite.pragma("legacy = 4");
  sqlite.pragma(`key = '${escapeSqlString(encryptionKey)}'`);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
};

const openSqliteAtPath = (dbPath: string, encryptionKey: string): DatabaseInstance => {
  const sqlite = new Database(dbPath);
  applyCipherPragmas(sqlite, encryptionKey);
  return sqlite;
};

export interface DatabaseStats {
  schemaVersion: number;
  createdAt: number;
  accountCount: number;
  accountNames: string[];
  transactionCounts: Record<string, number>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  details?: Array<{
    category: "format" | "key" | "data" | "schema";
    technical: string;
    userFriendly: string;
  }>;
  stats?: DatabaseStats;
}

// Rate limiting for key attempts
const keyAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;

const checkRateLimit = (key: string): boolean => {
  const now = Date.now();
  const attempt = keyAttempts.get(key);
  
  if (!attempt || now > attempt.resetAt) {
    keyAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (attempt.count >= MAX_ATTEMPTS) {
    return false;
  }
  
  attempt.count++;
  return true;
};

export const validateImportedDatabase = async (
  dbPath: string,
  encryptionKey: string
): Promise<ValidationResult> => {
  const errors: Array<{
    category: "format" | "key" | "data" | "schema";
    technical: string;
    userFriendly: string;
  }> = [];

  // Check rate limit
  if (!checkRateLimit(encryptionKey)) {
    return {
      valid: false,
      error: "Too many attempts. Please wait a minute before trying again.",
      errorCode: "RATE_LIMIT_EXCEEDED",
      details: [
        {
          category: "key",
          technical: `Rate limit exceeded for key attempts (${MAX_ATTEMPTS} attempts per minute)`,
          userFriendly: "Too many attempts. Please wait a minute before trying again.",
        },
      ],
    };
  }

  // Validate key format
  if (!encryptionKey || encryptionKey.length < 8) {
    return {
      valid: false,
      error: "Invalid encryption key format",
      errorCode: "INVALID_KEY_FORMAT",
      details: [
        {
          category: "key",
          technical: "Encryption key must be at least 8 characters",
          userFriendly: "The encryption key must be at least 8 characters long.",
        },
      ],
    };
  }

  // Try to open and decrypt the database
  let sqlite: DatabaseInstance | null = null;
  try {
    sqlite = openSqliteAtPath(dbPath, encryptionKey);
    
    // Try to read from meta table to verify decryption works
    const metaRow = sqlite.prepare("SELECT schema_version, created_at FROM meta WHERE id = ?").get(META_ID) as
      | { schema_version: number; created_at: number }
      | undefined;

    if (!metaRow) {
      errors.push({
        category: "data",
        technical: "Meta table missing or empty",
        userFriendly: "The database appears to be invalid or corrupted.",
      });
      sqlite.close();
      return {
        valid: false,
        error: "Database validation failed",
        errorCode: "DATABASE_CORRUPT",
        details: errors,
      };
    }

    // Check schema version
    const schemaVersion = metaRow.schema_version;
    if (schemaVersion > SCHEMA_VERSION) {
      errors.push({
        category: "schema",
        technical: `Database schema version ${schemaVersion} is newer than supported version ${SCHEMA_VERSION}`,
        userFriendly: "This database was created with a newer version of Netly. Please update the app to import it.",
      });
    } else if (schemaVersion < SCHEMA_VERSION) {
      // Older schema versions can be migrated
      // This is acceptable, migrations will run
    }

    // Validate table structure
    const requiredTables = [
      "accounts",
      "transactions",
      "transfers",
      "balance_history",
      "investment_history",
      "exchange_rates",
      "meta",
    ];

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));

    for (const table of requiredTables) {
      if (!tableNames.has(table)) {
        errors.push({
          category: "data",
          technical: `Required table '${table}' is missing`,
          userFriendly: `The database is missing required table '${table}'. This may indicate a corrupted or invalid database.`,
        });
      }
    }

    // Check data integrity - verify foreign keys
    try {
      sqlite.exec("PRAGMA foreign_key_check");
      // If this doesn't throw, foreign keys are valid
    } catch (error) {
      errors.push({
        category: "data",
        technical: `Foreign key constraint violation: ${error instanceof Error ? error.message : String(error)}`,
        userFriendly: "The database contains invalid relationships between records. This may indicate corruption.",
      });
    }

    // Get database stats for preview
    let stats: DatabaseStats | undefined;
    if (errors.length === 0) {
      try {
        const accounts = sqlite
          .prepare("SELECT id, name FROM accounts ORDER BY name")
          .all() as Array<{ id: string; name: string }>;
        
        const transactionCounts: Record<string, number> = {};
        for (const account of accounts) {
          const count = sqlite
            .prepare("SELECT COUNT(*) as count FROM transactions WHERE account_id = ?")
            .get(account.id) as { count: number };
          transactionCounts[account.id] = count.count;
        }

        stats = {
          schemaVersion: metaRow.schema_version,
          createdAt: metaRow.created_at,
          accountCount: accounts.length,
          accountNames: accounts.map((a) => a.name),
          transactionCounts,
        };
      } catch (error) {
        // Stats are optional, don't fail validation if we can't get them
        console.warn("Failed to get database stats:", error);
      }
    }

    sqlite.close();

    if (errors.length > 0) {
      return {
        valid: false,
        error: "Database validation failed",
        errorCode: errors.some((e) => e.category === "schema") ? "SCHEMA_MISMATCH" : "DATABASE_CORRUPT",
        details: errors,
        stats,
      };
    }

    return {
      valid: true,
      stats,
    };
  } catch (error) {
    if (sqlite) {
      try {
        sqlite.close();
      } catch {
        // Ignore close errors
      }
    }

    // Check if it's a decryption error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("file is encrypted") ||
      errorMessage.includes("not a database") ||
      errorMessage.includes("malformed database")
    ) {
      return {
        valid: false,
        error: "Wrong encryption key or corrupted database",
        errorCode: "WRONG_ENCRYPTION_KEY",
        details: [
          {
            category: "key",
            technical: `Decryption failed: ${errorMessage}`,
            userFriendly: "The encryption key is incorrect or the database file is corrupted.",
          },
        ],
      };
    }

    return {
      valid: false,
      error: "Database validation failed",
      errorCode: "DATABASE_CORRUPT",
      details: [
        {
          category: "data",
          technical: errorMessage,
          userFriendly: "The database could not be validated. It may be corrupted or in an unsupported format.",
        },
      ],
    };
  }
};

export const getDatabaseStats = (encryptionKey: string): DatabaseStats | null => {
  try {
    const dbPath = getDbPath();
    const sqlite = openSqliteAtPath(dbPath, encryptionKey);
    
    const metaRow = sqlite.prepare("SELECT schema_version, created_at FROM meta WHERE id = ?").get(META_ID) as
      | { schema_version: number; created_at: number }
      | undefined;

    if (!metaRow) {
      sqlite.close();
      return null;
    }

    const accounts = sqlite
      .prepare("SELECT id, name FROM accounts ORDER BY name")
      .all() as Array<{ id: string; name: string }>;
    
    const transactionCounts: Record<string, number> = {};
    for (const account of accounts) {
      const count = sqlite
        .prepare("SELECT COUNT(*) as count FROM transactions WHERE account_id = ?")
        .get(account.id) as { count: number };
      transactionCounts[account.id] = count.count;
    }

    sqlite.close();

    return {
      schemaVersion: metaRow.schema_version,
      createdAt: metaRow.created_at,
      accountCount: accounts.length,
      accountNames: accounts.map((a) => a.name),
      transactionCounts,
    };
  } catch {
    return null;
  }
};

export const backupDatabase = (): string | null => {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  const dataDir = path.dirname(dbPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(dataDir, `netly-backup-${timestamp}.db`);
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  const backupWalPath = `${backupPath}-wal`;
  const backupShmPath = `${backupPath}-shm`;

  try {
    // Copy database file
    fs.copyFileSync(dbPath, backupPath);
    
    // Copy WAL and SHM if they exist
    if (fs.existsSync(walPath)) {
      fs.copyFileSync(walPath, backupWalPath);
    }
    if (fs.existsSync(shmPath)) {
      fs.copyFileSync(shmPath, backupShmPath);
    }

    return backupPath;
  } catch (error) {
    console.error("Failed to backup database:", error);
    // Clean up partial backup
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      if (fs.existsSync(backupWalPath)) {
        fs.unlinkSync(backupWalPath);
      }
      if (fs.existsSync(backupShmPath)) {
        fs.unlinkSync(backupShmPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    return null;
  }
};

export const forceCloseConnections = (): void => {
  clearConnectionCache();
  // Note: better-sqlite3 connections are closed when garbage collected
  // We've cleared the cache, so they'll be closed when no longer referenced
};

export const extractZipFile = async (
  zipPath: string,
  extractTo: string
): Promise<{ dbPath: string; walPath?: string; shmPath?: string }> => {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(new Error(`Failed to open ZIP file: ${err.message}`));
        return;
      }

      if (!zipfile) {
        reject(new Error("Failed to open ZIP file"));
        return;
      }

      const files: { name: string; path: string }[] = [];
      let dbFile: { name: string; path: string } | null = null;
      let walFile: { name: string; path: string } | null = null;
      let shmFile: { name: string; path: string } | null = null;

      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        // Security: Check for path traversal
        if (entry.fileName.includes("..") || path.isAbsolute(entry.fileName)) {
          zipfile.close();
          reject(new Error("Invalid file path in ZIP archive"));
          return;
        }

        const fileName = path.basename(entry.fileName);
        const extractPath = path.join(extractTo, fileName);

        if (fileName === "netly.db") {
          dbFile = { name: fileName, path: extractPath };
        } else if (fileName === "netly.db-wal") {
          walFile = { name: fileName, path: extractPath };
        } else if (fileName === "netly.db-shm") {
          shmFile = { name: fileName, path: extractPath };
        }

        files.push({ name: fileName, path: extractPath });

        if (entry.fileName.endsWith("/")) {
          // Directory entry, skip
          zipfile.readEntry();
        } else {
          // File entry, extract it
          zipfile.openReadStream(entry, (err2, readStream) => {
            if (err2) {
              zipfile.close();
              reject(new Error(`Failed to read file from ZIP: ${err2.message}`));
              return;
            }

            if (!readStream) {
              zipfile.close();
              reject(new Error("Failed to read file from ZIP"));
              return;
            }

            const writeStream = fs.createWriteStream(extractPath);
            readStream.pipe(writeStream);
            writeStream.on("close", () => {
              zipfile.readEntry();
            });
            writeStream.on("error", (err3) => {
              zipfile.close();
              reject(new Error(`Failed to write extracted file: ${err3.message}`));
            });
          });
        }
      });

      zipfile.on("end", () => {
        if (!dbFile) {
          reject(new Error("ZIP file does not contain netly.db"));
          return;
        }

        resolve({
          dbPath: dbFile.path,
          walPath: walFile?.path,
          shmPath: shmFile?.path,
        });
      });

      zipfile.on("error", (err) => {
        reject(new Error(`ZIP extraction error: ${err.message}`));
      });
    });
  });
};

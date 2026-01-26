import { NextRequest } from "next/server";
import fs from "fs/promises";
import { clearConnectionCache, dbFileExists, getDbPath, validateKey } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";

const deleteFileIfExists = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }
};

export const DELETE = async (request: NextRequest): Promise<Response> => {
  try {
    const { key } = await request.json();

    if (!key || !validateEncryptionKey(key)) {
      return Response.json({ error: "Invalid encryption key" }, { status: 401 });
    }

    if (!dbFileExists()) {
      return Response.json({ error: "Database not initialized" }, { status: 400 });
    }

    if (!validateKey(key)) {
      return Response.json({ error: "Invalid encryption key" }, { status: 401 });
    }

    const dbPath = getDbPath();
    await deleteFileIfExists(dbPath);
    await deleteFileIfExists(`${dbPath}-wal`);
    await deleteFileIfExists(`${dbPath}-shm`);

    clearConnectionCache();

    return Response.json({ success: true });
  } catch (error) {
    console.error("Database deletion failed:", error);
    return Response.json({ error: "Database deletion failed" }, { status: 500 });
  }
};

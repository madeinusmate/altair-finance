import { NextRequest } from "next/server";
import fs from "fs/promises";
import { beginAuthVerifyAttempt } from "@/lib/auth-verify-rate-limit";
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

const tooManyAttempts = (retryAfterSeconds: number): Response => {
  return Response.json(
    { error: `Too many attempts. Try again in ${retryAfterSeconds} seconds.` },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
};

export const DELETE = async (request: NextRequest): Promise<Response> => {
  let success = false;
  let attempt: ReturnType<typeof beginAuthVerifyAttempt> | null = null;

  try {
    const { key } = await request.json();

    if (!key || !validateEncryptionKey(key)) {
      return Response.json({ error: "Invalid encryption key" }, { status: 401 });
    }

    attempt = beginAuthVerifyAttempt();
    if (!attempt.ok) {
      return tooManyAttempts(attempt.retryAfterSeconds);
    }

    if (!dbFileExists() || !validateKey(key)) {
      return Response.json({ error: "Invalid encryption key" }, { status: 401 });
    }

    success = true;
    const dbPath = getDbPath();
    await deleteFileIfExists(dbPath);
    await deleteFileIfExists(`${dbPath}-wal`);
    await deleteFileIfExists(`${dbPath}-shm`);

    clearConnectionCache();
    return Response.json({ success: true });
  } catch (error) {
    console.error("Database deletion failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Database deletion failed" }, { status: 500 });
  } finally {
    if (attempt?.ok) {
      attempt.finish(success);
    }
  }
};

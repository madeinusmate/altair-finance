import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import { beginAuthVerifyAttempt } from "@/lib/auth-verify-rate-limit";
import { getOwnerPassphrase, setOwnerPassphrase } from "@/lib/books-owner";
import { clearConnectionCache, databaseFilesIn, dbFileExists, getDbPath, validateKey } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";
import { confirmIntent } from "@/lib/intent-confirm";

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
    let provided: string | undefined;
    try {
      const body = (await request.json()) as { key?: unknown };
      provided = typeof body?.key === "string" ? body.key : undefined;
    } catch {
      provided = undefined;
    }

    const ownerKey = getOwnerPassphrase();
    if (ownerKey && provided && provided !== ownerKey) {
      return Response.json({ error: "Invalid encryption key" }, { status: 401 });
    }

    const key = ownerKey ?? provided;
    if (!key || !validateEncryptionKey(key)) {
      return Response.json({ error: "Invalid encryption key" }, { status: 401 });
    }

    const confirmation = await confirmIntent("delete-books");
    if (!confirmation.ok) {
      return Response.json({ error: confirmation.error }, { status: confirmation.status });
    }

    attempt = beginAuthVerifyAttempt();
    if (!attempt.ok) {
      return tooManyAttempts(attempt.retryAfterSeconds);
    }

    if (!dbFileExists() || !validateKey(key)) {
      return Response.json({ error: "Invalid encryption key" }, { status: 401 });
    }

    success = true;
    // Remove both names so a leftover netly.db cannot reopen the books after delete.
    for (const filePath of databaseFilesIn(path.dirname(getDbPath()))) {
      await deleteFileIfExists(filePath);
    }

    clearConnectionCache();
    setOwnerPassphrase(null);
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

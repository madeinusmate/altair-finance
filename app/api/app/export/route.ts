import { NextRequest } from "next/server";
import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import fs from "fs";
import path from "path";
import { beginAuthVerifyAttempt } from "@/lib/auth-verify-rate-limit";
import { getOwnerPassphrase } from "@/lib/books-owner";
import { getDbPath, dbFileExists, validateKey } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";
import { confirmIntent } from "@/lib/intent-confirm";

const getTimestamp = (): string => {
  return new Date().toISOString().slice(0, 10);
};

export const POST = async (request: NextRequest): Promise<Response> => {
  const ownerKey = getOwnerPassphrase();
  const headerKey = request.headers.get("X-Encryption-Key");
  if (ownerKey && headerKey && headerKey !== ownerKey) {
    return Response.json({ error: "Missing or invalid encryption key" }, { status: 401 });
  }

  const key = ownerKey ?? headerKey;
  if (!key || !validateEncryptionKey(key)) {
    return Response.json({ error: "Missing or invalid encryption key" }, { status: 401 });
  }

  const confirmation = await confirmIntent("export-books");
  if (!confirmation.ok) {
    return Response.json({ error: confirmation.error }, { status: confirmation.status });
  }

  const attempt = beginAuthVerifyAttempt();
  if (!attempt.ok) {
    return Response.json(
      { error: `Too many attempts. Try again in ${attempt.retryAfterSeconds} seconds.` },
      {
        status: 429,
        headers: { "Retry-After": String(attempt.retryAfterSeconds) },
      }
    );
  }

  if (!dbFileExists() || !validateKey(key)) {
    attempt.finish(false);
    return Response.json({ error: "Missing or invalid encryption key" }, { status: 401 });
  }
  attempt.finish(true);

  const dbPath = getDbPath();
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  archive.pipe(stream);

  archive.file(dbPath, { name: path.basename(dbPath) });
  if (fs.existsSync(walPath)) {
    archive.file(walPath, { name: path.basename(walPath) });
  }
  if (fs.existsSync(shmPath)) {
    archive.file(shmPath, { name: path.basename(shmPath) });
  }

  const filename = `netly-backup-${getTimestamp()}.zip`;

  void archive.finalize();

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
};

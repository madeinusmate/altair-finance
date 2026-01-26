import { NextRequest } from "next/server";
import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import fs from "fs";
import path from "path";
import { getDbPath, dbFileExists } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

const getTimestamp = (): string => {
  return new Date().toISOString().slice(0, 10);
};

export const POST = async (request: NextRequest): Promise<Response> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return Response.json({ error: "Missing or invalid encryption key" }, { status: 401 });
  }

  if (!dbFileExists()) {
    return Response.json({ error: "Database not initialized" }, { status: 400 });
  }

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

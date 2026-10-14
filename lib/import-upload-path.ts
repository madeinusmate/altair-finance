import { chmod, mkdtemp } from "fs/promises";
import os from "os";
import path from "path";

export const IMPORT_ZIP_FILENAME = "upload.zip";

// True when the browser-supplied name is not a single plain file name.
export const isUnsafeUploadName = (name: string): boolean => {
  if (!name || name.includes("\0")) return true;
  if (name !== path.basename(name)) return true;
  if (name === "." || name === ".." || name.includes("..")) return true;
  if (name.includes("/") || name.includes("\\")) return true;
  return false;
};

export const createImportTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "netly-import-"));
  await chmod(dir, 0o700);
  return dir;
};

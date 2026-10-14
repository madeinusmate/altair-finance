import { NextRequest, NextResponse } from "next/server";
import { getEncryptionKey } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!getEncryptionKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const debug: Record<string, unknown> = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    electronUserData: process.env.ELECTRON_USER_DATA || "(not set)",
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
    },
  };

  // Try to load the native module
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("better-sqlite3-multiple-ciphers");
    debug.sqliteModule = "loaded successfully";
    debug.sqliteModulePath = require.resolve("better-sqlite3-multiple-ciphers");
  } catch (error) {
    debug.sqliteModule = "failed to load";
    debug.sqliteError = error instanceof Error ? error.message : String(error);
    debug.sqliteStack = error instanceof Error ? error.stack : undefined;
  }

  // Try to check fs access
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const electronUserData = process.env.ELECTRON_USER_DATA;
    
    if (electronUserData) {
      debug.userDataExists = fs.existsSync(electronUserData);
      debug.userDataContents = fs.existsSync(electronUserData) 
        ? fs.readdirSync(electronUserData) 
        : [];
    }
  } catch (error) {
    debug.fsError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(debug, { status: 200 });
};

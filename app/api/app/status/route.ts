import { NextRequest, NextResponse } from "next/server";
import { dbFileExists, validateKey } from "@/lib/db";

// Force dynamic to ensure environment variables are read at runtime
export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const key = request.headers.get("X-Encryption-Key");
    
    console.log("[API /app/status] Checking database status...");
    console.log("[API /app/status] ELECTRON_USER_DATA:", process.env.ELECTRON_USER_DATA || "(not set)");
    
    const dbExists = dbFileExists();
    console.log("[API /app/status] dbExists:", dbExists);

    if (!dbExists) {
      return NextResponse.json({ state: "new", dbExists });
    }

    if (!key) {
      return NextResponse.json({ state: "locked", dbExists });
    }

    const isValid = validateKey(key);
    if (isValid) {
      return NextResponse.json({ state: "unlocked", dbExists });
    }

    return NextResponse.json({ state: "corrupt", dbExists });
  } catch (error) {
    console.error("[API /app/status] Error:", error);
    // On error, return "new" state to allow setup rather than showing unlock
    return NextResponse.json({ 
      state: "new", 
      dbExists: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
};

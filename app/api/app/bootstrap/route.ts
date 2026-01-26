import { NextRequest, NextResponse } from "next/server";
import { dbFileExists, initializeDb, getDbPath } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";

// Force dynamic to ensure environment variables are read at runtime
export const dynamic = "force-dynamic";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  try {
    console.log("[API /app/bootstrap] Starting bootstrap...");
    console.log("[API /app/bootstrap] ELECTRON_USER_DATA:", process.env.ELECTRON_USER_DATA || "(not set)");
    console.log("[API /app/bootstrap] DB path:", getDbPath());
    
    const { key } = await request.json();

    if (!key || !validateEncryptionKey(key)) {
      return NextResponse.json(
        { success: false, error: "Invalid key format. Key must be at least 8 characters." },
        { status: 400 }
      );
    }

    const exists = dbFileExists();
    console.log("[API /app/bootstrap] DB exists:", exists);
    
    if (exists) {
      return NextResponse.json(
        { success: false, error: "Database already exists." },
        { status: 409 }
      );
    }

    console.log("[API /app/bootstrap] Initializing database...");
    initializeDb(key);
    console.log("[API /app/bootstrap] Database initialized successfully");
    
    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("[API /app/bootstrap] Bootstrap error:", errorMessage);
    console.error("[API /app/bootstrap] Stack:", errorStack);
    return NextResponse.json(
      { success: false, error: `Bootstrap failed: ${errorMessage}` },
      { status: 500 }
    );
  }
};

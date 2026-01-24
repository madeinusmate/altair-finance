import { NextRequest, NextResponse } from "next/server";
import { getDb, initializeDb } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const { key } = await request.json();

    if (!key || !validateEncryptionKey(key)) {
      return NextResponse.json(
        { valid: false, error: "Invalid key format. Key must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Try to initialize and access the database
    try {
      initializeDb(key);
      const db = getDb(key);
      // The database is now initialized
      return NextResponse.json({ valid: true });
    } catch (error) {
      console.error("Key verification failed:", error);
      return NextResponse.json(
        { valid: false, error: "Invalid encryption key" },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error("Auth verification error:", error);
    return NextResponse.json(
      { valid: false, error: "Verification failed" },
      { status: 500 }
    );
  }
};

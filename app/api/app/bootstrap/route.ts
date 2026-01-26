import { NextRequest, NextResponse } from "next/server";
import { dbFileExists, initializeDb } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const { key } = await request.json();

    if (!key || !validateEncryptionKey(key)) {
      return NextResponse.json(
        { success: false, error: "Invalid key format. Key must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (dbFileExists()) {
      return NextResponse.json(
        { success: false, error: "Database already exists." },
        { status: 409 }
      );
    }

    initializeDb(key);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bootstrap error:", error);
    return NextResponse.json(
      { success: false, error: "Bootstrap failed." },
      { status: 500 }
    );
  }
};

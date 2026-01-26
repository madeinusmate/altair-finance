import { NextRequest, NextResponse } from "next/server";
import { dbFileExists, validateKey } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";

// Force dynamic to ensure environment variables are read at runtime
export const dynamic = "force-dynamic";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const { key } = await request.json();

    if (!key || !validateEncryptionKey(key)) {
      return NextResponse.json(
        { valid: false, error: "Invalid key format. Key must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (!dbFileExists()) {
      return NextResponse.json(
        { valid: false, error: "Database not initialized." },
        { status: 400 }
      );
    }

    const isValid = validateKey(key);
    if (!isValid) {
      return NextResponse.json(
        { valid: false, error: "Invalid encryption key" },
        { status: 401 }
      );
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Auth verification error:", error);
    return NextResponse.json(
      { valid: false, error: "Verification failed" },
      { status: 500 }
    );
  }
};

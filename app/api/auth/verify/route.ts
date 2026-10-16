import { NextRequest, NextResponse } from "next/server";
import { dbFileExists, validateKey } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";
import { beginAuthVerifyAttempt } from "@/lib/auth-verify-rate-limit";

// Force dynamic to ensure environment variables are read at runtime
export const dynamic = "force-dynamic";

const tooManyAttempts = (retryAfterSeconds: number): NextResponse => {
  return NextResponse.json(
    { valid: false, error: `Too many attempts. Try again in ${retryAfterSeconds} seconds.` },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const attempt = beginAuthVerifyAttempt();
  if (!attempt.ok) {
    return tooManyAttempts(attempt.retryAfterSeconds);
  }

  let success = false;
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

    success = true;
    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Auth verification error:", error);
    return NextResponse.json(
      { valid: false, error: "Verification failed" },
      { status: 500 }
    );
  } finally {
    attempt.finish(success);
  }
};

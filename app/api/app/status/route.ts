import { NextRequest, NextResponse } from "next/server";
import { beginAuthVerifyAttempt } from "@/lib/auth-verify-rate-limit";
import { getOwnerPassphrase } from "@/lib/books-owner";
import { dbFileExists, validateKey } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const dbExists = dbFileExists();
    if (!dbExists) {
      return NextResponse.json({ state: "new", dbExists, booksOwner: false });
    }

    const ownerKey = getOwnerPassphrase();
    if (ownerKey && validateEncryptionKey(ownerKey) && validateKey(ownerKey)) {
      return NextResponse.json({ state: "unlocked", dbExists, booksOwner: true });
    }

    const key = request.headers.get("X-Encryption-Key");
    if (!key) {
      return NextResponse.json({ state: "locked", dbExists });
    }

    const attempt = beginAuthVerifyAttempt();
    if (!attempt.ok) {
      return NextResponse.json(
        { state: "locked", dbExists },
        {
          status: 429,
          headers: { "Retry-After": String(attempt.retryAfterSeconds) },
        }
      );
    }

    const isValid = validateEncryptionKey(key) && validateKey(key);
    attempt.finish(isValid);
    return NextResponse.json({ state: isValid ? "unlocked" : "locked", dbExists });
  } catch (error) {
    console.error("[API /app/status] Error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({
      state: "locked",
      dbExists: dbFileExists(),
    });
  }
};

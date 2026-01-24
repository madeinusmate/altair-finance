import { NextRequest, NextResponse } from "next/server";
import { getDb, initializeDb } from "./db";
import { validateEncryptionKey } from "./encryption";

export const getEncryptionKey = (request: NextRequest): string | null => {
  const key = request.headers.get("X-Encryption-Key");
  if (!key || !validateEncryptionKey(key)) {
    return null;
  }
  return key;
};

export const withDb = async <T>(
  request: NextRequest,
  handler: (db: ReturnType<typeof getDb>, key: string) => Promise<T>
): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  
  if (!key) {
    return NextResponse.json(
      { error: "Missing or invalid encryption key" },
      { status: 401 }
    );
  }

  try {
    // Initialize DB if needed
    initializeDb(key);
    const db = getDb(key);
    const result = await handler(db, key);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Database operation failed" },
      { status: 500 }
    );
  }
};

export const formatDate = (date: Date): number => {
  return Math.floor(date.getTime() / 1000);
};

export const parseDate = (timestamp: number): Date => {
  return new Date(timestamp * 1000);
};

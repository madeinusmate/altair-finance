import { NextRequest, NextResponse } from "next/server";
import { dbFileExists, validateKey } from "@/lib/db";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = request.headers.get("X-Encryption-Key");
  const dbExists = dbFileExists();

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
};

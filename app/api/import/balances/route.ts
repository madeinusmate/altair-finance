import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { commitBalanceImport } from "@/lib/import/commit-balance-import";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const db = getDb(key);
    const result = await commitBalanceImport(db, body);
    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import balances";
    console.error("Error importing balances:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

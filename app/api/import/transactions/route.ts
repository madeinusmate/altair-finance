import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { commitTransactionImport } from "@/lib/import/commit-transaction-import";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const db = getDb(key);
    const result = await commitTransactionImport(db, body);
    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import transactions";
    console.error("Error importing transactions:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

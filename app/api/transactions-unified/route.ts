import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { listTransactions, listTransfers } from "@/lib/db/ledger-rows";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const db = getDb(key);

    const [transactions, transfers] = await Promise.all([
      Promise.resolve(listTransactions(db, accountId)),
      Promise.resolve(listTransfers(db, accountId)),
    ]);

    return NextResponse.json({ transactions, transfers });
  } catch (error) {
    console.error("Error fetching unified transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
};

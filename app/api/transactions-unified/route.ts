import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { listClientTransactions, listClientTransfers } from "@/lib/db/ledger-read";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId") ?? undefined;
    const db = getDb(key);
    const filter = accountId ? { accountId } : undefined;
    const [transactions, transfers] = await Promise.all([
      Promise.resolve(listClientTransactions(db, filter)),
      Promise.resolve(listClientTransfers(db, filter)),
    ]);

    return NextResponse.json({ transactions, transfers });
  } catch (error) {
    console.error("Error fetching unified transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
};

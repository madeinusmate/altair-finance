import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

// GET unified transactions and transfers
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const db = getDb(key);

    // Fetch transactions and transfers in parallel
    const [transactions, transfers] = await Promise.all([
      (async () => {
        if (accountId) {
          return db
            .select()
            .from(schema.transactions)
            .where(eq(schema.transactions.accountId, accountId))
            .orderBy(desc(schema.transactions.date))
            .all();
        } else {
          return db
            .select()
            .from(schema.transactions)
            .orderBy(desc(schema.transactions.date))
            .all();
        }
      })(),
      (async () => {
        if (accountId) {
          // For transfers, only show if fromAccountId matches (per user requirement)
          return db
            .select()
            .from(schema.transfers)
            .where(eq(schema.transfers.fromAccountId, accountId))
            .orderBy(desc(schema.transfers.date))
            .all();
        } else {
          return db
            .select()
            .from(schema.transfers)
            .orderBy(desc(schema.transfers.date))
            .all();
        }
      })(),
    ]);

    return NextResponse.json({ transactions, transfers });
  } catch (error) {
    console.error("Error fetching unified transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
};

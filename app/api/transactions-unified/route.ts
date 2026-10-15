import { NextRequest, NextResponse } from "next/server";
import { eq, or, desc } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
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
        const query = db
          .select({
            ...getTableColumns(schema.transactions),
            payeeName: schema.payees.name,
          })
          .from(schema.transactions)
          .leftJoin(schema.payees, eq(schema.transactions.payeeId, schema.payees.id));
        if (accountId) {
          return query
            .where(eq(schema.transactions.accountId, accountId))
            .orderBy(desc(schema.transactions.date))
            .all();
        }
        return query.orderBy(desc(schema.transactions.date)).all();
      })(),
      (async () => {
        if (accountId) {
          // For transfers, show if either fromAccountId or toAccountId matches
          // This allows account detail pages to show all transfers involving the account
          return db
            .select()
            .from(schema.transfers)
            .where(
              or(
                eq(schema.transfers.fromAccountId, accountId),
                eq(schema.transfers.toAccountId, accountId)
              )
            )
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

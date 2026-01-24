import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, initializeDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

type ImportBalanceRow = {
  accountId: string;
  balance: number;
  date: string;
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as ImportBalanceRow[]) : null;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Rows are required" }, { status: 400 });
    }

    initializeDb(key);
    const db = getDb(key);
    const accounts = db.select().from(schema.accounts).all();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const now = new Date();
    let balanceCount = 0;
    let investmentCount = 0;

    rows.forEach((row, index) => {
      if (!row.balance || row.balance <= 0) {
        throw new Error(`Row ${index + 1}: Balance must be a positive number`);
      }
      if (!row.date) {
        throw new Error(`Row ${index + 1}: Date is required`);
      }
      const parsedDate = new Date(row.date);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error(`Row ${index + 1}: Invalid date`);
      }

      const account = accountMap.get(row.accountId);
      if (!account) {
        throw new Error(`Row ${index + 1}: Account not found`);
      }

      if (account.type === "balance") {
        db.insert(schema.balanceHistory)
          .values({
            id: uuidv4(),
            accountId: account.id,
            balance: Number(row.balance),
            date: parsedDate,
            createdAt: now,
          })
          .run();
        balanceCount += 1;
      } else if (account.type === "investment") {
        db.insert(schema.investmentHistory)
          .values({
            id: uuidv4(),
            accountId: account.id,
            balance: Number(row.balance),
            date: parsedDate,
            createdAt: now,
          })
          .run();
        investmentCount += 1;
      } else {
        throw new Error(`Row ${index + 1}: Account is not a balance or investment account`);
      }
    });

    return NextResponse.json({
      success: true,
      balances: balanceCount,
      investments: investmentCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import balances";
    const status = message.startsWith("Row ") ? 400 : 500;
    console.error("Error importing balances:", error);
    return NextResponse.json({ error: message }, { status });
  }
};

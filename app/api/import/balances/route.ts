import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
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
    const filename = body?.filename as string | undefined;
    const fileHash = body?.fileHash as string | undefined;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Rows are required" }, { status: 400 });
    }

    const db = getDb(key);
    const accounts = db.select().from(schema.accounts).all();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const now = new Date();
    let balanceCount = 0;
    let investmentCount = 0;

    // Create import record if filename and fileHash are provided
    let importId: string | undefined;
    let isDuplicate = false;
    
    if (filename && fileHash) {
      try {
        // Check for duplicate file hash
        const existingImport = db
          .select()
          .from(schema.imports)
          .where(eq(schema.imports.fileHash, fileHash))
          .get();
        
        if (existingImport) {
          isDuplicate = true;
          // Warn but allow import - create new import record
        }

        importId = uuidv4();
        const validRows = rows.filter((row) => {
          // Basic validation - will be validated again below
          return row.accountId && row.balance > 0 && row.date;
        });

        db.insert(schema.imports)
          .values({
            id: importId,
            type: "balances",
            filename: filename,
            fileHash: fileHash,
            rowCount: validRows.length,
            createdAt: now,
          })
          .run();
      } catch (error) {
        console.warn("Failed to create import record:", error);
        // Continue without import tracking - import should still proceed
        importId = undefined;
      }
    }

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
            importId: importId || null,
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
            importId: importId || null,
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
      importId: importId || null,
      isDuplicate: isDuplicate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import balances";
    const status = message.startsWith("Row ") ? 400 : 500;
    console.error("Error importing balances:", error);
    return NextResponse.json({ error: message }, { status });
  }
};

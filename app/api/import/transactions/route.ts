import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidTransactionCategory, isValidTransactionCategoryForType } from "@/lib/db/category-helpers";
import { resolvePayeeId } from "@/lib/payees/assign";

type ImportTransactionRow =
  | {
      type: "debit" | "credit";
      accountId: string;
      category: string;
      amount: number;
      description?: string | null;
      payeeName?: string | null;
      date: string;
    }
  | {
      type: "transfer";
      fromAccountId: string;
      toAccountId: string;
      fromAmount: number;
      toAmount: number;
      description?: string | null;
      date: string;
    };

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as ImportTransactionRow[]) : null;
    const filename = body?.filename as string | undefined;
    const fileHash = body?.fileHash as string | undefined;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Rows are required" }, { status: 400 });
    }

    const db = getDb(key);
    const accounts = db.select().from(schema.accounts).all();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const now = new Date();
    let transactionCount = 0;
    let transferCount = 0;

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
          if (row.type === "transfer") {
            return row.fromAccountId && row.toAccountId && row.fromAmount > 0 && row.toAmount > 0 && row.date;
          } else {
            return row.accountId && row.amount > 0 && row.date && row.category;
          }
        });

        db.insert(schema.imports)
          .values({
            id: importId,
            type: "transactions",
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
      if (row.type !== "transfer" && (!row.amount || row.amount <= 0)) {
        throw new Error(`Row ${index + 1}: Amount must be a positive number`);
      }
      if (row.type === "transfer" && (!row.fromAmount || row.fromAmount <= 0 || !row.toAmount || row.toAmount <= 0)) {
        throw new Error(`Row ${index + 1}: Both fromAmount and toAmount must be positive numbers`);
      }
      if (!row.date) {
        throw new Error(`Row ${index + 1}: Date is required`);
      }
      const parsedDate = new Date(row.date);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error(`Row ${index + 1}: Invalid date`);
      }

      if (row.type === "transfer") {
        const fromAccount = accountMap.get(row.fromAccountId);
        const toAccount = accountMap.get(row.toAccountId);
        if (!fromAccount || !toAccount) {
          throw new Error(`Row ${index + 1}: Transfer accounts not found`);
        }
        if (fromAccount.id === toAccount.id) {
          throw new Error(`Row ${index + 1}: Transfer accounts must be different`);
        }
        if (fromAccount.type === "balance" || toAccount.type === "balance") {
          throw new Error(`Row ${index + 1}: Transfers cannot use balance accounts`);
        }

        // Validate same-currency transfers: amounts must be equal
        if (fromAccount.currency === toAccount.currency) {
          if (row.fromAmount !== row.toAmount) {
            throw new Error(`Row ${index + 1}: For same-currency transfers, fromAmount and toAmount must be equal`);
          }
        }

        // Calculate exchange rate
        const exchangeRate = fromAccount.currency !== toAccount.currency 
          ? row.toAmount / row.fromAmount 
          : null;

        db.insert(schema.transfers)
          .values({
            id: uuidv4(),
            fromAccountId: fromAccount.id,
            toAccountId: toAccount.id,
            amount: Number(row.fromAmount), // Keep for backward compatibility
            fromAmount: Number(row.fromAmount),
            toAmount: Number(row.toAmount),
            exchangeRate: exchangeRate,
            description: row.description || null,
            date: parsedDate,
            createdAt: now,
            importId: importId || null,
          })
          .run();
        transferCount += 1;
      } else {
        const account = accountMap.get(row.accountId);
        if (!account) {
          throw new Error(`Row ${index + 1}: Account not found`);
        }
        if (account.type !== "transaction") {
          throw new Error(`Row ${index + 1}: Transactions must use transaction accounts`);
        }
        if (!["debit", "credit"].includes(row.type)) {
          throw new Error(`Row ${index + 1}: Type must be debit or credit`);
        }
        if (!row.category || !isValidTransactionCategory(db, row.category)) {
          const validCategories = db.select().from(schema.transactionCategories).all();
          const categoryNames = validCategories.map((c) => c.name).join(", ");
          throw new Error(`Row ${index + 1}: Invalid category. Valid categories: ${categoryNames}`);
        }
        // Validate category matches transaction type (flag for review, don't reject)
        if (!isValidTransactionCategoryForType(db, row.category, row.type as "debit" | "credit")) {
          // This is a warning, not an error - we'll still import but flag it
          console.warn(`Row ${index + 1}: Category "${row.category}" does not match transaction type "${row.type}"`);
        }

        db.insert(schema.transactions)
          .values({
            id: uuidv4(),
            accountId: account.id,
            type: row.type,
            category: row.category,
            amount: Number(row.amount),
            description: row.description || null,
            payeeId: resolvePayeeId(db, row.payeeName),
            date: parsedDate,
            createdAt: now,
            importId: importId || null,
          })
          .run();
        transactionCount += 1;
      }
    });

    return NextResponse.json({
      success: true,
      transactions: transactionCount,
      transfers: transferCount,
      importId: importId || null,
      isDuplicate: isDuplicate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import transactions";
    const status = message.startsWith("Row ") ? 400 : 500;
    console.error("Error importing transactions:", error);
    return NextResponse.json({ error: message }, { status });
  }
};

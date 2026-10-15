import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidCategoryIdForType } from "@/lib/db/category-helpers";

type ImportTransactionRow =
  | {
      type: "debit" | "credit";
      accountId: string;
      category: string;
      amount: number;
      description?: string | null;
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
    const categories = db.select().from(schema.transactionCategories).all();
    const categoryByName = new Map(categories.map((category) => [category.name, category]));
    const transferCategory = categoryByName.get("Transfer");
    const categoryNames = categories.map((category) => category.name).join(", ");

    const now = new Date();
    const preparedTransactions: Array<{
      accountId: string;
      type: "debit" | "credit";
      category: string;
      categoryId: number;
      amount: number;
      description: string | null;
      date: Date;
    }> = [];
    const preparedTransfers: Array<{
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      fromAmount: number;
      toAmount: number;
      exchangeRate: number | null;
      category: string;
      categoryId: number;
      description: string | null;
      date: Date;
    }> = [];

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
        if (fromAccount.currency === toAccount.currency && row.fromAmount !== row.toAmount) {
          throw new Error(`Row ${index + 1}: For same-currency transfers, fromAmount and toAmount must be equal`);
        }
        if (!transferCategory || transferCategory.transactionType !== null) {
          throw new Error(`Row ${index + 1}: Transfer category is missing`);
        }

        const exchangeRate = fromAccount.currency !== toAccount.currency
          ? row.toAmount / row.fromAmount
          : null;

        preparedTransfers.push({
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          amount: Number(row.fromAmount),
          fromAmount: Number(row.fromAmount),
          toAmount: Number(row.toAmount),
          exchangeRate,
          category: transferCategory.name,
          categoryId: transferCategory.id,
          description: row.description || null,
          date: parsedDate,
        });
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
        const category = row.category ? categoryByName.get(row.category) : undefined;
        if (!category) {
          throw new Error(`Row ${index + 1}: Invalid category. Valid categories: ${categoryNames}`);
        }
        if (!isValidCategoryIdForType(db, category.id, row.type)) {
          throw new Error(`Row ${index + 1}: Category "${row.category}" does not match transaction type "${row.type}"`);
        }

        preparedTransactions.push({
          accountId: account.id,
          type: row.type,
          category: category.name,
          categoryId: category.id,
          amount: Number(row.amount),
          description: row.description || null,
          date: parsedDate,
        });
      }
    });

    let importId: string | undefined;
    let isDuplicate = false;

    if (filename && fileHash) {
      const existingImport = db
        .select()
        .from(schema.imports)
        .where(eq(schema.imports.fileHash, fileHash))
        .get();
      if (existingImport) {
        isDuplicate = true;
      }
      importId = uuidv4();
    }

    db.transaction((tx) => {
      if (importId && filename && fileHash) {
        tx.insert(schema.imports)
          .values({
            id: importId,
            type: "transactions",
            filename,
            fileHash,
            rowCount: preparedTransactions.length + preparedTransfers.length,
            createdAt: now,
          })
          .run();
      }

      for (const row of preparedTransfers) {
        tx.insert(schema.transfers)
          .values({
            id: uuidv4(),
            fromAccountId: row.fromAccountId,
            toAccountId: row.toAccountId,
            amount: row.amount,
            fromAmount: row.fromAmount,
            toAmount: row.toAmount,
            exchangeRate: row.exchangeRate,
            category: row.category,
            categoryId: row.categoryId,
            description: row.description,
            date: row.date,
            createdAt: now,
            importId: importId || null,
          })
          .run();
      }

      for (const row of preparedTransactions) {
        tx.insert(schema.transactions)
          .values({
            id: uuidv4(),
            accountId: row.accountId,
            type: row.type,
            category: row.category,
            categoryId: row.categoryId,
            amount: row.amount,
            description: row.description,
            date: row.date,
            createdAt: now,
            importId: importId || null,
          })
          .run();
      }
    });

    const transactionCount = preparedTransactions.length;
    const transferCount = preparedTransfers.length;

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

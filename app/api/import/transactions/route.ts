import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidCategoryIdForType, isValidTransferCategoryId } from "@/lib/db/category-helpers";

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

type ResolvedTransaction = {
  accountId: string;
  type: "debit" | "credit";
  categoryId: number;
  categoryName: string;
  amount: number;
  description: string | null;
  date: Date;
};

type ResolvedTransfer = {
  fromAccountId: string;
  toAccountId: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number | null;
  categoryId: number;
  description: string | null;
  date: Date;
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

    const resolvedTransactions: ResolvedTransaction[] = [];
    const resolvedTransfers: ResolvedTransfer[] = [];

    rows.forEach((row, index) => {
      if (!row.date) {
        throw new Error(`Row ${index + 1}: Date is required`);
      }
      const parsedDate = new Date(row.date);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error(`Row ${index + 1}: Invalid date`);
      }

      if (row.type === "transfer") {
        if (!row.fromAmount || row.fromAmount <= 0 || !row.toAmount || row.toAmount <= 0) {
          throw new Error(`Row ${index + 1}: Both fromAmount and toAmount must be positive numbers`);
        }
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
        if (!transferCategory || !isValidTransferCategoryId(db, transferCategory.id)) {
          throw new Error(`Row ${index + 1}: Transfer category is not available`);
        }

        resolvedTransfers.push({
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          fromAmount: Number(row.fromAmount),
          toAmount: Number(row.toAmount),
          exchangeRate: fromAccount.currency !== toAccount.currency ? row.toAmount / row.fromAmount : null,
          categoryId: transferCategory.id,
          description: row.description || null,
          date: parsedDate,
        });
        return;
      }

      if (!row.amount || row.amount <= 0) {
        throw new Error(`Row ${index + 1}: Amount must be a positive number`);
      }
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
        const categoryNames = categories.map((item) => item.name).join(", ");
        throw new Error(`Row ${index + 1}: Invalid category. Valid categories: ${categoryNames}`);
      }
      if (!isValidCategoryIdForType(db, category.id, row.type)) {
        throw new Error(
          `Row ${index + 1}: Category "${row.category}" does not match transaction type "${row.type}"`
        );
      }

      resolvedTransactions.push({
        accountId: account.id,
        type: row.type,
        categoryId: category.id,
        categoryName: category.name,
        amount: Number(row.amount),
        description: row.description || null,
        date: parsedDate,
      });
    });

    const now = new Date();
    let importId: string | undefined;
    let isDuplicate = false;

    if (filename && fileHash) {
      try {
        const existingImport = db
          .select()
          .from(schema.imports)
          .where(eq(schema.imports.fileHash, fileHash))
          .get();
        if (existingImport) {
          isDuplicate = true;
        }

        importId = uuidv4();
        db.insert(schema.imports)
          .values({
            id: importId,
            type: "transactions",
            filename,
            fileHash,
            rowCount: resolvedTransactions.length + resolvedTransfers.length,
            createdAt: now,
          })
          .run();
      } catch (error) {
        console.warn("Failed to create import record:", error);
        importId = undefined;
      }
    }

    for (const row of resolvedTransfers) {
      db.insert(schema.transfers)
        .values({
          id: uuidv4(),
          fromAccountId: row.fromAccountId,
          toAccountId: row.toAccountId,
          amount: row.fromAmount,
          fromAmount: row.fromAmount,
          toAmount: row.toAmount,
          exchangeRate: row.exchangeRate,
          categoryId: row.categoryId,
          description: row.description,
          date: row.date,
          createdAt: now,
          importId: importId || null,
        })
        .run();
    }

    for (const row of resolvedTransactions) {
      db.insert(schema.transactions)
        .values({
          id: uuidv4(),
          accountId: row.accountId,
          type: row.type,
          category: row.categoryName,
          categoryId: row.categoryId,
          amount: row.amount,
          description: row.description,
          date: row.date,
          createdAt: now,
          importId: importId || null,
        })
        .run();
    }

    return NextResponse.json({
      success: true,
      transactions: resolvedTransactions.length,
      transfers: resolvedTransfers.length,
      importId: importId || null,
      isDuplicate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import transactions";
    const status = message.startsWith("Row ") ? 400 : 500;
    console.error("Error importing transactions:", error);
    return NextResponse.json({ error: message }, { status });
  }
};

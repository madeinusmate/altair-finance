import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/currencies";
import { ACCOUNT_CATEGORIES, isValidAccountCategory } from "@/lib/account-categories";

type ImportAccountRow = {
  name: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
  currency: string;
  initialBalance: number;
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as ImportAccountRow[]) : null;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Rows are required" }, { status: 400 });
    }

    const db = getDb(key);
    const existingAccounts = db.select().from(schema.accounts).all();
    const accountNameMap = new Map(
      existingAccounts.map((account) => [account.name.trim().toLowerCase(), account])
    );

    const now = new Date();
    let accountCount = 0;

    // Validate all rows before creating any accounts
    rows.forEach((row, index) => {
      if (!row.name || typeof row.name !== "string" || !row.name.trim()) {
        throw new Error(`Row ${index + 1}: Name is required`);
      }

      if (!row.type || !["balance", "transaction", "investment"].includes(row.type)) {
        throw new Error(`Row ${index + 1}: Type must be balance, transaction, or investment`);
      }

      if (!row.nature || !["asset", "liability"].includes(row.nature)) {
        throw new Error(`Row ${index + 1}: Nature must be asset or liability`);
      }

      // Investment accounts must be assets
      if (row.type === "investment" && row.nature !== "asset") {
        throw new Error(`Row ${index + 1}: Investment accounts must have nature 'asset'`);
      }

      if (!row.category || !isValidAccountCategory(row.category)) {
        throw new Error(
          `Row ${index + 1}: Category must be one of: ${ACCOUNT_CATEGORIES.join(", ")}`
        );
      }

      if (!row.currency || !isSupportedCurrency(row.currency)) {
        throw new Error(
          `Row ${index + 1}: Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`
        );
      }

      if (typeof row.initialBalance !== "number" || !Number.isFinite(row.initialBalance)) {
        throw new Error(`Row ${index + 1}: Initial balance must be a valid number`);
      }

      // Investment accounts must have 0 initial balance
      if (row.type === "investment" && row.initialBalance !== 0) {
        throw new Error(`Row ${index + 1}: Investment accounts must have initial balance of 0`);
      }

      // Check for duplicate account names
      const normalizedName = row.name.trim().toLowerCase();
      if (accountNameMap.has(normalizedName)) {
        throw new Error(`Row ${index + 1}: Account already exists: ${row.name}`);
      }

      // Check for duplicates within the import batch
      const duplicateInBatch = rows
        .slice(0, index)
        .some((otherRow) => otherRow.name.trim().toLowerCase() === normalizedName);
      if (duplicateInBatch) {
        throw new Error(`Row ${index + 1}: Duplicate account name in import: ${row.name}`);
      }
    });

    // All validation passed, create accounts in a transaction
    // Note: SQLite doesn't support explicit transactions in this ORM, but we'll do all inserts
    // and if any fails, the error will be caught and returned
    rows.forEach((row) => {
      // Investment accounts are always assets with zero initial balance
      let effectiveNature: "asset" | "liability" = row.nature;
      let effectiveInitialBalance = Number(row.initialBalance);

      if (row.type === "investment") {
        effectiveNature = "asset";
        effectiveInitialBalance = 0;
      }

      const id = uuidv4();
      const newAccount = {
        id,
        name: row.name.trim(),
        type: row.type,
        nature: effectiveNature,
        category: row.category as typeof ACCOUNT_CATEGORIES[number],
        currency: row.currency,
        initialBalance: effectiveInitialBalance,
        createdAt: now,
        updatedAt: now,
      };

      db.insert(schema.accounts).values(newAccount).run();

      // For balance accounts, create initial balance history entry
      if (row.type === "balance") {
        db.insert(schema.balanceHistory)
          .values({
            id: uuidv4(),
            accountId: id,
            balance: effectiveInitialBalance,
            date: now,
            createdAt: now,
          })
          .run();
      }

      accountCount += 1;
    });

    return NextResponse.json({
      success: true,
      accounts: accountCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import accounts";
    const status = message.startsWith("Row ") ? 400 : 500;
    console.error("Error importing accounts:", error);
    return NextResponse.json({ error: message }, { status });
  }
};

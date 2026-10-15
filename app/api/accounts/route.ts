import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { confirmIntent } from "@/lib/intent-confirm";
import { SUPPORTED_CURRENCIES, isSupportedCurrency, type SupportedCurrency } from "@/lib/currencies";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { isValidAccountCategoryIdentifier } from "@/lib/db/category-helpers";

// GET all accounts
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb(key);
    const accounts = db.select().from(schema.accounts).all();
    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
};

// POST create new account
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, type, nature, category, currency, initialBalance = 0 } = body;

    if (!name || !type || !nature || !category || !currency) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, nature, category, currency" },
        { status: 400 }
      );
    }

    if (!["balance", "transaction", "investment"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'balance', 'transaction', or 'investment'" }, { status: 400 });
    }

    // Investment accounts are always assets with zero initial balance
    let effectiveNature = nature;
    let effectiveInitialBalance = Number(initialBalance);
    
    if (type === "investment") {
      effectiveNature = "asset";
      effectiveInitialBalance = 0;
    } else {
      if (!["asset", "liability"].includes(nature)) {
        return NextResponse.json({ error: "Nature must be 'asset' or 'liability'" }, { status: 400 });
      }
    }

    const db = getDb(key);

    if (!isValidAccountCategoryIdentifier(db, category)) {
      const validCategories = db.select().from(schema.accountCategories).all();
      const categoryIdentifiers = validCategories.map((c) => c.identifier).join(", ");
      return NextResponse.json(
        { error: `Invalid category. Valid categories: ${categoryIdentifiers}` },
        { status: 400 }
      );
    }

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return NextResponse.json(
        { error: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}` },
        { status: 400 }
      );
    }

    const now = new Date();
    const id = uuidv4();

    const newAccount = {
      id,
      name,
      type: type as "balance" | "transaction" | "investment",
      nature: effectiveNature as "asset" | "liability",
      category: category,
      currency,
      initialBalance: effectiveInitialBalance,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(schema.accounts).values(newAccount).run();

    // For balance accounts, create initial balance history entry
    if (type === "balance") {
      db.insert(schema.balanceHistory)
        .values({
          id: uuidv4(),
          accountId: id,
          balance: Number(initialBalance),
          date: now,
          createdAt: now,
        })
        .run();
    }

    return NextResponse.json(newAccount, { status: 201 });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
};

// PUT update account
export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, currency, nature, category, initialBalance } = body;

    if (!id) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    const db = getDb(key);

    // Verify account exists
    const existingAccount = db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get();
    if (!existingAccount) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const updates: Partial<{ name: string; currency: SupportedCurrency; nature: "asset" | "liability"; category: string; initialBalance: number; updatedAt: Date }> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      if (!name || typeof name !== "string") {
        return NextResponse.json({ error: "Name must be a non-empty string" }, { status: 400 });
      }
      updates.name = name;
    }

    if (currency !== undefined) {
      if (!SUPPORTED_CURRENCIES.includes(currency)) {
        return NextResponse.json(
          { error: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}` },
          { status: 400 }
        );
      }
      updates.currency = currency as SupportedCurrency;
    }

    if (nature !== undefined) {
      if (!["asset", "liability"].includes(nature)) {
        return NextResponse.json({ error: "Nature must be 'asset' or 'liability'" }, { status: 400 });
      }
      // Investment accounts are always assets
      if (existingAccount.type === "investment" && nature !== "asset") {
        return NextResponse.json(
          { error: "Investment accounts must be assets" },
          { status: 400 }
        );
      }
      updates.nature = nature as "asset" | "liability";
    }

    if (category !== undefined) {
      if (!isValidAccountCategoryIdentifier(db, category)) {
        const validCategories = db.select().from(schema.accountCategories).all();
        const categoryIdentifiers = validCategories.map((c) => c.identifier).join(", ");
        return NextResponse.json(
          { error: `Invalid category. Valid categories: ${categoryIdentifiers}` },
          { status: 400 }
        );
      }
      updates.category = category;
    }

    if (initialBalance !== undefined) {
      // Investment accounts always have zero initial balance
      if (existingAccount.type === "investment") {
        updates.initialBalance = 0;
      } else {
        const balanceValue = Number(initialBalance);
        if (isNaN(balanceValue)) {
          return NextResponse.json({ error: "Initial balance must be a valid number" }, { status: 400 });
        }
        updates.initialBalance = balanceValue;
      }
    }

    const isCurrencyChange =
      currency !== undefined && currency !== null && currency !== existingAccount.currency;

    if (isCurrencyChange && updates.currency) {
      if (isSupportedCurrency(existingAccount.currency) && isSupportedCurrency(updates.currency)) {
        const fxSnapshot = await getFxSnapshot(db);
        const fromCurrency: SupportedCurrency = existingAccount.currency;
        const toCurrency: SupportedCurrency = updates.currency;
        const convertValue = (value: number) => {
          return convertAmount(value, fromCurrency, toCurrency, fxSnapshot.rates);
        };

        if (existingAccount.type !== "investment") {
          updates.initialBalance = convertValue(existingAccount.initialBalance);
        }

        const balanceHistoryRows = db
          .select()
          .from(schema.balanceHistory)
          .where(eq(schema.balanceHistory.accountId, id))
          .all();

        balanceHistoryRows.forEach((row) => {
          db.update(schema.balanceHistory)
            .set({ balance: convertValue(row.balance) })
            .where(eq(schema.balanceHistory.id, row.id))
            .run();
        });

        const investmentHistoryRows = db
          .select()
          .from(schema.investmentHistory)
          .where(eq(schema.investmentHistory.accountId, id))
          .all();

        investmentHistoryRows.forEach((row) => {
          db.update(schema.investmentHistory)
            .set({ balance: convertValue(row.balance) })
            .where(eq(schema.investmentHistory.id, row.id))
            .run();
        });

        const transactionRows = db
          .select()
          .from(schema.transactions)
          .where(eq(schema.transactions.accountId, id))
          .all();

        transactionRows.forEach((row) => {
          db.update(schema.transactions)
            .set({ amount: convertValue(row.amount) })
            .where(eq(schema.transactions.id, row.id))
            .run();
        });

        const transferRows = db
          .select()
          .from(schema.transfers)
          .where(eq(schema.transfers.fromAccountId, id))
          .all();

        transferRows.forEach((row) => {
          db.update(schema.transfers)
            .set({ amount: convertValue(row.amount) })
            .where(eq(schema.transfers.id, row.id))
            .run();
        });

        const transferInRows = db
          .select()
          .from(schema.transfers)
          .where(eq(schema.transfers.toAccountId, id))
          .all();

        transferInRows.forEach((row) => {
          db.update(schema.transfers)
            .set({ amount: convertValue(row.amount) })
            .where(eq(schema.transfers.id, row.id))
            .run();
        });
      }
    }

    db.update(schema.accounts).set(updates).where(eq(schema.accounts.id, id)).run();

    const updated = db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
};

// DELETE account
export const DELETE = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const confirmation = await confirmIntent("delete-account");
  if (!confirmation.ok) {
    return NextResponse.json({ error: confirmation.error }, { status: confirmation.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    const db = getDb(key);

    db.transaction((tx) => {
      tx.delete(schema.transactions).where(eq(schema.transactions.accountId, id)).run();
      tx.delete(schema.transfers)
        .where(or(eq(schema.transfers.fromAccountId, id), eq(schema.transfers.toAccountId, id)))
        .run();
      tx.delete(schema.balanceHistory).where(eq(schema.balanceHistory.accountId, id)).run();
      tx.delete(schema.investmentHistory).where(eq(schema.investmentHistory.accountId, id)).run();
      tx.delete(schema.accounts).where(eq(schema.accounts.id, id)).run();
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
};

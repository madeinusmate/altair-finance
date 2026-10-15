import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidTransactionCategoryForType } from "@/lib/db/category-helpers";
import { transactionFingerprint } from "@/lib/import/fingerprint";

// GET all transactions or by account
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const db = getDb(key);

    let transactions;
    if (accountId) {
      transactions = db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.accountId, accountId))
        .orderBy(desc(schema.transactions.date))
        .all();
    } else {
      transactions = db
        .select()
        .from(schema.transactions)
        .orderBy(desc(schema.transactions.date))
        .all();
    }

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
};

// POST create new transaction
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId, type, category, amount, description, date } = body;

    if (!accountId || !type || !category || amount === undefined || !date) {
      return NextResponse.json(
        { error: "Missing required fields: accountId, type, category, amount, date" },
        { status: 400 }
      );
    }

    if (!["debit", "credit"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'debit' or 'credit'" }, { status: 400 });
    }

    const db = getDb(key);

    // Validate category exists and matches transaction type
    if (!isValidTransactionCategoryForType(db, category, type as "debit" | "credit")) {
      const validCategories = db
        .select()
        .from(schema.transactionCategories)
        .where(
          eq(schema.transactionCategories.transactionType, type as "debit" | "credit")
        )
        .all();
      const categoryNames = validCategories.map((c) => c.name).join(", ");
      return NextResponse.json(
        { error: `Invalid category for ${type} transaction. Valid categories: ${categoryNames || "none"}` },
        { status: 400 }
      );
    }

    // Verify account exists and is a transaction account
    const account = db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get();
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (account.type !== "transaction") {
      return NextResponse.json(
        { error: "Transactions can only be added to transaction accounts" },
        { status: 400 }
      );
    }

    const now = new Date();
    const id = uuidv4();
    const fingerprint = await transactionFingerprint({
      accountId,
      type: type as "debit" | "credit",
      amount: Number(amount),
      description: description || null,
      date,
    });

    const newTransaction = {
      id,
      accountId,
      type: type as "debit" | "credit",
      category,
      amount: Number(amount),
      description: description || null,
      date: new Date(date),
      createdAt: now,
      fingerprint,
    };

    db.insert(schema.transactions).values(newTransaction).run();

    return NextResponse.json(newTransaction, { status: 201 });
  } catch (error) {
    console.error("Error creating transaction:", error);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
};

// PUT update transaction
export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, type, category, amount, description, date } = body;

    if (!id) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
    }

    if (!type || !category || amount === undefined || !date) {
      return NextResponse.json(
        { error: "Missing required fields: type, category, amount, date" },
        { status: 400 }
      );
    }

    if (!["debit", "credit"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'debit' or 'credit'" }, { status: 400 });
    }

    const db = getDb(key);

    // Validate category exists and matches transaction type
    if (!isValidTransactionCategoryForType(db, category, type as "debit" | "credit")) {
      const validCategories = db
        .select()
        .from(schema.transactionCategories)
        .where(
          eq(schema.transactionCategories.transactionType, type as "debit" | "credit")
        )
        .all();
      const categoryNames = validCategories.map((c) => c.name).join(", ");
      return NextResponse.json(
        { error: `Invalid category for ${type} transaction. Valid categories: ${categoryNames || "none"}` },
        { status: 400 }
      );
    }

    const amountValue = Number(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    // Verify transaction exists
    const existingTransaction = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .get();

    if (!existingTransaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const fingerprint = await transactionFingerprint({
      accountId: existingTransaction.accountId,
      type: type as "debit" | "credit",
      amount: amountValue,
      description: description || null,
      date,
    });

    const updates = {
      type: type as "debit" | "credit",
      category,
      amount: amountValue,
      description: description || null,
      date: new Date(date),
      fingerprint,
    };

    db.update(schema.transactions).set(updates).where(eq(schema.transactions.id, id)).run();

    const updated = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .get();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating transaction:", error);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
};

// DELETE transaction
export const DELETE = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
    }

    const db = getDb(key);

    db.delete(schema.transactions).where(eq(schema.transactions.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
};

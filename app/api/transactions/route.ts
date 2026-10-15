import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidCategoryIdForType, loadTransactionCategoryById } from "@/lib/db/category-helpers";
import { getTransactionById, listTransactions } from "@/lib/db/ledger-rows";

const readCategoryId = (value: unknown): number | null => {
  const categoryId = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(categoryId)) {
    return null;
  }
  return categoryId;
};

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const db = getDb(key);
    return NextResponse.json(listTransactions(db, accountId));
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId, type, amount, description, date } = body;
    const categoryId = readCategoryId(body.categoryId);

    if (!accountId || !type || categoryId == null || amount === undefined || !date) {
      return NextResponse.json(
        { error: "Missing required fields: accountId, type, categoryId, amount, date" },
        { status: 400 }
      );
    }

    if (!["debit", "credit"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'debit' or 'credit'" }, { status: 400 });
    }

    const db = getDb(key);
    const category = loadTransactionCategoryById(db, categoryId);
    if (!category || !isValidCategoryIdForType(db, categoryId, type as "debit" | "credit")) {
      return NextResponse.json(
        { error: `Invalid category for ${type} transaction` },
        { status: 400 }
      );
    }

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

    db.insert(schema.transactions)
      .values({
        id,
        accountId,
        type: type as "debit" | "credit",
        category: category.name,
        categoryId,
        amount: Number(amount),
        description: description || null,
        date: new Date(date),
        createdAt: now,
      })
      .run();

    return NextResponse.json(getTransactionById(db, id), { status: 201 });
  } catch (error) {
    console.error("Error creating transaction:", error);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
};

export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, type, amount, description, date } = body;
    const categoryId = readCategoryId(body.categoryId);

    if (!id) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
    }

    if (!type || categoryId == null || amount === undefined || !date) {
      return NextResponse.json(
        { error: "Missing required fields: type, categoryId, amount, date" },
        { status: 400 }
      );
    }

    if (!["debit", "credit"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'debit' or 'credit'" }, { status: 400 });
    }

    const db = getDb(key);
    const category = loadTransactionCategoryById(db, categoryId);
    if (!category || !isValidCategoryIdForType(db, categoryId, type as "debit" | "credit")) {
      return NextResponse.json(
        { error: `Invalid category for ${type} transaction` },
        { status: 400 }
      );
    }

    const amountValue = Number(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    const existingTransaction = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .get();

    if (!existingTransaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    db.update(schema.transactions)
      .set({
        type: type as "debit" | "credit",
        category: category.name,
        categoryId,
        amount: amountValue,
        description: description || null,
        date: new Date(date),
      })
      .where(eq(schema.transactions.id, id))
      .run();

    return NextResponse.json(getTransactionById(db, id));
  } catch (error) {
    console.error("Error updating transaction:", error);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
};

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

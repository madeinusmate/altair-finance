import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidTransferCategoryId, parseCategoryId } from "@/lib/db/category-helpers";
import { listClientTransfers } from "@/lib/db/ledger-read";

const nullTypeCategoryNames = (db: ReturnType<typeof getDb>): string => {
  return db
    .select()
    .from(schema.transactionCategories)
    .all()
    .filter((category) => category.transactionType === null)
    .map((category) => category.name)
    .join(", ");
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
    const transfers = listClientTransfers(db, accountId ? { accountId } : undefined);
    return NextResponse.json(transfers);
  } catch (error) {
    console.error("Error fetching transfers:", error);
    return NextResponse.json({ error: "Failed to fetch transfers" }, { status: 500 });
  }
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      fromAccountId,
      toAccountId,
      amount,
      fromAmount,
      toAmount,
      exchangeRate,
      categoryId: rawCategoryId,
      description,
      date,
    } = body;
    const categoryId = parseCategoryId(rawCategoryId);

    const finalFromAmount = fromAmount !== undefined ? Number(fromAmount) : Number(amount);
    const finalToAmount = toAmount !== undefined ? Number(toAmount) : Number(amount);

    if (!fromAccountId || !toAccountId || (amount === undefined && fromAmount === undefined) || categoryId == null || !date) {
      return NextResponse.json(
        { error: "Missing required fields: fromAccountId, toAccountId, fromAmount (or amount), toAmount (or amount), categoryId, date" },
        { status: 400 }
      );
    }

    const db = getDb(key);
    const category = db
      .select()
      .from(schema.transactionCategories)
      .where(eq(schema.transactionCategories.id, categoryId))
      .get();

    if (!category || !isValidTransferCategoryId(db, categoryId)) {
      return NextResponse.json(
        { error: `Invalid category. Valid categories: ${nullTypeCategoryNames(db)}` },
        { status: 400 }
      );
    }

    if (fromAccountId === toAccountId) {
      return NextResponse.json(
        { error: "Source and destination accounts must be different" },
        { status: 400 }
      );
    }

    const fromAccount = db.select().from(schema.accounts).where(eq(schema.accounts.id, fromAccountId)).get();
    const toAccount = db.select().from(schema.accounts).where(eq(schema.accounts.id, toAccountId)).get();

    if (!fromAccount || !toAccount) {
      return NextResponse.json({ error: "One or both accounts not found" }, { status: 404 });
    }

    if (fromAccount.currency === toAccount.currency && finalFromAmount !== finalToAmount) {
      return NextResponse.json(
        { error: "For same-currency transfers, fromAmount and toAmount must be equal" },
        { status: 400 }
      );
    }

    if (fromAccount.type === "balance" || toAccount.type === "balance") {
      return NextResponse.json(
        { error: "Transfers are not allowed for balance accounts. Only transaction and investment accounts can participate in transfers." },
        { status: 400 }
      );
    }

    let finalExchangeRate: number | null = null;
    if (fromAccount.currency !== toAccount.currency) {
      finalExchangeRate = exchangeRate !== undefined ? Number(exchangeRate) : finalToAmount / finalFromAmount;
    }

    const now = new Date();
    const id = uuidv4();

    db.insert(schema.transfers)
      .values({
        id,
        fromAccountId,
        toAccountId,
        amount: finalFromAmount,
        fromAmount: finalFromAmount,
        toAmount: finalToAmount,
        exchangeRate: finalExchangeRate,
        category: category.name,
        categoryId,
        description: description || null,
        date: new Date(date),
        createdAt: now,
      })
      .run();

    const created = listClientTransfers(db, { id })[0];
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating transfer:", error);
    return NextResponse.json({ error: "Failed to create transfer" }, { status: 500 });
  }
};

export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      id,
      fromAccountId,
      toAccountId,
      amount,
      fromAmount,
      toAmount,
      exchangeRate,
      categoryId: rawCategoryId,
      description,
      date,
    } = body;
    const categoryId = parseCategoryId(rawCategoryId);

    if (!id) {
      return NextResponse.json({ error: "Transfer ID is required" }, { status: 400 });
    }

    const finalFromAmount = fromAmount !== undefined ? Number(fromAmount) : Number(amount);
    const finalToAmount = toAmount !== undefined ? Number(toAmount) : Number(amount);

    if (!fromAccountId || !toAccountId || (amount === undefined && fromAmount === undefined) || categoryId == null || !date) {
      return NextResponse.json(
        { error: "Missing required fields: fromAccountId, toAccountId, fromAmount (or amount), toAmount (or amount), categoryId, date" },
        { status: 400 }
      );
    }

    const db = getDb(key);

    if (!isValidTransferCategoryId(db, categoryId)) {
      return NextResponse.json(
        { error: `Invalid category. Valid categories: ${nullTypeCategoryNames(db)}` },
        { status: 400 }
      );
    }

    if (fromAccountId === toAccountId) {
      return NextResponse.json(
        { error: "Source and destination accounts must be different" },
        { status: 400 }
      );
    }

    const existingTransfer = db.select().from(schema.transfers).where(eq(schema.transfers.id, id)).get();
    if (!existingTransfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    const fromAccount = db.select().from(schema.accounts).where(eq(schema.accounts.id, fromAccountId)).get();
    const toAccount = db.select().from(schema.accounts).where(eq(schema.accounts.id, toAccountId)).get();

    if (!fromAccount || !toAccount) {
      return NextResponse.json({ error: "One or both accounts not found" }, { status: 404 });
    }

    if (fromAccount.currency === toAccount.currency && finalFromAmount !== finalToAmount) {
      return NextResponse.json(
        { error: "For same-currency transfers, fromAmount and toAmount must be equal" },
        { status: 400 }
      );
    }

    if (fromAccount.type === "balance" || toAccount.type === "balance") {
      return NextResponse.json(
        { error: "Transfers are not allowed for balance accounts. Only transaction and investment accounts can participate in transfers." },
        { status: 400 }
      );
    }

    let finalExchangeRate: number | null = null;
    if (fromAccount.currency !== toAccount.currency) {
      finalExchangeRate = exchangeRate !== undefined ? Number(exchangeRate) : finalToAmount / finalFromAmount;
    }

    db.update(schema.transfers)
      .set({
        fromAccountId,
        toAccountId,
        amount: finalFromAmount,
        fromAmount: finalFromAmount,
        toAmount: finalToAmount,
        exchangeRate: finalExchangeRate,
        categoryId,
        description: description || null,
        date: new Date(date),
      })
      .where(eq(schema.transfers.id, id))
      .run();

    const updated = listClientTransfers(db, { id })[0];
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating transfer:", error);
    return NextResponse.json({ error: "Failed to update transfer" }, { status: 500 });
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
      return NextResponse.json({ error: "Transfer ID is required" }, { status: 400 });
    }

    const db = getDb(key);
    db.delete(schema.transfers).where(eq(schema.transfers.id, id)).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transfer:", error);
    return NextResponse.json({ error: "Failed to delete transfer" }, { status: 500 });
  }
};

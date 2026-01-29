import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq, or, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidTransactionCategory } from "@/lib/db/category-helpers";

// GET all transfers or by account
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const db = getDb(key);

    let transfers;
    if (accountId) {
      transfers = db
        .select()
        .from(schema.transfers)
        .where(
          or(
            eq(schema.transfers.fromAccountId, accountId),
            eq(schema.transfers.toAccountId, accountId)
          )
        )
        .orderBy(desc(schema.transfers.date))
        .all();
    } else {
      transfers = db.select().from(schema.transfers).orderBy(desc(schema.transfers.date)).all();
    }

    return NextResponse.json(transfers);
  } catch (error) {
    console.error("Error fetching transfers:", error);
    return NextResponse.json({ error: "Failed to fetch transfers" }, { status: 500 });
  }
};

// POST create new transfer
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    // Support both old format (amount) and new format (fromAmount/toAmount)
    const { fromAccountId, toAccountId, amount, fromAmount, toAmount, exchangeRate, category, description, date } = body;

    // Determine amounts - prefer new format, fallback to old format for backward compatibility
    const finalFromAmount = fromAmount !== undefined ? Number(fromAmount) : Number(amount);
    const finalToAmount = toAmount !== undefined ? Number(toAmount) : Number(amount);

    if (!fromAccountId || !toAccountId || (amount === undefined && fromAmount === undefined) || !category || !date) {
      return NextResponse.json(
        { error: "Missing required fields: fromAccountId, toAccountId, fromAmount (or amount), toAmount (or amount), category, date" },
        { status: 400 }
      );
    }

    const db = getDb(key);

    if (!isValidTransactionCategory(db, category)) {
      const validCategories = db.select().from(schema.transactionCategories).all();
      const categoryNames = validCategories.map((c) => c.name).join(", ");
      return NextResponse.json(
        { error: `Invalid category. Valid categories: ${categoryNames}` },
        { status: 400 }
      );
    }

    if (fromAccountId === toAccountId) {
      return NextResponse.json(
        { error: "Source and destination accounts must be different" },
        { status: 400 }
      );
    }

    // Verify both accounts exist
    const fromAccount = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, fromAccountId))
      .get();
    const toAccount = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, toAccountId))
      .get();

    if (!fromAccount || !toAccount) {
      return NextResponse.json({ error: "One or both accounts not found" }, { status: 404 });
    }

    // Validate same-currency transfers: amounts must be equal
    if (fromAccount.currency === toAccount.currency) {
      if (finalFromAmount !== finalToAmount) {
        return NextResponse.json(
          { error: "For same-currency transfers, fromAmount and toAmount must be equal" },
          { status: 400 }
        );
      }
    }

    // Block transfers involving balance accounts
    // Only allow: investment↔investment, investment↔transaction, transaction↔transaction
    if (fromAccount.type === "balance" || toAccount.type === "balance") {
      return NextResponse.json(
        { error: "Transfers are not allowed for balance accounts. Only transaction and investment accounts can participate in transfers." },
        { status: 400 }
      );
    }

    // Calculate exchange rate if not provided
    let finalExchangeRate: number | null = null;
    if (fromAccount.currency !== toAccount.currency) {
      finalExchangeRate = exchangeRate !== undefined ? Number(exchangeRate) : finalToAmount / finalFromAmount;
    } else {
      finalExchangeRate = null; // Same currency, no exchange rate needed
    }

    const now = new Date();
    const id = uuidv4();

    const newTransfer = {
      id,
      fromAccountId,
      toAccountId,
      amount: finalFromAmount, // Keep for backward compatibility
      fromAmount: finalFromAmount,
      toAmount: finalToAmount,
      exchangeRate: finalExchangeRate,
      category,
      description: description || null,
      date: new Date(date),
      createdAt: now,
    };

    db.insert(schema.transfers).values(newTransfer).run();

    return NextResponse.json(newTransfer, { status: 201 });
  } catch (error) {
    console.error("Error creating transfer:", error);
    return NextResponse.json({ error: "Failed to create transfer" }, { status: 500 });
  }
};

// PUT update transfer
export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, fromAccountId, toAccountId, amount, fromAmount, toAmount, exchangeRate, category, description, date } = body;

    if (!id) {
      return NextResponse.json({ error: "Transfer ID is required" }, { status: 400 });
    }

    // Determine amounts - prefer new format, fallback to old format for backward compatibility
    const finalFromAmount = fromAmount !== undefined ? Number(fromAmount) : Number(amount);
    const finalToAmount = toAmount !== undefined ? Number(toAmount) : Number(amount);

    if (!fromAccountId || !toAccountId || (amount === undefined && fromAmount === undefined) || !category || !date) {
      return NextResponse.json(
        { error: "Missing required fields: fromAccountId, toAccountId, fromAmount (or amount), toAmount (or amount), category, date" },
        { status: 400 }
      );
    }

    const db = getDb(key);

    if (!isValidTransactionCategory(db, category)) {
      const validCategories = db.select().from(schema.transactionCategories).all();
      const categoryNames = validCategories.map((c) => c.name).join(", ");
      return NextResponse.json(
        { error: `Invalid category. Valid categories: ${categoryNames}` },
        { status: 400 }
      );
    }

    if (fromAccountId === toAccountId) {
      return NextResponse.json(
        { error: "Source and destination accounts must be different" },
        { status: 400 }
      );
    }

    // Verify transfer exists
    const existingTransfer = db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.id, id))
      .get();

    if (!existingTransfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    // Verify both accounts exist
    const fromAccount = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, fromAccountId))
      .get();
    const toAccount = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, toAccountId))
      .get();

    if (!fromAccount || !toAccount) {
      return NextResponse.json({ error: "One or both accounts not found" }, { status: 404 });
    }

    // Validate same-currency transfers: amounts must be equal
    if (fromAccount.currency === toAccount.currency) {
      if (finalFromAmount !== finalToAmount) {
        return NextResponse.json(
          { error: "For same-currency transfers, fromAmount and toAmount must be equal" },
          { status: 400 }
        );
      }
    }

    // Block transfers involving balance accounts
    if (fromAccount.type === "balance" || toAccount.type === "balance") {
      return NextResponse.json(
        { error: "Transfers are not allowed for balance accounts. Only transaction and investment accounts can participate in transfers." },
        { status: 400 }
      );
    }

    // Calculate exchange rate if not provided
    let finalExchangeRate: number | null = null;
    if (fromAccount.currency !== toAccount.currency) {
      finalExchangeRate = exchangeRate !== undefined ? Number(exchangeRate) : finalToAmount / finalFromAmount;
    } else {
      finalExchangeRate = null; // Same currency, no exchange rate needed
    }

    const updatedTransfer = {
      fromAccountId,
      toAccountId,
      amount: finalFromAmount, // Keep for backward compatibility
      fromAmount: finalFromAmount,
      toAmount: finalToAmount,
      exchangeRate: finalExchangeRate,
      category,
      description: description || null,
      date: new Date(date),
    };

    db.update(schema.transfers)
      .set(updatedTransfer)
      .where(eq(schema.transfers.id, id))
      .run();

    const updated = db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.id, id))
      .get();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating transfer:", error);
    return NextResponse.json({ error: "Failed to update transfer" }, { status: 500 });
  }
};

// DELETE transfer
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

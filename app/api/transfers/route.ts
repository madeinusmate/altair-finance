import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq, or, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

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
    const { fromAccountId, toAccountId, amount, description, date } = body;

    if (!fromAccountId || !toAccountId || amount === undefined || !date) {
      return NextResponse.json(
        { error: "Missing required fields: fromAccountId, toAccountId, amount, date" },
        { status: 400 }
      );
    }

    if (fromAccountId === toAccountId) {
      return NextResponse.json(
        { error: "Source and destination accounts must be different" },
        { status: 400 }
      );
    }

    const db = getDb(key);

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

    if (fromAccount.currency !== toAccount.currency) {
      return NextResponse.json(
        { error: "Transfers are only allowed between accounts with the same currency." },
        { status: 400 }
      );
    }

    // Block transfers involving balance accounts
    // Only allow: investment↔investment, investment↔transaction, transaction↔transaction
    if (fromAccount.type === "balance" || toAccount.type === "balance") {
      return NextResponse.json(
        { error: "Transfers are not allowed for balance accounts. Only transaction and investment accounts can participate in transfers." },
        { status: 400 }
      );
    }

    const now = new Date();
    const id = uuidv4();

    const newTransfer = {
      id,
      fromAccountId,
      toAccountId,
      amount: Number(amount),
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

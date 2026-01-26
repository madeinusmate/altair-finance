import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

// GET investment history by account
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    const db = getDb(key);

    const history = db
      .select()
      .from(schema.investmentHistory)
      .where(eq(schema.investmentHistory.accountId, accountId))
      .orderBy(desc(schema.investmentHistory.date))
      .all();

    return NextResponse.json(history);
  } catch (error) {
    console.error("Error fetching investment history:", error);
    return NextResponse.json({ error: "Failed to fetch investment history" }, { status: 500 });
  }
};

// POST add new investment balance entry
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId, balance, date } = body;

    if (!accountId || balance === undefined || !date) {
      return NextResponse.json(
        { error: "Missing required fields: accountId, balance, date" },
        { status: 400 }
      );
    }

    const db = getDb(key);

    // Verify account exists and is an investment account
    const account = db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get();
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (account.type !== "investment") {
      return NextResponse.json(
        { error: "Balance updates via this endpoint are only for investment accounts" },
        { status: 400 }
      );
    }

    const now = new Date();
    const id = uuidv4();

    const newEntry = {
      id,
      accountId,
      balance: Number(balance),
      date: new Date(date),
      createdAt: now,
    };

    db.insert(schema.investmentHistory).values(newEntry).run();

    return NextResponse.json(newEntry, { status: 201 });
  } catch (error) {
    console.error("Error adding investment balance entry:", error);
    return NextResponse.json({ error: "Failed to add investment balance entry" }, { status: 500 });
  }
};

// DELETE investment history entry
export const DELETE = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Investment history ID is required" }, { status: 400 });
    }

    const db = getDb(key);

    db.delete(schema.investmentHistory).where(eq(schema.investmentHistory.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting investment history entry:", error);
    return NextResponse.json({ error: "Failed to delete investment history entry" }, { status: 500 });
  }
};

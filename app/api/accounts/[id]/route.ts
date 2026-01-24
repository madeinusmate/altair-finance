import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, initializeDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

// GET single account by ID
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    initializeDb(key);
    const db = getDb(key);

    const account = db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json(account);
  } catch (error) {
    console.error("Error fetching account:", error);
    return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 });
  }
};

import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb(key);
    const rows = db
      .select({
        id: schema.payees.id,
        name: schema.payees.name,
        normalizedName: schema.payees.normalizedName,
        icon: schema.payees.icon,
        transactionCount: sql<number>`(
          SELECT COUNT(*) FROM transactions WHERE transactions.payee_id = ${schema.payees.id}
        )`.as("transaction_count"),
      })
      .from(schema.payees)
      .all();

    rows.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ payees: rows });
  } catch (error) {
    console.error("Error listing payees:", error);
    return NextResponse.json({ error: "Failed to list payees" }, { status: 500 });
  }
};

export const PATCH = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : "";
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!id || !name) {
      return NextResponse.json({ error: "Payee id and name are required" }, { status: 400 });
    }

    const db = getDb(key);
    const existing = db.select().from(schema.payees).where(eq(schema.payees.id, id)).get();
    if (!existing) {
      return NextResponse.json({ error: "Payee not found" }, { status: 404 });
    }

    const icon =
      body?.icon === null || typeof body?.icon === "string"
        ? (typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : null)
        : existing.icon;

    db.update(schema.payees)
      .set({ name, icon, updatedAt: new Date() })
      .where(eq(schema.payees.id, id))
      .run();

    const updated = db.select().from(schema.payees).where(eq(schema.payees.id, id)).get();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error renaming payee:", error);
    return NextResponse.json({ error: "Failed to rename payee" }, { status: 500 });
  }
};

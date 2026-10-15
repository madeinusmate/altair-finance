import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const sourceId = typeof body?.sourceId === "string" ? body.sourceId : "";
    const targetId = typeof body?.targetId === "string" ? body.targetId : "";
    if (!sourceId || !targetId) {
      return NextResponse.json({ error: "sourceId and targetId are required" }, { status: 400 });
    }
    if (sourceId === targetId) {
      return NextResponse.json({ error: "Choose a different payee to merge into" }, { status: 400 });
    }

    const db = getDb(key);
    const source = db.select().from(schema.payees).where(eq(schema.payees.id, sourceId)).get();
    const target = db.select().from(schema.payees).where(eq(schema.payees.id, targetId)).get();
    if (!source || !target) {
      return NextResponse.json({ error: "Payee not found" }, { status: 404 });
    }

    db.update(schema.transactions)
      .set({ payeeId: targetId })
      .where(eq(schema.transactions.payeeId, sourceId))
      .run();
    db.delete(schema.payees).where(eq(schema.payees.id, sourceId)).run();

    return NextResponse.json({ success: true, targetId });
  } catch (error) {
    console.error("Error merging payees:", error);
    return NextResponse.json({ error: "Failed to merge payees" }, { status: 500 });
  }
};

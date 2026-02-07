import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

// DELETE budget by ID
export const DELETE = async (
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: "Budget ID is required" }, { status: 400 });
    }

    const db = getDb(key);

    // Check if budget exists
    const budget = db.select().from(schema.budgets).where(eq(schema.budgets.id, id)).get();

    if (!budget) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    // Delete budget
    db.delete(schema.budgets).where(eq(schema.budgets.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting budget:", error);
    return NextResponse.json({ error: "Failed to delete budget" }, { status: 500 });
  }
};

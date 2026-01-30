import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

// GET import by id
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
    const db = getDb(key);
    const importRecord = db
      .select()
      .from(schema.imports)
      .where(eq(schema.imports.id, id))
      .get();

    if (!importRecord) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    // Count associated records
    let transactionsCount = 0;
    let transfersCount = 0;
    let balancesCount = 0;
    let investmentsCount = 0;

    if (importRecord.type === "transactions") {
      transactionsCount = db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.importId, id))
        .all().length;

      transfersCount = db
        .select()
        .from(schema.transfers)
        .where(eq(schema.transfers.importId, id))
        .all().length;
    } else if (importRecord.type === "balances") {
      balancesCount = db
        .select()
        .from(schema.balanceHistory)
        .where(eq(schema.balanceHistory.importId, id))
        .all().length;

      investmentsCount = db
        .select()
        .from(schema.investmentHistory)
        .where(eq(schema.investmentHistory.importId, id))
        .all().length;
    }

    return NextResponse.json({
      ...importRecord,
      transactionsCount: importRecord.type === "transactions" ? transactionsCount : undefined,
      transfersCount: importRecord.type === "transactions" ? transfersCount : undefined,
      balancesCount: importRecord.type === "balances" ? balancesCount : undefined,
      investmentsCount: importRecord.type === "balances" ? investmentsCount : undefined,
    });
  } catch (error) {
    console.error("Error fetching import:", error);
    return NextResponse.json({ error: "Failed to fetch import" }, { status: 500 });
  }
};

// DELETE import and all associated records
export const DELETE = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const db = getDb(key);
    
    // Verify import exists
    const importRecord = db
      .select()
      .from(schema.imports)
      .where(eq(schema.imports.id, id))
      .get();

    if (!importRecord) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    const deleted: {
      transactions?: number;
      transfers?: number;
      balances?: number;
      investments?: number;
    } = {};

    // Count and delete records based on import type
    if (importRecord.type === "transactions") {
      // Count before deletion
      const transactionsToDelete = db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.importId, id))
        .all();
      deleted.transactions = transactionsToDelete.length;

      const transfersToDelete = db
        .select()
        .from(schema.transfers)
        .where(eq(schema.transfers.importId, id))
        .all();
      deleted.transfers = transfersToDelete.length;

      // Delete transactions
      try {
        db.delete(schema.transactions)
          .where(eq(schema.transactions.importId, id))
          .run();
      } catch (error) {
        console.error("Error deleting transactions:", error);
        // Continue on error
      }

      // Delete transfers
      try {
        db.delete(schema.transfers)
          .where(eq(schema.transfers.importId, id))
          .run();
      } catch (error) {
        console.error("Error deleting transfers:", error);
        // Continue on error
      }
    } else if (importRecord.type === "balances") {
      // Count before deletion
      const balancesToDelete = db
        .select()
        .from(schema.balanceHistory)
        .where(eq(schema.balanceHistory.importId, id))
        .all();
      deleted.balances = balancesToDelete.length;

      const investmentsToDelete = db
        .select()
        .from(schema.investmentHistory)
        .where(eq(schema.investmentHistory.importId, id))
        .all();
      deleted.investments = investmentsToDelete.length;

      // Delete balance history
      try {
        db.delete(schema.balanceHistory)
          .where(eq(schema.balanceHistory.importId, id))
          .run();
      } catch (error) {
        console.error("Error deleting balance history:", error);
        // Continue on error
      }

      // Delete investment history
      try {
        db.delete(schema.investmentHistory)
          .where(eq(schema.investmentHistory.importId, id))
          .run();
      } catch (error) {
        console.error("Error deleting investment history:", error);
        // Continue on error
      }
    }

    // Delete the import record
    try {
      db.delete(schema.imports)
        .where(eq(schema.imports.id, id))
        .run();
    } catch (error) {
      console.error("Error deleting import record:", error);
      // Continue on error
    }

    return NextResponse.json({
      success: true,
      deleted,
    });
  } catch (error) {
    console.error("Error deleting import:", error);
    return NextResponse.json({ error: "Failed to delete import" }, { status: 500 });
  }
};

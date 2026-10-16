import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidCategoryIdForType, isValidTransferCategoryId, parseCategoryId } from "@/lib/db/category-helpers";

const RECATEGORIZE_ID_CAP = 5000;
const ID_CHUNK = 400;

const readIdList = (value: unknown): string[] | null => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
    return null;
  }
  return value;
};

const uniqueIds = (ids: string[]): string[] => [...new Set(ids)];

const loadByIds = <T extends { id: string }>(
  ids: string[],
  loadChunk: (chunk: string[]) => T[]
): T[] => {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK);
    if (chunk.length > 0) {
      rows.push(...loadChunk(chunk));
    }
  }
  return rows;
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const categoryId = parseCategoryId(body?.categoryId);
    const transactionIds = readIdList(body?.transactionIds);
    const transferIds = readIdList(body?.transferIds);

    if (categoryId == null) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }
    if (transactionIds == null || transferIds == null) {
      return NextResponse.json(
        { error: "transactionIds and transferIds must be arrays of strings" },
        { status: 400 }
      );
    }

    const uniqueTransactions = uniqueIds(transactionIds);
    const uniqueTransfers = uniqueIds(transferIds);
    if (uniqueTransactions.length === 0 && uniqueTransfers.length === 0) {
      return NextResponse.json({ error: "Select at least one transaction or transfer" }, { status: 400 });
    }
    if (uniqueTransactions.length + uniqueTransfers.length > RECATEGORIZE_ID_CAP) {
      return NextResponse.json({ error: "Too many rows to recategorize at once" }, { status: 400 });
    }

    const db = getDb(key);
    const category = db
      .select()
      .from(schema.transactionCategories)
      .where(eq(schema.transactionCategories.id, categoryId))
      .get();
    if (!category) {
      return NextResponse.json(
        { error: "Category not found", missingCategoryId: categoryId },
        { status: 404 }
      );
    }

    const transactions = loadByIds(uniqueTransactions, (chunk) =>
      db
        .select({ id: schema.transactions.id, type: schema.transactions.type })
        .from(schema.transactions)
        .where(inArray(schema.transactions.id, chunk))
        .all()
    );
    const transfers = loadByIds(uniqueTransfers, (chunk) =>
      db
        .select({ id: schema.transfers.id })
        .from(schema.transfers)
        .where(inArray(schema.transfers.id, chunk))
        .all()
    );

    const foundTransactions = new Set(transactions.map((row) => row.id));
    const foundTransfers = new Set(transfers.map((row) => row.id));
    const missingTransactionIds = uniqueTransactions.filter((id) => !foundTransactions.has(id));
    const missingTransferIds = uniqueTransfers.filter((id) => !foundTransfers.has(id));
    if (missingTransactionIds.length > 0 || missingTransferIds.length > 0) {
      return NextResponse.json(
        {
          error: "A selected row is already deleted. Nothing was changed.",
          missingTransactionIds,
          missingTransferIds,
        },
        { status: 404 }
      );
    }

    const invalidTransactionIds = transactions
      .filter((row) => !isValidCategoryIdForType(db, categoryId, row.type))
      .map((row) => row.id);
    const invalidTransferIds = transfers
      .filter(() => !isValidTransferCategoryId(db, categoryId))
      .map((row) => row.id);
    if (invalidTransactionIds.length > 0 || invalidTransferIds.length > 0) {
      return NextResponse.json(
        {
          error: "Category is not valid for every selected row. Nothing was changed.",
          invalidTransactionIds,
          invalidTransferIds,
        },
        { status: 400 }
      );
    }

    db.transaction((tx) => {
      for (const id of uniqueTransactions) {
        tx.update(schema.transactions)
          .set({ categoryId })
          .where(eq(schema.transactions.id, id))
          .run();
      }
      for (const id of uniqueTransfers) {
        tx.update(schema.transfers)
          .set({ categoryId })
          .where(eq(schema.transfers.id, id))
          .run();
      }
    });

    return NextResponse.json({
      updatedTransactions: uniqueTransactions.length,
      updatedTransfers: uniqueTransfers.length,
    });
  } catch (error) {
    console.error("Error recategorizing transactions:", error);
    return NextResponse.json({ error: "Failed to recategorize transactions" }, { status: 500 });
  }
};

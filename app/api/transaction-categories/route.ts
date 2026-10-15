import { NextRequest, NextResponse } from "next/server";
import { eq, asc, or, isNull, sql, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidCategoryIdForType, isValidTransferCategoryId, loadTransactionCategoryById } from "@/lib/db/category-helpers";
import {
  validateCategoryName,
  validateColor,
  validateIcon,
  validateTransactionType,
} from "@/lib/validators/category-validators";

// GET all transaction categories
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type"); // "debit" | "credit" | null
    const idParam = searchParams.get("id");

    const db = getDb(key);

    if (idParam) {
      const id = Number(idParam);
      if (!Number.isInteger(id)) {
        return NextResponse.json({ error: "Invalid category ID" }, { status: 400 });
      }

      const category = db
        .select()
        .from(schema.transactionCategories)
        .where(eq(schema.transactionCategories.id, id))
        .get();

      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }

      const debitRow = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.transactions)
        .where(and(eq(schema.transactions.categoryId, id), eq(schema.transactions.type, "debit")))
        .get();
      const creditRow = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.transactions)
        .where(and(eq(schema.transactions.categoryId, id), eq(schema.transactions.type, "credit")))
        .get();

      const usage = countReferences(db, id);
      return NextResponse.json({
        category,
        usage: {
          ...usage,
          debitTransactions: Number(debitRow?.count ?? 0),
          creditTransactions: Number(creditRow?.count ?? 0),
        },
      });
    }
    
    // Filter by type if provided
    let categories;
    if (typeFilter === "debit" || typeFilter === "credit") {
      categories = db
        .select()
        .from(schema.transactionCategories)
        .where(
          or(
            eq(schema.transactionCategories.transactionType, typeFilter),
            isNull(schema.transactionCategories.transactionType) // Include special categories like Transfer
          )
        )
        .orderBy(asc(schema.transactionCategories.name))
        .all();
    } else {
      categories = db
        .select()
        .from(schema.transactionCategories)
        .orderBy(asc(schema.transactionCategories.name))
        .all();
    }
    
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Error fetching transaction categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction categories" },
      { status: 500 }
    );
  }
};

// POST create new transaction category
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, transactionType, color, icon } = body;

    // Validate name
    const nameValidation = validateCategoryName(name);
    if (!nameValidation.valid) {
      return NextResponse.json({ error: nameValidation.error }, { status: 400 });
    }

    // Validate transactionType (required, except for "Transfer" category)
    const transactionTypeValidation = validateTransactionType(transactionType);
    if (!transactionTypeValidation.valid) {
      return NextResponse.json({ error: transactionTypeValidation.error }, { status: 400 });
    }

    // transactionType is required unless the category name is "Transfer"
    if (name.trim() !== "Transfer" && (transactionType === null || transactionType === undefined)) {
      return NextResponse.json(
        { error: "Transaction type is required (must be 'debit' or 'credit')" },
        { status: 400 }
      );
    }

    // Validate color
    const colorValidation = validateColor(color);
    if (!colorValidation.valid) {
      return NextResponse.json({ error: colorValidation.error }, { status: 400 });
    }

    // Validate icon
    const iconValidation = validateIcon(icon);
    if (!iconValidation.valid) {
      return NextResponse.json({ error: iconValidation.error }, { status: 400 });
    }

    const db = getDb(key);

    // Check for duplicate name (case-insensitive)
    const existing = db
      .select()
      .from(schema.transactionCategories)
      .where(eq(schema.transactionCategories.name, name.trim()))
      .get();

    if (existing) {
      return NextResponse.json(
        { error: "A category with this name already exists" },
        { status: 409 }
      );
    }

    const now = new Date();
    const newCategory = {
      name: name.trim(),
      transactionType: name.trim() === "Transfer" ? null : (transactionType as "debit" | "credit" | null),
      color: color?.trim() || null,
      icon: icon?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };

    const result = db.insert(schema.transactionCategories).values(newCategory).returning().get();

    return NextResponse.json({ category: result }, { status: 201 });
  } catch (error) {
    console.error("Error creating transaction category:", error);
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "A category with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create transaction category" },
      { status: 500 }
    );
  }
};

// PUT update transaction category
export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, transactionType, color, icon } = body;

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    const db = getDb(key);

    // Verify category exists
    const existing = db
      .select()
      .from(schema.transactionCategories)
      .where(eq(schema.transactionCategories.id, id))
      .get();

    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const updates: Partial<{
      name: string;
      transactionType: "debit" | "credit" | null;
      color: string | null;
      icon: string | null;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      const nameValidation = validateCategoryName(name);
      if (!nameValidation.valid) {
        return NextResponse.json({ error: nameValidation.error }, { status: 400 });
      }

      // Check for duplicate name (case-insensitive, excluding current category)
      const duplicate = db
        .select()
        .from(schema.transactionCategories)
        .where(eq(schema.transactionCategories.name, name.trim()))
        .get();

      if (duplicate && duplicate.id !== id) {
        return NextResponse.json(
          { error: "A category with this name already exists" },
          { status: 409 }
        );
      }

      updates.name = name.trim();
    }

    if (transactionType !== undefined) {
      const transactionTypeValidation = validateTransactionType(transactionType);
      if (!transactionTypeValidation.valid) {
        return NextResponse.json({ error: transactionTypeValidation.error }, { status: 400 });
      }

      // If name is "Transfer", force transactionType to null
      const finalName = name !== undefined ? name.trim() : existing.name;
      if (finalName === "Transfer") {
        updates.transactionType = null;
      } else {
        if (transactionType === null || transactionType === undefined) {
          return NextResponse.json(
            { error: "Transaction type is required (must be 'debit' or 'credit')" },
            { status: 400 }
          );
        }
        updates.transactionType = transactionType as "debit" | "credit";
      }
    }

    if (color !== undefined) {
      const colorValidation = validateColor(color);
      if (!colorValidation.valid) {
        return NextResponse.json({ error: colorValidation.error }, { status: 400 });
      }
      updates.color = color?.trim() || null;
    }

    if (icon !== undefined) {
      const iconValidation = validateIcon(icon);
      if (!iconValidation.valid) {
        return NextResponse.json({ error: iconValidation.error }, { status: 400 });
      }
      updates.icon = icon?.trim() || null;
    }

    const nextType = updates.transactionType !== undefined ? updates.transactionType : existing.transactionType;
    if (nextType !== existing.transactionType) {
      const transactionsUsingCategory = db
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(eq(schema.transactions.categoryId, id))
        .all();

      if (transactionsUsingCategory.length > 0) {
        return NextResponse.json(
          { error: "Cannot change transaction type: category is in use by existing transactions" },
          { status: 400 }
        );
      }

      if (nextType !== "debit") {
        const budgetsUsingCategory = db
          .select({ id: schema.budgets.id })
          .from(schema.budgets)
          .where(eq(schema.budgets.categoryId, id))
          .all();

        if (budgetsUsingCategory.length > 0) {
          return NextResponse.json(
            { error: "Cannot change transaction type: category is used by a budget" },
            { status: 400 }
          );
        }
      }
    }

    db.update(schema.transactionCategories)
      .set(updates)
      .where(eq(schema.transactionCategories.id, id))
      .run();

    const updated = db
      .select()
      .from(schema.transactionCategories)
      .where(eq(schema.transactionCategories.id, id))
      .get();

    return NextResponse.json({ category: updated });
  } catch (error) {
    console.error("Error updating transaction category:", error);
    return NextResponse.json(
      { error: "Failed to update transaction category" },
      { status: 500 }
    );
  }
};

const countMatching = (row: { count: number } | undefined): number => Number(row?.count ?? 0);

const countReferences = (db: ReturnType<typeof getDb>, categoryId: number) => {
  const transactions = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.transactions)
    .where(eq(schema.transactions.categoryId, categoryId))
    .get();
  const transfers = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.transfers)
    .where(eq(schema.transfers.categoryId, categoryId))
    .get();
  const budgets = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.budgets)
    .where(eq(schema.budgets.categoryId, categoryId))
    .get();

  return {
    transactions: countMatching(transactions),
    transfers: countMatching(transfers),
    budgets: countMatching(budgets),
  };
};

const readReassignId = (value: unknown): number | null => {
  if (value == null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const isForeignKeyError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : "";
  return message.toLowerCase().includes("foreign key");
};

// DELETE transaction category
export const DELETE = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get("id");

    if (!idParam) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid category ID" }, { status: 400 });
    }

    let reassignRaw: unknown = searchParams.get("reassignToCategoryId");
    if (reassignRaw == null) {
      try {
        const body = await request.json();
        reassignRaw = body?.reassignToCategoryId;
      } catch {
        reassignRaw = null;
      }
    }

    const db = getDb(key);
    const category = loadTransactionCategoryById(db, id);
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const counts = countReferences(db, id);
    const inUse = counts.transactions > 0 || counts.transfers > 0 || counts.budgets > 0;
    const reassignToCategoryId = readReassignId(reassignRaw);

    if (inUse && reassignToCategoryId == null) {
      return NextResponse.json(
        {
          error: "Category is still in use. Choose a category to move the existing rows to.",
          ...counts,
        },
        { status: 409 }
      );
    }

    if (reassignToCategoryId != null) {
      if (reassignToCategoryId === id) {
        return NextResponse.json({ error: "Choose a different category" }, { status: 409 });
      }

      const destination = loadTransactionCategoryById(db, reassignToCategoryId);
      if (!destination) {
        return NextResponse.json({ error: "Destination category not found" }, { status: 404 });
      }

      const referencedTransactions = db
        .select({ type: schema.transactions.type })
        .from(schema.transactions)
        .where(eq(schema.transactions.categoryId, id))
        .all();

      for (const transaction of referencedTransactions) {
        if (!isValidCategoryIdForType(db, reassignToCategoryId, transaction.type)) {
          return NextResponse.json(
            { error: "Destination category cannot accept every referenced transaction", ...counts },
            { status: 409 }
          );
        }
      }

      if (counts.transfers > 0 && !isValidTransferCategoryId(db, reassignToCategoryId)) {
        return NextResponse.json(
          { error: "Transfers can only move to a category with no transaction type", ...counts },
          { status: 409 }
        );
      }

      if (counts.budgets > 0) {
        if (destination.transactionType !== "debit") {
          return NextResponse.json(
            { error: "Budgets can only move to a debit category", ...counts },
            { status: 409 }
          );
        }

        const destinationBudgets = db
          .select({ id: schema.budgets.id })
          .from(schema.budgets)
          .where(eq(schema.budgets.categoryId, reassignToCategoryId))
          .all();

        if (destinationBudgets.length > 0) {
          return NextResponse.json(
            { error: "Destination category already has a budget", ...counts },
            { status: 409 }
          );
        }
      }
    }

    try {
      db.transaction((tx) => {
        if (reassignToCategoryId != null) {
          tx.update(schema.transactions)
            .set({ categoryId: reassignToCategoryId })
            .where(eq(schema.transactions.categoryId, id))
            .run();
          tx.update(schema.transfers)
            .set({ categoryId: reassignToCategoryId })
            .where(eq(schema.transfers.categoryId, id))
            .run();
          tx.update(schema.budgets)
            .set({ categoryId: reassignToCategoryId })
            .where(eq(schema.budgets.categoryId, id))
            .run();
        }

        tx.delete(schema.transactionCategories).where(eq(schema.transactionCategories.id, id)).run();
      });
    } catch (error) {
      if (isForeignKeyError(error)) {
        return NextResponse.json(
          { error: "Category is still referenced", ...counts },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, reassigned: reassignToCategoryId != null });
  } catch (error) {
    console.error("Error deleting transaction category:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction category" },
      { status: 500 }
    );
  }
};

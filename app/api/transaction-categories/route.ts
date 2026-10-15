import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, eq, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidCategoryIdForType, isValidTransferCategoryId, parseCategoryId } from "@/lib/db/category-helpers";
import {
  validateCategoryName,
  validateColor,
  validateIcon,
  validateTransactionType,
} from "@/lib/validators/category-validators";

const countWhere = (
  db: ReturnType<typeof getDb>,
  table: typeof schema.transactions | typeof schema.transfers | typeof schema.budgets,
  categoryId: number,
  transactionType?: "debit" | "credit"
): number => {
  if (table === schema.transactions && transactionType) {
    const row = db
      .select({ value: count() })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.categoryId, categoryId), eq(schema.transactions.type, transactionType)))
      .get();
    return row?.value ?? 0;
  }

  const categoryColumn =
    table === schema.transactions
      ? schema.transactions.categoryId
      : table === schema.transfers
        ? schema.transfers.categoryId
        : schema.budgets.categoryId;

  const row = db.select({ value: count() }).from(table).where(eq(categoryColumn, categoryId)).get();
  return row?.value ?? 0;
};

// GET all transaction categories
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type"); // "debit" | "credit" | null

    const db = getDb(key);
    const referencesParam = searchParams.get("references");
    if (referencesParam) {
      const id = Number(referencesParam);
      if (!Number.isInteger(id) || id <= 0) {
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

      const debitTransactions = countWhere(db, schema.transactions, id, "debit");
      const creditTransactions = countWhere(db, schema.transactions, id, "credit");
      const transfers = countWhere(db, schema.transfers, id);
      const budgets = countWhere(db, schema.budgets, id);
      const budgetCategoryIds = db
        .select({ categoryId: schema.budgets.categoryId })
        .from(schema.budgets)
        .all()
        .flatMap((row) => (row.categoryId == null ? [] : [row.categoryId]));

      return NextResponse.json({
        transactions: debitTransactions + creditTransactions,
        transfers,
        budgets,
        debitTransactions,
        creditTransactions,
        budgetCategoryIds,
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

    const finalName = name !== undefined ? name.trim() : existing.name;
    let nextType = existing.transactionType;
    if (transactionType !== undefined) {
      nextType = finalName === "Transfer" ? null : transactionType;
    }

    if (nextType !== existing.transactionType) {
      const transactionsUsingCategory = countWhere(db, schema.transactions, id);
      if (transactionsUsingCategory > 0) {
        return NextResponse.json(
          { error: "Cannot change transaction type: category is in use by existing transactions" },
          { status: 400 }
        );
      }

      if (nextType !== "debit") {
        const budgetsUsingCategory = countWhere(db, schema.budgets, id);
        if (budgetsUsingCategory > 0) {
          return NextResponse.json(
            { error: "Cannot change transaction type: a budget uses this category" },
            { status: 400 }
          );
        }
      }
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

// DELETE transaction category
const readReassignId = async (request: NextRequest, searchParams: URLSearchParams): Promise<number | null> => {
  const fromQuery = searchParams.get("reassignToCategoryId");
  if (fromQuery) {
    const parsed = Number(fromQuery);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const body = await request.json();
    return parseCategoryId(body?.reassignToCategoryId);
  } catch {
    return null;
  }
};

const isForeignKeyError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("FOREIGN KEY") || message.includes("SQLITE_CONSTRAINT");
};

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

    const db = getDb(key);
    const category = db
      .select()
      .from(schema.transactionCategories)
      .where(eq(schema.transactionCategories.id, id))
      .get();

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const debitTransactions = countWhere(db, schema.transactions, id, "debit");
    const creditTransactions = countWhere(db, schema.transactions, id, "credit");
    const transactions = debitTransactions + creditTransactions;
    const transfers = countWhere(db, schema.transfers, id);
    const budgets = countWhere(db, schema.budgets, id);
    const inUse = transactions + transfers + budgets > 0;
    const reassignToCategoryId = await readReassignId(request, searchParams);

    if (inUse && reassignToCategoryId == null) {
      return NextResponse.json(
        {
          error: `Category is in use by ${transactions} transactions, ${transfers} transfers, and ${budgets} budgets. Choose a destination category.`,
          transactions,
          transfers,
          budgets,
        },
        { status: 409 }
      );
    }

    if (inUse && reassignToCategoryId != null) {
      if (reassignToCategoryId === id) {
        return NextResponse.json({ error: "Choose a different category" }, { status: 400 });
      }

      const destination = db
        .select()
        .from(schema.transactionCategories)
        .where(eq(schema.transactionCategories.id, reassignToCategoryId))
        .get();
      if (!destination) {
        return NextResponse.json({ error: "Destination category not found" }, { status: 404 });
      }

      const referencedTransactions = db
        .select({ id: schema.transactions.id, type: schema.transactions.type })
        .from(schema.transactions)
        .where(eq(schema.transactions.categoryId, id))
        .all();
      const invalidTransactionIds = referencedTransactions
        .filter((row) => !isValidCategoryIdForType(db, reassignToCategoryId, row.type))
        .map((row) => row.id);

      const referencedTransfers = db
        .select({ id: schema.transfers.id })
        .from(schema.transfers)
        .where(eq(schema.transfers.categoryId, id))
        .all();
      const invalidTransferIds = isValidTransferCategoryId(db, reassignToCategoryId)
        ? []
        : referencedTransfers.map((row) => row.id);

      if (invalidTransactionIds.length > 0 || invalidTransferIds.length > 0) {
        return NextResponse.json(
          {
            error: "Destination category cannot accept every referenced row",
            invalidTransactionIds,
            invalidTransferIds,
          },
          { status: 400 }
        );
      }

      if (budgets > 0) {
        if (destination.transactionType !== "debit") {
          return NextResponse.json(
            { error: "Budgets can only move to a debit category", transactions, transfers, budgets },
            { status: 409 }
          );
        }
        const destinationBudget = db
          .select()
          .from(schema.budgets)
          .where(eq(schema.budgets.categoryId, reassignToCategoryId))
          .get();
        if (destinationBudget) {
          return NextResponse.json(
            {
              error: "Destination category already has a budget",
              transactions,
              transfers,
              budgets,
            },
            { status: 409 }
          );
        }
      }

      try {
        db.transaction((tx) => {
          if (transactions > 0) {
            tx.update(schema.transactions)
              .set({ categoryId: reassignToCategoryId })
              .where(eq(schema.transactions.categoryId, id))
              .run();
          }
          if (transfers > 0) {
            tx.update(schema.transfers)
              .set({ categoryId: reassignToCategoryId })
              .where(eq(schema.transfers.categoryId, id))
              .run();
          }
          if (budgets > 0) {
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
            { error: "Category is still in use", transactions, transfers, budgets },
            { status: 409 }
          );
        }
        throw error;
      }

      return NextResponse.json({ success: true, reassignedToCategoryId: reassignToCategoryId });
    }

    try {
      db.delete(schema.transactionCategories).where(eq(schema.transactionCategories.id, id)).run();
    } catch (error) {
      if (isForeignKeyError(error)) {
        return NextResponse.json(
          { error: "Category is still in use", transactions, transfers, budgets },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transaction category:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction category" },
      { status: 500 }
    );
  }
};

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidCategoryIdForType, isValidTransferCategoryId, parseCategoryId } from "@/lib/db/category-helpers";
import {
  validateCategoryName,
  validateColor,
  validateIcon,
  validateTransactionType,
} from "@/lib/validators/category-validators";

type Db = ReturnType<typeof getDb>;

const countCategory = (
  db: Db,
  table: typeof schema.transactions | typeof schema.transfers | typeof schema.budgets,
  categoryId: number
) => {
  if (table === schema.transactions) {
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.transactions)
      .where(eq(schema.transactions.categoryId, categoryId))
      .get();
    return Number(row?.count ?? 0);
  }
  if (table === schema.transfers) {
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.transfers)
      .where(eq(schema.transfers.categoryId, categoryId))
      .get();
    return Number(row?.count ?? 0);
  }
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.budgets)
    .where(eq(schema.budgets.categoryId, categoryId))
    .get();
  return Number(row?.count ?? 0);
};

const categoryUsage = (db: Db, categoryId: number) => {
  const debitRow = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.categoryId, categoryId), eq(schema.transactions.type, "debit")))
    .get();
  const creditRow = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.categoryId, categoryId), eq(schema.transactions.type, "credit")))
    .get();
  const transactions = countCategory(db, schema.transactions, categoryId);
  const transfers = countCategory(db, schema.transfers, categoryId);
  const budgets = countCategory(db, schema.budgets, categoryId);
  return {
    transactions,
    transfers,
    budgets,
    debitTransactions: Number(debitRow?.count ?? 0),
    creditTransactions: Number(creditRow?.count ?? 0),
  };
};

const isForeignKeyError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  return code === "SQLITE_CONSTRAINT_FOREIGNKEY" || message.toLowerCase().includes("foreign key");
};

const readReassignId = async (request: NextRequest): Promise<number | null | "invalid"> => {
  const param = new URL(request.url).searchParams.get("reassignToCategoryId");
  if (param !== null) {
    const parsed = parseCategoryId(param);
    return parsed === null ? "invalid" : parsed;
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  const text = await request.text();
  if (!text.trim()) {
    return null;
  }
  try {
    const body = JSON.parse(text) as { reassignToCategoryId?: unknown };
    if (body.reassignToCategoryId == null) {
      return null;
    }
    const parsed = parseCategoryId(body.reassignToCategoryId);
    return parsed === null ? "invalid" : parsed;
  } catch {
    return "invalid";
  }
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
    const usageId = searchParams.get("usageId");

    const db = getDb(key);

    if (usageId) {
      const id = parseCategoryId(usageId);
      if (id === null) {
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
      return NextResponse.json({ category, ...categoryUsage(db, id) });
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

    if (updates.transactionType !== undefined && updates.transactionType !== existing.transactionType) {
      const usage = categoryUsage(db, id);
      if (usage.transactions > 0) {
        return NextResponse.json(
          { error: "Cannot change transaction type: category is in use by existing transactions" },
          { status: 400 }
        );
      }
      if (usage.budgets > 0 && updates.transactionType !== "debit") {
        return NextResponse.json(
          { error: "Cannot change transaction type: category is used by a budget" },
          { status: 400 }
        );
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

    const id = parseCategoryId(idParam);
    if (id === null) {
      return NextResponse.json({ error: "Invalid category ID" }, { status: 400 });
    }

    const reassignToCategoryId = await readReassignId(request);
    if (reassignToCategoryId === "invalid") {
      return NextResponse.json({ error: "Invalid reassignToCategoryId" }, { status: 400 });
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

    const usage = categoryUsage(db, id);
    const inUse = usage.transactions > 0 || usage.transfers > 0 || usage.budgets > 0;

    if (inUse && reassignToCategoryId === null) {
      return NextResponse.json(
        {
          error: "Category is still used. Choose a destination category before deleting it.",
          transactions: usage.transactions,
          transfers: usage.transfers,
          budgets: usage.budgets,
          debitTransactions: usage.debitTransactions,
          creditTransactions: usage.creditTransactions,
        },
        { status: 409 }
      );
    }

    if (reassignToCategoryId !== null && reassignToCategoryId === id) {
      return NextResponse.json({ error: "Choose a different destination category" }, { status: 400 });
    }

    if (inUse && reassignToCategoryId !== null) {
      const destination = db
        .select()
        .from(schema.transactionCategories)
        .where(eq(schema.transactionCategories.id, reassignToCategoryId))
        .get();

      if (!destination) {
        return NextResponse.json({ error: "Destination category not found" }, { status: 404 });
      }

      if (usage.debitTransactions > 0 && !isValidCategoryIdForType(db, destination.id, "debit")) {
        return NextResponse.json(
          { error: "Destination category cannot accept the debit transactions", ...usage },
          { status: 409 }
        );
      }
      if (usage.creditTransactions > 0 && !isValidCategoryIdForType(db, destination.id, "credit")) {
        return NextResponse.json(
          { error: "Destination category cannot accept the credit transactions", ...usage },
          { status: 409 }
        );
      }
      if (usage.transfers > 0 && !isValidTransferCategoryId(db, destination.id)) {
        return NextResponse.json(
          { error: "Transfers can only move to a category with no transaction type", ...usage },
          { status: 409 }
        );
      }
      if (usage.budgets > 0) {
        if (destination.transactionType !== "debit") {
          return NextResponse.json(
            { error: "Budgets can only move to a debit category", ...usage },
            { status: 409 }
          );
        }
        const destinationBudget = db
          .select()
          .from(schema.budgets)
          .where(eq(schema.budgets.categoryId, destination.id))
          .get();
        if (destinationBudget) {
          return NextResponse.json(
            { error: "Destination category already has a budget", ...usage },
            { status: 409 }
          );
        }
      }

      try {
        db.transaction((tx) => {
          if (usage.transactions > 0) {
            tx.update(schema.transactions)
              .set({ categoryId: destination.id })
              .where(eq(schema.transactions.categoryId, id))
              .run();
          }
          if (usage.transfers > 0) {
            tx.update(schema.transfers)
              .set({ categoryId: destination.id })
              .where(eq(schema.transfers.categoryId, id))
              .run();
          }
          if (usage.budgets > 0) {
            tx.update(schema.budgets)
              .set({ categoryId: destination.id })
              .where(eq(schema.budgets.categoryId, id))
              .run();
          }
          tx.delete(schema.categorizationRules)
            .where(eq(schema.categorizationRules.categoryName, category.name))
            .run();
          tx.delete(schema.transactionCategories).where(eq(schema.transactionCategories.id, id)).run();
        });
      } catch (error) {
        if (isForeignKeyError(error)) {
          const latest = categoryUsage(db, id);
          return NextResponse.json(
            {
              error: "Category is still used",
              transactions: latest.transactions,
              transfers: latest.transfers,
              budgets: latest.budgets,
            },
            { status: 409 }
          );
        }
        throw error;
      }

      return NextResponse.json({
        success: true,
        reassigned: true,
        reassignedTo: destination.name,
        reassignedToCategoryId: destination.id,
      });
    }

    try {
      db.delete(schema.categorizationRules)
        .where(eq(schema.categorizationRules.categoryName, category.name))
        .run();
      db.delete(schema.transactionCategories).where(eq(schema.transactionCategories.id, id)).run();
    } catch (error) {
      if (isForeignKeyError(error)) {
        const latest = categoryUsage(db, id);
        return NextResponse.json(
          {
            error: "Category is still used. Choose a destination category before deleting it.",
            transactions: latest.transactions,
            transfers: latest.transfers,
            budgets: latest.budgets,
          },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, reassigned: false });
  } catch (error) {
    console.error("Error deleting transaction category:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction category" },
      { status: 500 }
    );
  }
};

import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import {
  validateCategoryName,
  validateColor,
  validateIcon,
} from "@/lib/validators/category-validators";

// GET all transaction categories
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb(key);
    const categories = db
      .select()
      .from(schema.transactionCategories)
      .orderBy(asc(schema.transactionCategories.name))
      .all();
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
    const { name, color, icon } = body;

    // Validate name
    const nameValidation = validateCategoryName(name);
    if (!nameValidation.valid) {
      return NextResponse.json({ error: nameValidation.error }, { status: 400 });
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
    const { id, name, color, icon } = body;

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

    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid category ID" }, { status: 400 });
    }

    const db = getDb(key);

    // Verify category exists
    const category = db
      .select()
      .from(schema.transactionCategories)
      .where(eq(schema.transactionCategories.id, id))
      .get();

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Check if category is in use
    const transactionsUsingCategory = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.category, category.name))
      .all();

    const transfersUsingCategory = db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.category, category.name))
      .all();

    const isInUse = transactionsUsingCategory.length > 0 || transfersUsingCategory.length > 0;

    if (isInUse) {
      // Find or create "Other Expenses" category for reassignment
      let otherExpenses = db
        .select()
        .from(schema.transactionCategories)
        .where(eq(schema.transactionCategories.name, "Other Expenses"))
        .get();

      if (!otherExpenses) {
        // Create "Other Expenses" if it doesn't exist
        const now = new Date();
        const newOtherExpenses = {
          name: "Other Expenses",
          color: null,
          icon: null,
          createdAt: now,
          updatedAt: now,
        };
        otherExpenses = db
          .insert(schema.transactionCategories)
          .values(newOtherExpenses)
          .returning()
          .get();
      }

      // Reassign transactions
      if (transactionsUsingCategory.length > 0) {
        db.update(schema.transactions)
          .set({ category: "Other Expenses" })
          .where(eq(schema.transactions.category, category.name))
          .run();
      }

      // Reassign transfers
      if (transfersUsingCategory.length > 0) {
        db.update(schema.transfers)
          .set({ category: "Other Expenses" })
          .where(eq(schema.transfers.category, category.name))
          .run();
      }
    }

    // Delete the category
    db.delete(schema.transactionCategories)
      .where(eq(schema.transactionCategories.id, id))
      .run();

    return NextResponse.json({
      success: true,
      reassigned: isInUse,
      reassignedTo: isInUse ? "Other Expenses" : undefined,
    });
  } catch (error) {
    console.error("Error deleting transaction category:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction category" },
      { status: 500 }
    );
  }
};

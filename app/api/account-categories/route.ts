import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import {
  validateCategoryName,
  validateAccountCategoryIdentifier,
  validateColor,
  validateIcon,
} from "@/lib/validators/category-validators";
import {
  generateCategoryIdentifier,
  generateUniqueCategoryIdentifier,
} from "@/lib/utils/category-identifier";

// GET all account categories
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb(key);
    const categories = db
      .select()
      .from(schema.accountCategories)
      .orderBy(asc(schema.accountCategories.name))
      .all();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Error fetching account categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch account categories" },
      { status: 500 }
    );
  }
};

// POST create new account category
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

    // Generate identifier automatically from name
    const baseIdentifier = generateCategoryIdentifier(name.trim());
    const existingCategories = db.select().from(schema.accountCategories).all();
    const existingIdentifiers = existingCategories.map((c) => c.identifier);
    const identifier = generateUniqueCategoryIdentifier(baseIdentifier, existingIdentifiers);

    // Check for duplicate name (case-insensitive)
    const existingByName = db
      .select()
      .from(schema.accountCategories)
      .where(eq(schema.accountCategories.name, name.trim()))
      .get();

    if (existingByName) {
      return NextResponse.json(
        { error: "A category with this name already exists" },
        { status: 409 }
      );
    }

    const now = new Date();
    const newCategory = {
      identifier: identifier.trim(),
      name: name.trim(),
      color: color?.trim() || null,
      icon: icon?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };

    const result = db.insert(schema.accountCategories).values(newCategory).returning().get();

    return NextResponse.json({ category: result }, { status: 201 });
  } catch (error) {
    console.error("Error creating account category:", error);
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "A category with this identifier or name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create account category" },
      { status: 500 }
    );
  }
};

// PUT update account category
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
      .from(schema.accountCategories)
      .where(eq(schema.accountCategories.id, id))
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

    // If name is being updated, regenerate identifier to match
    if (name !== undefined && name.trim() !== existing.name) {
      const nameValidation = validateCategoryName(name);
      if (!nameValidation.valid) {
        return NextResponse.json({ error: nameValidation.error }, { status: 400 });
      }

      // Check for duplicate name (case-insensitive, excluding current category)
      const duplicate = db
        .select()
        .from(schema.accountCategories)
        .where(eq(schema.accountCategories.name, name.trim()))
        .get();

      if (duplicate && duplicate.id !== id) {
        return NextResponse.json(
          { error: "A category with this name already exists" },
          { status: 409 }
        );
      }

      updates.name = name.trim();
      
      // Regenerate identifier from new name
      const baseIdentifier = generateCategoryIdentifier(name.trim());
      const existingCategories = db.select().from(schema.accountCategories).all();
      const existingIdentifiers = existingCategories
        .filter((c) => c.id !== id)
        .map((c) => c.identifier);
      const newIdentifier = generateUniqueCategoryIdentifier(baseIdentifier, existingIdentifiers);
      
      // Update identifier and all accounts using the old identifier
      db.update(schema.accountCategories)
        .set({ identifier: newIdentifier })
        .where(eq(schema.accountCategories.id, id))
        .run();
      
      // Update all accounts using the old identifier
      db.update(schema.accounts)
        .set({ category: newIdentifier })
        .where(eq(schema.accounts.category, existing.identifier))
        .run();
    } else if (name !== undefined) {
      // Name unchanged, just validate
      const nameValidation = validateCategoryName(name);
      if (!nameValidation.valid) {
        return NextResponse.json({ error: nameValidation.error }, { status: 400 });
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

    db.update(schema.accountCategories)
      .set(updates)
      .where(eq(schema.accountCategories.id, id))
      .run();

    const updated = db
      .select()
      .from(schema.accountCategories)
      .where(eq(schema.accountCategories.id, id))
      .get();

    return NextResponse.json({ category: updated });
  } catch (error) {
    console.error("Error updating account category:", error);
    return NextResponse.json(
      { error: "Failed to update account category" },
      { status: 500 }
    );
  }
};

// DELETE account category
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
      .from(schema.accountCategories)
      .where(eq(schema.accountCategories.id, id))
      .get();

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Check if category is in use
    const accountsUsingCategory = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.category, category.identifier))
      .all();

    const isInUse = accountsUsingCategory.length > 0;

    if (isInUse) {
      // Determine reassignment category based on account nature
      // For assets, use "other_asset", for liabilities, use "other_liability"
      const assetAccounts = accountsUsingCategory.filter((acc) => acc.nature === "asset");
      const liabilityAccounts = accountsUsingCategory.filter(
        (acc) => acc.nature === "liability"
      );

      // Find or create appropriate "other" category
      if (assetAccounts.length > 0) {
        let otherAsset = db
          .select()
          .from(schema.accountCategories)
          .where(eq(schema.accountCategories.identifier, "other_asset"))
          .get();

        if (!otherAsset) {
          // Create "other_asset" if it doesn't exist
          const now = new Date();
          const newOtherAsset = {
            identifier: "other_asset",
            name: "Other Asset",
            color: null,
            icon: null,
            createdAt: now,
            updatedAt: now,
          };
          otherAsset = db.insert(schema.accountCategories).values(newOtherAsset).returning().get();
        }

        // Reassign asset accounts
        for (const account of assetAccounts) {
          db.update(schema.accounts)
            .set({ category: "other_asset" })
            .where(eq(schema.accounts.id, account.id))
            .run();
        }
      }

      if (liabilityAccounts.length > 0) {
        let otherLiability = db
          .select()
          .from(schema.accountCategories)
          .where(eq(schema.accountCategories.identifier, "other_liability"))
          .get();

        if (!otherLiability) {
          // Create "other_liability" if it doesn't exist
          const now = new Date();
          const newOtherLiability = {
            identifier: "other_liability",
            name: "Other Liability",
            color: null,
            icon: null,
            createdAt: now,
            updatedAt: now,
          };
          otherLiability = db
            .insert(schema.accountCategories)
            .values(newOtherLiability)
            .returning()
            .get();
        }

        // Reassign liability accounts
        for (const account of liabilityAccounts) {
          db.update(schema.accounts)
            .set({ category: "other_liability" })
            .where(eq(schema.accounts.id, account.id))
            .run();
        }
      }
    }

    // Delete the category
    db.delete(schema.accountCategories)
      .where(eq(schema.accountCategories.id, id))
      .run();

    return NextResponse.json({
      success: true,
      reassigned: isInUse,
    });
  } catch (error) {
    console.error("Error deleting account category:", error);
    return NextResponse.json(
      { error: "Failed to delete account category" },
      { status: 500 }
    );
  }
};

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { loadTransactionCategoryById } from "@/lib/db/category-helpers";
import { getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency, isSupportedCurrency } from "@/lib/currencies";
import { loadMonthBudget } from "@/lib/budget/month-summary";
import { currentYearMonth, isAfterCurrentMonth, parseYearMonth } from "@/lib/budget/resolve-month";

const readCategoryId = (value: unknown): number | null => {
  const categoryId = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(categoryId)) {
    return null;
  }
  return categoryId;
};

const isUniqueConstraint = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  return code === "SQLITE_CONSTRAINT_UNIQUE" || message.includes("UNIQUE constraint failed");
};

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const currency = (searchParams.get("currency") || "USD") as SupportedCurrency;
    const monthParam = searchParams.get("month");

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const month = monthParam ?? currentYearMonth();
    if (!parseYearMonth(month)) {
      return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);
    const summary = loadMonthBudget(db, month, currency, fxSnapshot);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return NextResponse.json({ error: "Failed to fetch budgets" }, { status: 500 });
  }
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { amount, currency, yearMonth } = body;
    const categoryId = readCategoryId(body.categoryId);

    if (categoryId == null) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    if (typeof yearMonth !== "string" || !parseYearMonth(yearMonth)) {
      return NextResponse.json({ error: "yearMonth must be YYYY-MM" }, { status: 400 });
    }

    if (isAfterCurrentMonth(yearMonth)) {
      return NextResponse.json({ error: "yearMonth cannot be in the future" }, { status: 400 });
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }

    if (!currency || !isSupportedCurrency(currency)) {
      return NextResponse.json({ error: "Valid currency is required" }, { status: 400 });
    }

    const db = getDb(key);
    const category = loadTransactionCategoryById(db, categoryId);
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    if (category.transactionType !== "debit") {
      return NextResponse.json(
        { error: "Budgets can only be created for debit (expense) categories" },
        { status: 400 }
      );
    }

    const now = new Date();
    const writeMonth = (id: string) => {
      return db
        .update(schema.budgets)
        .set({
          amount,
          currency,
          updatedAt: now,
        })
        .where(eq(schema.budgets.id, id))
        .returning()
        .get();
    };

    const existingBudget = db
      .select()
      .from(schema.budgets)
      .where(and(eq(schema.budgets.categoryId, categoryId), eq(schema.budgets.yearMonth, yearMonth)))
      .get();

    if (existingBudget) {
      return NextResponse.json(writeMonth(existingBudget.id));
    }

    try {
      const created = db
        .insert(schema.budgets)
        .values({
          id: uuidv4(),
          categoryName: category.name,
          categoryId,
          yearMonth,
          amount,
          currency,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      if (!isUniqueConstraint(error)) {
        throw error;
      }

      const raced = db
        .select()
        .from(schema.budgets)
        .where(and(eq(schema.budgets.categoryId, categoryId), eq(schema.budgets.yearMonth, yearMonth)))
        .get();
      if (!raced) {
        throw error;
      }
      return NextResponse.json(writeMonth(raced.id));
    }
  } catch (error) {
    console.error("Error creating/updating budget:", error);
    return NextResponse.json({ error: "Failed to create/update budget" }, { status: 500 });
  }
};

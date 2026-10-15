import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { parseCategoryId } from "@/lib/db/category-helpers";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency, isSupportedCurrency } from "@/lib/currencies";
import { v4 as uuidv4 } from "uuid";
import { startOfMonth, endOfDay, format } from "date-fns";

interface BudgetWithSpending {
  id: string;
  categoryId: number;
  categoryName: string;
  amount: number;
  currency: string;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
}

const calculateCategorySpending = async (
  db: ReturnType<typeof getDb>,
  categoryId: number,
  startDate: Date,
  endDate: Date,
  targetCurrency: SupportedCurrency,
  fxSnapshot: Awaited<ReturnType<typeof getFxSnapshot>>
): Promise<number> => {
  const transactions = db
    .select({
      amount: schema.transactions.amount,
      accountId: schema.transactions.accountId,
    })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(
      and(
        eq(schema.transactions.type, "debit"),
        eq(schema.transactions.categoryId, categoryId),
        gte(schema.transactions.date, startDate),
        lte(schema.transactions.date, endDate),
        ne(schema.accounts.type, "investment")
      )
    )
    .all();

  const accounts = db.select().from(schema.accounts).all();
  const accountCurrencyMap = new Map(accounts.map((acc) => [acc.id, acc.currency]));

  let totalSpent = 0;
  transactions.forEach((transaction) => {
    const accountCurrency = accountCurrencyMap.get(transaction.accountId);
    if (!accountCurrency || !isSupportedCurrency(accountCurrency)) {
      return;
    }

    try {
      totalSpent += convertAmount(transaction.amount, accountCurrency, targetCurrency, fxSnapshot.rates);
    } catch (error) {
      console.error("Error converting amount for transaction:", error);
    }
  });

  return totalSpent;
};

const listDebitBudgets = (db: ReturnType<typeof getDb>) => {
  return db
    .select({
      id: schema.budgets.id,
      categoryId: schema.budgets.categoryId,
      categoryName: schema.transactionCategories.name,
      transactionType: schema.transactionCategories.transactionType,
      amount: schema.budgets.amount,
      currency: schema.budgets.currency,
    })
    .from(schema.budgets)
    .innerJoin(
      schema.transactionCategories,
      eq(schema.budgets.categoryId, schema.transactionCategories.id)
    )
    .all()
    .filter((budget) => budget.transactionType === "debit" && budget.categoryId != null);
};

// GET all budgets with current month spending
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

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);

    let startDate: Date;
    let endDate: Date;
    let month: string;

    if (monthParam) {
      const [year, monthNum] = monthParam.split("-").map(Number);
      startDate = startOfMonth(new Date(year, monthNum - 1, 1));
      endDate = endOfDay(new Date(year, monthNum - 1, new Date(year, monthNum, 0).getDate()));
      month = monthParam;
    } else {
      const now = new Date();
      startDate = startOfMonth(now);
      endDate = endOfDay(now);
      month = format(now, "yyyy-MM");
    }

    let budgets: ReturnType<typeof listDebitBudgets>;
    try {
      budgets = listDebitBudgets(db);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        "message" in error &&
        error.code === "SQLITE_ERROR" &&
        typeof error.message === "string" &&
        error.message.includes("no such table")
      ) {
        console.warn("[Budgets API] Budgets table not found, returning empty list");
        budgets = [];
      } else {
        throw error;
      }
    }

    const budgetsWithSpending: BudgetWithSpending[] = await Promise.all(
      budgets.map(async (budget) => {
        const spent = await calculateCategorySpending(
          db,
          budget.categoryId as number,
          startDate,
          endDate,
          currency,
          fxSnapshot
        );

        let budgetAmount = budget.amount;
        if (budget.currency !== currency && isSupportedCurrency(budget.currency)) {
          try {
            budgetAmount = convertAmount(budget.amount, budget.currency, currency, fxSnapshot.rates);
          } catch (error) {
            console.error("Error converting budget amount:", error);
          }
        }

        const percentageUsed = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0;
        return {
          id: budget.id,
          categoryId: budget.categoryId as number,
          categoryName: budget.categoryName,
          amount: budgetAmount,
          currency,
          spent,
          remaining: Math.max(0, budgetAmount - spent),
          percentageUsed,
          isOverBudget: spent > budgetAmount,
        };
      })
    );

    const overallBudget = budgetsWithSpending.reduce((sum, budget) => sum + budget.amount, 0);
    const overallSpent = budgetsWithSpending.reduce((sum, budget) => sum + budget.spent, 0);
    const overallRemaining = Math.max(0, overallBudget - overallSpent);
    const overallPercentageUsed = overallBudget > 0 ? (overallSpent / overallBudget) * 100 : 0;

    return NextResponse.json({
      budgets: budgetsWithSpending,
      overallBudget,
      overallSpent,
      overallRemaining,
      overallPercentageUsed,
      currency,
      month,
    });
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return NextResponse.json({ error: "Failed to fetch budgets" }, { status: 500 });
  }
};

// POST create or update budget. One row per category id until monthly budgets land.
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { categoryId: categoryIdValue, amount, currency } = body;
    const categoryId = parseCategoryId(categoryIdValue);

    if (categoryId === null) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    if (typeof amount !== "number" || amount < 0) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }

    if (!currency || !isSupportedCurrency(currency)) {
      return NextResponse.json({ error: "Valid currency is required" }, { status: 400 });
    }

    const db = getDb(key);
    const category = db
      .select()
      .from(schema.transactionCategories)
      .where(eq(schema.transactionCategories.id, categoryId))
      .get();

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    if (category.transactionType !== "debit") {
      return NextResponse.json(
        { error: "Budgets can only be created for debit (expense) categories" },
        { status: 400 }
      );
    }

    const existingBudget = db
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.categoryId, categoryId))
      .get();

    const now = new Date();

    if (existingBudget) {
      const updated = db
        .update(schema.budgets)
        .set({
          amount,
          currency,
          updatedAt: now,
        })
        .where(eq(schema.budgets.id, existingBudget.id))
        .returning()
        .get();

      return NextResponse.json({
        ...updated,
        categoryId,
        categoryName: category.name,
      });
    }

    const result = db
      .insert(schema.budgets)
      .values({
        id: uuidv4(),
        categoryName: category.name,
        categoryId,
        amount,
        currency,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return NextResponse.json(
      {
        ...result,
        categoryId,
        categoryName: category.name,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating/updating budget:", error);
    return NextResponse.json({ error: "Failed to create/update budget" }, { status: 500 });
  }
};

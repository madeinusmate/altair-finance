import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency, isSupportedCurrency } from "@/lib/currencies";
import { v4 as uuidv4 } from "uuid";
import { startOfMonth, endOfDay, format } from "date-fns";

interface BudgetWithSpending {
  id: string;
  categoryName: string;
  amount: number;
  currency: string;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
}

// Calculate spending for a category in a date range
const calculateCategorySpending = async (
  db: ReturnType<typeof getDb>,
  categoryName: string,
  startDate: Date,
  endDate: Date,
  targetCurrency: SupportedCurrency,
  fxSnapshot: Awaited<ReturnType<typeof getFxSnapshot>>
): Promise<number> => {
  // Exclude Transfer category
  if (categoryName === "Transfer") {
    return 0;
  }

  // Get all debit transactions for this category in date range
  const transactions = db
    .select({
      amount: schema.transactions.amount,
      accountId: schema.transactions.accountId,
      accountType: schema.accounts.type,
    })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(
      and(
        eq(schema.transactions.type, "debit"),
        eq(schema.transactions.category, categoryName),
        gte(schema.transactions.date, startDate),
        lte(schema.transactions.date, endDate),
        ne(schema.accounts.type, "investment")
      )
    )
    .all();

  // Get account currencies for conversion
  const accounts = db.select().from(schema.accounts).all();
  const accountCurrencyMap = new Map(accounts.map((acc) => [acc.id, acc.currency]));

  // Sum and convert amounts
  let totalSpent = 0;
  transactions.forEach((transaction) => {
    const accountCurrency = accountCurrencyMap.get(transaction.accountId);
    if (!accountCurrency || !isSupportedCurrency(accountCurrency)) {
      return;
    }

    try {
      const convertedAmount = convertAmount(
        transaction.amount,
        accountCurrency,
        targetCurrency,
        fxSnapshot.rates
      );
      totalSpent += convertedAmount;
    } catch (error) {
      console.error(`Error converting amount for transaction:`, error);
    }
  });

  return totalSpent;
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
    const monthParam = searchParams.get("month"); // Optional: YYYY-MM format

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);

    // Determine date range (current month or specified month)
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

    // Get all budgets (migration should have created the table by now)
    let budgets;
    try {
      budgets = db.select().from(schema.budgets).all();
    } catch (error: any) {
      // If table doesn't exist yet, return empty budgets (migration should create it on next request)
      if (error?.code === "SQLITE_ERROR" && error?.message?.includes("no such table")) {
        console.warn("[Budgets API] Budgets table not found, returning empty list");
        budgets = [];
      } else {
        throw error;
      }
    }

    // Get all transaction categories
    const categories = db.select().from(schema.transactionCategories).all();
    const categoryNames = categories.map((cat) => cat.name);

    // Calculate spending for each budget category
    const budgetsWithSpending: BudgetWithSpending[] = await Promise.all(
      budgets.map(async (budget) => {
        const spent = await calculateCategorySpending(
          db,
          budget.categoryName,
          startDate,
          endDate,
          currency,
          fxSnapshot
        );

        // Convert budget amount to target currency
        let budgetAmount = budget.amount;
        if (budget.currency !== currency && isSupportedCurrency(budget.currency)) {
          try {
            budgetAmount = convertAmount(budget.amount, budget.currency, currency, fxSnapshot.rates);
          } catch (error) {
            console.error(`Error converting budget amount:`, error);
          }
        }

        const percentageUsed = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0;
        const remaining = Math.max(0, budgetAmount - spent);
        const isOverBudget = spent > budgetAmount;

        return {
          id: budget.id,
          categoryName: budget.categoryName,
          amount: budgetAmount,
          currency,
          spent,
          remaining,
          percentageUsed,
          isOverBudget,
        };
      })
    );

    // Calculate overall totals
    const overallBudget = budgetsWithSpending.reduce((sum, b) => sum + b.amount, 0);
    const overallSpent = budgetsWithSpending.reduce((sum, b) => sum + b.spent, 0);
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

// POST create or update budget
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { categoryName, amount, currency } = body;

    if (!categoryName || typeof categoryName !== "string") {
      return NextResponse.json({ error: "categoryName is required" }, { status: 400 });
    }

    if (typeof amount !== "number" || amount < 0) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }

    if (!currency || !isSupportedCurrency(currency)) {
      return NextResponse.json({ error: "Valid currency is required" }, { status: 400 });
    }

    const db = getDb(key);

    // Verify category exists
    const category = db
      .select()
      .from(schema.transactionCategories)
      .where(eq(schema.transactionCategories.name, categoryName))
      .get();

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Check if budget already exists for this category
    const existingBudget = db
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.categoryName, categoryName))
      .get();

    const now = new Date();

    if (existingBudget) {
      // Update existing budget
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

      return NextResponse.json(updated);
    } else {
      // Create new budget
      const newBudget = {
        id: uuidv4(),
        categoryName,
        amount,
        currency,
        createdAt: now,
        updatedAt: now,
      };

      const result = db.insert(schema.budgets).values(newBudget).returning().get();
      return NextResponse.json(result, { status: 201 });
    }
  } catch (error) {
    console.error("Error creating/updating budget:", error);
    return NextResponse.json({ error: "Failed to create/update budget" }, { status: 500 });
  }
};

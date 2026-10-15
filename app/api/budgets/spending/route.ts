import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency, isSupportedCurrency } from "@/lib/currencies";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const currency = (searchParams.get("currency") || "USD") as SupportedCurrency;

    if (!startDateParam || !endDateParam) {
      return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
    }

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const startDate = new Date(startDateParam);
    const endDate = new Date(endDateParam);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);

    // Get all budgets to know which categories to calculate
    const budgets = db
      .select({
        categoryId: schema.budgets.categoryId,
        categoryName: schema.transactionCategories.name,
      })
      .from(schema.budgets)
      .innerJoin(
        schema.transactionCategories,
        eq(schema.budgets.categoryId, schema.transactionCategories.id)
      )
      .where(eq(schema.transactionCategories.transactionType, "debit"))
      .all();
    const budgetCategories = new Map(
      budgets.flatMap((budget) =>
        budget.categoryId == null || !budget.categoryName ? [] : [[budget.categoryId, budget.categoryName] as const]
      )
    );

    const transactions = db
      .select({
        categoryId: schema.transactions.categoryId,
        amount: schema.transactions.amount,
        accountId: schema.transactions.accountId,
      })
      .from(schema.transactions)
      .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
      .where(
        and(
          eq(schema.transactions.type, "debit"),
          gte(schema.transactions.date, startDate),
          lte(schema.transactions.date, endDate),
          ne(schema.accounts.type, "investment")
        )
      )
      .all();

    // Get account currencies for conversion
    const accounts = db.select().from(schema.accounts).all();
    const accountCurrencyMap = new Map(accounts.map((acc) => [acc.id, acc.currency]));

    // Aggregate spending by category
    const spendingMap = new Map<number, number>();

    transactions.forEach((transaction) => {
      if (transaction.categoryId == null || !budgetCategories.has(transaction.categoryId)) {
        return;
      }

      const accountCurrency = accountCurrencyMap.get(transaction.accountId);
      if (!accountCurrency || !isSupportedCurrency(accountCurrency)) {
        return;
      }

      try {
        const convertedAmount = convertAmount(
          transaction.amount,
          accountCurrency,
          currency,
          fxSnapshot.rates
        );

        const current = spendingMap.get(transaction.categoryId) || 0;
        spendingMap.set(transaction.categoryId, current + convertedAmount);
      } catch (error) {
        console.error(`Error converting amount:`, error);
      }
    });

    // Convert to array format
    const spending = Array.from(spendingMap.entries()).map(([categoryId, spent]) => ({
      categoryId,
      categoryName: budgetCategories.get(categoryId) ?? "",
      spent,
      currency,
    }));

    const totalSpent = Array.from(spendingMap.values()).reduce((sum, amount) => sum + amount, 0);

    return NextResponse.json({
      spending,
      totalSpent,
      currency,
      period: {
        startDate: startDateParam,
        endDate: endDateParam,
      },
    });
  } catch (error) {
    console.error("Error calculating spending:", error);
    return NextResponse.json({ error: "Failed to calculate spending" }, { status: 500 });
  }
};

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
    const budgets = db.select().from(schema.budgets).all();
    const budgetCategories = new Set(budgets.map((b) => b.categoryName));

    // Get all debit transactions in date range (excluding transfers and investments)
    const transactions = db
      .select({
        category: schema.transactions.category,
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
          ne(schema.accounts.type, "investment"),
          ne(schema.transactions.category, "Transfer")
        )
      )
      .all();

    // Get account currencies for conversion
    const accounts = db.select().from(schema.accounts).all();
    const accountCurrencyMap = new Map(accounts.map((acc) => [acc.id, acc.currency]));

    // Aggregate spending by category
    const spendingMap = new Map<string, number>();

    transactions.forEach((transaction) => {
      // Only include categories that have budgets
      if (!budgetCategories.has(transaction.category)) {
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

        const current = spendingMap.get(transaction.category) || 0;
        spendingMap.set(transaction.category, current + convertedAmount);
      } catch (error) {
        console.error(`Error converting amount:`, error);
      }
    });

    // Convert to array format
    const spending = Array.from(spendingMap.entries()).map(([categoryName, spent]) => ({
      categoryName,
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

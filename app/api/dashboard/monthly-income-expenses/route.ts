import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { type SupportedCurrency } from "@/lib/currencies";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { format, eachMonthOfInterval } from "date-fns";

interface MonthlyIncomeExpenses {
  month: string; // "YYYY-MM"
  monthLabel: string; // "Jan 2024"
  income: number;
  expenses: number;
  currency: string;
}

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

    const startDate = new Date(startDateParam);
    const endDate = new Date(endDateParam);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);

    // Get all accounts for currency and type mapping
    const accounts = db.select().from(schema.accounts).all();
    const accountCurrencyMap = new Map(accounts.map((acc) => [acc.id, acc.currency]));
    const accountTypeMap = new Map(accounts.map((acc) => [acc.id, acc.type]));

    // Get all transactions in date range
    const allTransactions = db
      .select()
      .from(schema.transactions)
      .where(
        and(
          gte(schema.transactions.date, startDate),
          lte(schema.transactions.date, endDate)
        )
      )
      .all();

    // Generate all months in the date range
    const months = eachMonthOfInterval({ start: startDate, end: endDate });
    const monthlyData = new Map<string, { income: number; expenses: number }>();

    // Initialize all months with zero values
    months.forEach((monthDate) => {
      const monthKey = format(monthDate, "yyyy-MM");
      monthlyData.set(monthKey, { income: 0, expenses: 0 });
    });

    // Aggregate transactions by month
    allTransactions.forEach((transaction) => {
      const accountType = accountTypeMap.get(transaction.accountId);
      // Only count transactions on transaction accounts
      if (accountType === "transaction") {
        const transactionDate = new Date(transaction.date);
        const monthKey = format(transactionDate, "yyyy-MM");

        if (monthlyData.has(monthKey)) {
          const accountCurrency = accountCurrencyMap.get(transaction.accountId);
          const convertedAmount = convertAmount(
            transaction.amount,
            accountCurrency as SupportedCurrency,
            currency,
            fxSnapshot.rates
          );

          const monthData = monthlyData.get(monthKey)!;
          if (transaction.type === "credit") {
            monthData.income += convertedAmount;
          } else if (transaction.type === "debit") {
            monthData.expenses += convertedAmount;
          }
        }
      }
    });

    // Convert to array format with labels
    const result: MonthlyIncomeExpenses[] = months.map((monthDate) => {
      const monthKey = format(monthDate, "yyyy-MM");
      const data = monthlyData.get(monthKey) || { income: 0, expenses: 0 };
      return {
        month: monthKey,
        monthLabel: format(monthDate, "MMM yyyy"),
        income: Math.max(0, data.income), // Ensure non-negative
        expenses: Math.max(0, data.expenses), // Ensure non-negative
        currency,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error calculating monthly income/expenses:", error);
    return NextResponse.json({ error: "Failed to calculate monthly income/expenses" }, { status: 500 });
  }
};

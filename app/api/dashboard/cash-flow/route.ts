import { NextRequest, NextResponse } from "next/server";
import { gte, lte, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { TARGET_NET_WORTH_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";

interface CashFlowData {
  income: Array<{ category: string; amount: number }>;
  expenses: Array<{ category: string; amount: number }>;
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

    // Get all transactions in date range
    const transactions = db
      .select()
      .from(schema.transactions)
      .where(
        and(
          gte(schema.transactions.date, startDate),
          lte(schema.transactions.date, endDate)
        )
      )
      .all();

    // Get account currencies for conversion
    const accounts = db.select().from(schema.accounts).all();
    const accountCurrencyMap = new Map(accounts.map((acc) => [acc.id, acc.currency]));

    // Aggregate income (credits) and expenses (debits)
    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();

    transactions.forEach((transaction) => {
      const accountCurrency = accountCurrencyMap.get(transaction.accountId) || "USD";
      const convertedAmount = convertAmount(
        transaction.amount,
        accountCurrency as SupportedCurrency,
        currency,
        fxSnapshot.rates
      );

      if (transaction.type === "credit") {
        const current = incomeMap.get(transaction.category) || 0;
        incomeMap.set(transaction.category, current + convertedAmount);
      } else {
        const current = expenseMap.get(transaction.category) || 0;
        expenseMap.set(transaction.category, current + convertedAmount);
      }
    });

    // Convert maps to arrays and sort by amount descending
    const income: Array<{ category: string; amount: number }> = Array.from(incomeMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const expenses: Array<{ category: string; amount: number }> = Array.from(expenseMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      income,
      expenses,
      currency,
    } as CashFlowData & { currency: SupportedCurrency });
  } catch (error) {
    console.error("Error calculating cash flow:", error);
    return NextResponse.json({ error: "Failed to calculate cash flow" }, { status: 500 });
  }
};

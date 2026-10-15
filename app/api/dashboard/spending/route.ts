import { NextRequest, NextResponse } from "next/server";
import { gte, lte, and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency } from "@/lib/currencies";

interface SpendingCategory {
  categoryId: number;
  category: string;
  amount: number;
  percentage: number;
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

    // Get all debit transactions in date range
    const transactions = db
      .select({
        categoryId: schema.transactions.categoryId,
        category: schema.transactionCategories.name,
        amount: schema.transactions.amount,
        accountId: schema.transactions.accountId,
      })
      .from(schema.transactions)
      .innerJoin(
        schema.transactionCategories,
        eq(schema.transactions.categoryId, schema.transactionCategories.id)
      )
      .where(
        and(
          eq(schema.transactions.type, "debit"),
          gte(schema.transactions.date, startDate),
          lte(schema.transactions.date, endDate)
        )
      )
      .all();

    // Get account currencies for conversion
    const accounts = db.select().from(schema.accounts).all();
    const accountCurrencyMap = new Map(accounts.map((acc) => [acc.id, acc.currency]));

    // Aggregate spending by category id and label the slice with the current name.
    const categoryMap = new Map<number, { category: string; amount: number }>();

    transactions.forEach((transaction) => {
      if (transaction.categoryId == null) {
        return;
      }
      const accountCurrency = accountCurrencyMap.get(transaction.accountId) || "USD";
      const convertedAmount = convertAmount(
        transaction.amount,
        accountCurrency as SupportedCurrency,
        currency,
        fxSnapshot.rates
      );

      const current = categoryMap.get(transaction.categoryId);
      categoryMap.set(transaction.categoryId, {
        category: transaction.category,
        amount: (current?.amount ?? 0) + convertedAmount,
      });
    });

    // Calculate total for percentage calculation
    const total = Array.from(categoryMap.values()).reduce((sum, item) => sum + item.amount, 0);

    // Convert to array, calculate percentages, and sort by amount descending
    const categories: SpendingCategory[] = Array.from(categoryMap.entries())
      .map(([categoryId, item]) => ({
        categoryId,
        category: item.category,
        amount: item.amount,
        percentage: total > 0 ? (item.amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      categories,
      total,
      currency,
    });
  } catch (error) {
    console.error("Error calculating spending:", error);
    return NextResponse.json({ error: "Failed to calculate spending" }, { status: 500 });
  }
};

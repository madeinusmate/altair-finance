import { NextRequest, NextResponse } from "next/server";
import { gte, lte, and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency } from "@/lib/currencies";

interface CashFlowSlice {
  categoryId: number;
  category: string;
  amount: number;
}

interface CashFlowData {
  income: CashFlowSlice[];
  expenses: CashFlowSlice[];
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
      .select({
        categoryId: schema.transactions.categoryId,
        category: schema.transactionCategories.name,
        amount: schema.transactions.amount,
        accountId: schema.transactions.accountId,
        type: schema.transactions.type,
      })
      .from(schema.transactions)
      .innerJoin(
        schema.transactionCategories,
        eq(schema.transactions.categoryId, schema.transactionCategories.id)
      )
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

    // Aggregate income (credits) and expenses (debits) by category id.
    const incomeMap = new Map<number, CashFlowSlice>();
    const expenseMap = new Map<number, CashFlowSlice>();

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

      const target = transaction.type === "credit" ? incomeMap : expenseMap;
      const current = target.get(transaction.categoryId);
      target.set(transaction.categoryId, {
        categoryId: transaction.categoryId,
        category: transaction.category,
        amount: (current?.amount ?? 0) + convertedAmount,
      });
    });

    const income = Array.from(incomeMap.values()).sort((a, b) => b.amount - a.amount);
    const expenses = Array.from(expenseMap.values()).sort((a, b) => b.amount - a.amount);

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

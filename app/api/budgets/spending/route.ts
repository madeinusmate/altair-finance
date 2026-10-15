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
    const budgets = db.select().from(schema.budgets).all();
    const budgetCategoryIds = new Set(
      budgets.flatMap((budget) => (budget.categoryId == null ? [] : [budget.categoryId]))
    );

    const transactions = db
      .select({
        categoryId: schema.transactions.categoryId,
        categoryName: schema.transactionCategories.name,
        amount: schema.transactions.amount,
        accountCurrency: schema.accounts.currency,
      })
      .from(schema.transactions)
      .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
      .innerJoin(
        schema.transactionCategories,
        eq(schema.transactions.categoryId, schema.transactionCategories.id)
      )
      .where(
        and(
          eq(schema.transactions.type, "debit"),
          gte(schema.transactions.date, startDate),
          lte(schema.transactions.date, endDate),
          ne(schema.accounts.type, "investment")
        )
      )
      .all();

    const spendingMap = new Map<number, { categoryId: number; categoryName: string; spent: number }>();

    for (const transaction of transactions) {
      if (transaction.categoryId == null || !budgetCategoryIds.has(transaction.categoryId)) {
        continue;
      }
      if (!isSupportedCurrency(transaction.accountCurrency)) {
        continue;
      }

      try {
        const convertedAmount = convertAmount(
          transaction.amount,
          transaction.accountCurrency,
          currency,
          fxSnapshot.rates
        );
        const current = spendingMap.get(transaction.categoryId);
        if (current) {
          current.spent += convertedAmount;
        } else {
          spendingMap.set(transaction.categoryId, {
            categoryId: transaction.categoryId,
            categoryName: transaction.categoryName,
            spent: convertedAmount,
          });
        }
      } catch {
        console.error("Error converting amount");
      }
    }

    const spending = Array.from(spendingMap.values()).map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      spent: row.spent,
      currency,
    }));
    const totalSpent = spending.reduce((sum, row) => sum + row.spent, 0);

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

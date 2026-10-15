import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency, isSupportedCurrency } from "@/lib/currencies";
import { startOfMonth, endOfDay, format } from "date-fns";

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
      console.error("Error converting amount:", error);
    }
  });

  return totalSpent;
};

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const currency = (searchParams.get("currency") || "USD") as SupportedCurrency;

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);

    const now = new Date();
    const startDate = startOfMonth(now);
    const endDate = endOfDay(now);
    const month = format(now, "yyyy-MM");

    const budgets = db
      .select({
        categoryId: schema.budgets.categoryId,
        amount: schema.budgets.amount,
        currency: schema.budgets.currency,
        transactionType: schema.transactionCategories.transactionType,
      })
      .from(schema.budgets)
      .innerJoin(
        schema.transactionCategories,
        eq(schema.budgets.categoryId, schema.transactionCategories.id)
      )
      .all()
      .filter((budget) => budget.transactionType === "debit" && budget.categoryId != null);

    if (budgets.length === 0) {
      return NextResponse.json({
        overallBudget: 0,
        overallSpent: 0,
        overallRemaining: 0,
        overallPercentageUsed: 0,
        currency,
        status: "under" as const,
        month,
      });
    }

    let overallBudget = 0;
    let overallSpent = 0;

    await Promise.all(
      budgets.map(async (budget) => {
        let budgetAmount = budget.amount;
        if (budget.currency !== currency && isSupportedCurrency(budget.currency)) {
          try {
            budgetAmount = convertAmount(budget.amount, budget.currency, currency, fxSnapshot.rates);
          } catch (error) {
            console.error("Error converting budget amount:", error);
          }
        }

        overallBudget += budgetAmount;
        overallSpent += await calculateCategorySpending(
          db,
          budget.categoryId as number,
          startDate,
          endDate,
          currency,
          fxSnapshot
        );
      })
    );

    const overallRemaining = Math.max(0, overallBudget - overallSpent);
    const overallPercentageUsed = overallBudget > 0 ? (overallSpent / overallBudget) * 100 : 0;

    let status: "under" | "approaching" | "over";
    if (overallPercentageUsed > 100) {
      status = "over";
    } else if (overallPercentageUsed >= 75) {
      status = "approaching";
    } else {
      status = "under";
    }

    return NextResponse.json({
      overallBudget,
      overallSpent,
      overallRemaining,
      overallPercentageUsed,
      currency,
      status,
      month,
    });
  } catch (error) {
    console.error("Error fetching budget summary:", error);
    return NextResponse.json({ error: "Failed to fetch budget summary" }, { status: 500 });
  }
};

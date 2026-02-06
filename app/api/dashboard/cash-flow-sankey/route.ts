import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { type SupportedCurrency } from "@/lib/currencies";
import { convertAmount, getFxSnapshot } from "@/lib/fx";

interface CashFlowSankeyData {
  income: number;
  investment: number;
  savings: number;
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

    // Get all accounts for currency mapping
    const accounts = db.select().from(schema.accounts).all();
    const accountCurrencyMap = new Map(accounts.map((acc) => [acc.id, acc.currency]));
    const accountTypeMap = new Map(accounts.map((acc) => [acc.id, acc.type]));

    // Calculate Income: Sum of all credit transactions on transaction accounts
    const incomeTransactions = db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.type, "credit"),
          gte(schema.transactions.date, startDate),
          lte(schema.transactions.date, endDate)
        )
      )
      .all();

    let totalIncome = 0;
    incomeTransactions.forEach((transaction) => {
      const accountType = accountTypeMap.get(transaction.accountId);
      // Only count credits on transaction accounts
      if (accountType === "transaction") {
        const accountCurrency = accountCurrencyMap.get(transaction.accountId);
        const convertedAmount = convertAmount(
          transaction.amount,
          accountCurrency as SupportedCurrency,
          currency,
          fxSnapshot.rates
        );
        totalIncome += convertedAmount;
      }
    });

    // Calculate Expenses: Sum of all debit transactions on transaction accounts
    const expenseTransactions = db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.type, "debit"),
          gte(schema.transactions.date, startDate),
          lte(schema.transactions.date, endDate)
        )
      )
      .all();

    let totalExpenses = 0;
    expenseTransactions.forEach((transaction) => {
      const accountType = accountTypeMap.get(transaction.accountId);
      // Only count debits on transaction accounts
      if (accountType === "transaction") {
        const accountCurrency = accountCurrencyMap.get(transaction.accountId);
        const convertedAmount = convertAmount(
          transaction.amount,
          accountCurrency as SupportedCurrency,
          currency,
          fxSnapshot.rates
        );
        totalExpenses += convertedAmount;
      }
    });

    // Calculate Investment: Sum of toAmount from transfers where destination is an investment account
    const transfers = db
      .select()
      .from(schema.transfers)
      .where(
        and(
          gte(schema.transfers.date, startDate),
          lte(schema.transfers.date, endDate)
        )
      )
      .all();

    let totalInvestment = 0;
    transfers.forEach((transfer) => {
      const toAccountType = accountTypeMap.get(transfer.toAccountId);
      // Only count transfers to investment accounts
      if (toAccountType === "investment") {
        const toAccountCurrency = accountCurrencyMap.get(transfer.toAccountId);
        const convertedAmount = convertAmount(
          transfer.toAmount ?? transfer.amount,
          toAccountCurrency as SupportedCurrency,
          currency,
          fxSnapshot.rates
        );
        totalInvestment += convertedAmount;
      }
    });

    // Calculate Savings: Income - Investment - Expenses (can be negative)
    const totalSavings = totalIncome - totalInvestment - totalExpenses;

    const result: CashFlowSankeyData = {
      income: Math.max(0, totalIncome), // Ensure non-negative
      investment: Math.max(0, totalInvestment), // Ensure non-negative
      savings: totalSavings, // Can be negative
      expenses: Math.max(0, totalExpenses), // Ensure non-negative
      currency,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error calculating cash flow Sankey data:", error);
    return NextResponse.json({ error: "Failed to calculate cash flow" }, { status: 500 });
  }
};

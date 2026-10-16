import type { SupportedCurrency } from "@/lib/currencies";
import { sumLiquidBalances, type InsightAccount, type InsightSnapshot } from "@/lib/insights/balances";
import {
  averageTrailingExpenses,
  computeRangeFlows,
  expenseTotalsByMonth,
  runwayMonthsFrom,
  type FlowTransaction,
  type FlowTransfer,
} from "@/lib/insights/flows";
import { earliestInstant, trailingCompleteMonths } from "@/lib/insights/range";

export type SavingsAccount = InsightAccount & {
  createdAt: Date;
};

export type SavingsTransaction = FlowTransaction;

export type SavingsTransfer = FlowTransfer;

export type SavingsInsight = {
  currency: SupportedCurrency;
  range: { startDate: string; endDate: string };
  income: number;
  expenses: number;
  kept: number;
  savingsRate: number | null;
  signedInvestment: number;
  leftInCash: number;
  liquid: number;
  typicalMonthlyExpenses: number | null;
  typicalMonthCount: number;
  runwayMonths: number | null;
  hasUnsupportedCurrencies: boolean;
};

export type SavingsInsightInput = {
  accounts: ReadonlyArray<SavingsAccount>;
  transactions: ReadonlyArray<SavingsTransaction>;
  transfers: ReadonlyArray<SavingsTransfer>;
  balanceHistory: ReadonlyArray<InsightSnapshot>;
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  currency: SupportedCurrency;
  rates: Record<SupportedCurrency, number>;
  now: Date;
};

const RUNWAY_MONTHS = 3;

export const buildSavingsInsight = ({
  accounts,
  transactions,
  transfers,
  balanceHistory,
  start,
  end,
  startDate,
  endDate,
  currency,
  rates,
  now,
}: SavingsInsightInput): SavingsInsight => {
  const flows = computeRangeFlows({
    accounts,
    transactions,
    transfers,
    start,
    end,
    currency,
    rates,
  });

  const liquid = sumLiquidBalances({
    accounts,
    transactions,
    transfers,
    balanceHistory,
    currency,
    rates,
  });

  const window = trailingCompleteMonths(now, RUNWAY_MONTHS);
  const monthly = expenseTotalsByMonth(accounts, transactions, window, currency, rates);
  const oldest = earliestInstant([
    ...accounts.map((account) => account.createdAt),
    ...transactions.map((transaction) => transaction.date),
    ...transfers.map((transfer) => transfer.date),
    ...balanceHistory.map((row) => row.date),
  ]);
  const typical = averageTrailingExpenses(monthly.totals, window, oldest);

  return {
    currency,
    range: { startDate, endDate },
    income: flows.income,
    expenses: flows.expenses,
    kept: flows.kept,
    savingsRate: flows.savingsRate,
    signedInvestment: flows.signedInvestment,
    leftInCash: flows.leftInCash,
    liquid: liquid.liquid,
    typicalMonthlyExpenses: typical.typicalMonthlyExpenses,
    typicalMonthCount: typical.typicalMonthCount,
    runwayMonths: runwayMonthsFrom(liquid.liquid, typical.typicalMonthlyExpenses),
    hasUnsupportedCurrencies:
      flows.hasUnsupportedCurrencies || liquid.hasUnsupportedCurrencies || monthly.hasUnsupportedCurrencies,
  };
};

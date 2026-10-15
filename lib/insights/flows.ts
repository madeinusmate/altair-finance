import { format } from "date-fns";
import type { SupportedCurrency } from "@/lib/currencies";
import { convertLedgerAmount, type UnsupportedCurrencyMode } from "@/lib/insights/convert";
import { completeMonthsOnLedger, type InsightMonth } from "@/lib/insights/range";

export type FlowAccount = {
  id: string;
  type: string;
  currency: string;
};

export type FlowTransaction = {
  accountId: string;
  type: string;
  amount: number;
  date: Date;
};

export type FlowTransfer = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fromAmount: number | null;
  toAmount: number | null;
  date: Date;
};

export type RangeFlows = {
  income: number;
  expenses: number;
  kept: number;
  savingsRate: number | null;
  signedInvestment: number;
  investmentIn: number;
  investmentOut: number;
  leftInCash: number;
  hasUnsupportedCurrencies: boolean;
};

export type RangeFlowInput = {
  accounts: ReadonlyArray<FlowAccount>;
  transactions: ReadonlyArray<FlowTransaction>;
  transfers: ReadonlyArray<FlowTransfer>;
  start: Date;
  end: Date;
  currency: SupportedCurrency;
  rates: Record<SupportedCurrency, number>;
  unsupported?: UnsupportedCurrencyMode;
};

const inRange = (date: Date, startMs: number, endMs: number): boolean => {
  const time = date.getTime();
  return !Number.isNaN(time) && time >= startMs && time <= endMs;
};

/**
 * Income, expenses, and signed investment for one range.
 * Amounts stay full precision. Investment is not clamped.
 * Savings rate is `kept / income` (net cash), never the sankey residual.
 */
export const computeRangeFlows = ({
  accounts,
  transactions,
  transfers,
  start,
  end,
  currency,
  rates,
  unsupported = "skip",
}: RangeFlowInput): RangeFlows => {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const startMs = start.getTime();
  const endMs = end.getTime();
  let income = 0;
  let expenses = 0;
  let investmentIn = 0;
  let investmentOut = 0;
  let hasUnsupportedCurrencies = false;

  const addConverted = (amount: number, account: FlowAccount | undefined): number | null => {
    if (!account) {
      if (unsupported === "throw") {
        convertLedgerAmount(amount, "", currency, rates, "throw");
      }
      return null;
    }

    const converted = convertLedgerAmount(amount, account.currency, currency, rates, unsupported);
    if (converted.skipped) {
      hasUnsupportedCurrencies = true;
      return null;
    }
    return converted.amount;
  };

  for (const transaction of transactions) {
    if (!inRange(transaction.date, startMs, endMs)) {
      continue;
    }

    const account = accountsById.get(transaction.accountId);
    if (account?.type !== "transaction") {
      continue;
    }

    const converted = addConverted(transaction.amount, account);
    if (converted === null) {
      continue;
    }

    if (transaction.type === "credit") {
      income += converted;
    } else if (transaction.type === "debit") {
      expenses += converted;
    }
  }

  for (const transfer of transfers) {
    if (!inRange(transfer.date, startMs, endMs)) {
      continue;
    }

    const fromAccount = accountsById.get(transfer.fromAccountId);
    const toAccount = accountsById.get(transfer.toAccountId);
    const intoInvestment = toAccount?.type === "investment" && fromAccount?.type === "transaction";
    const outOfInvestment = fromAccount?.type === "investment" && toAccount?.type === "transaction";

    if (intoInvestment) {
      const converted = addConverted(transfer.toAmount ?? transfer.amount, toAccount);
      if (converted !== null) {
        investmentIn += converted;
      }
    } else if (outOfInvestment) {
      const converted = addConverted(transfer.fromAmount ?? transfer.amount, fromAccount);
      if (converted !== null) {
        investmentOut += converted;
      }
    }
  }

  const signedInvestment = investmentIn - investmentOut;
  const kept = income - expenses;

  return {
    income,
    expenses,
    kept,
    savingsRate: income > 0 ? kept / income : null,
    signedInvestment,
    investmentIn,
    investmentOut,
    leftInCash: kept - signedInvestment,
    hasUnsupportedCurrencies,
  };
};

/** Sankey Savings node. Clamped investment, raw income and expenses. Not the savings rate. */
export const sankeySavingsResidual = (income: number, expenses: number, signedInvestment: number): number => {
  return income - Math.max(0, signedInvestment) - expenses;
};

export type SankeyNodes = {
  income: number;
  investment: number;
  savings: number;
  expenses: number;
};

/** Node clamps the sankey route already returns. The savings node stays signed. */
export const toSankeyNodes = (flows: Pick<RangeFlows, "income" | "expenses" | "signedInvestment">): SankeyNodes => {
  const investment = Math.max(0, flows.signedInvestment);
  return {
    income: Math.max(0, flows.income),
    investment: Math.max(0, investment),
    savings: sankeySavingsResidual(flows.income, flows.expenses, flows.signedInvestment),
    expenses: Math.max(0, flows.expenses),
  };
};

export const expenseTotalsByMonth = (
  accounts: ReadonlyArray<FlowAccount>,
  transactions: ReadonlyArray<FlowTransaction>,
  months: ReadonlyArray<Pick<InsightMonth, "month">>,
  currency: SupportedCurrency,
  rates: Record<SupportedCurrency, number>,
  unsupported: UnsupportedCurrencyMode = "skip",
): { totals: Map<string, number>; hasUnsupportedCurrencies: boolean } => {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const totals = new Map<string, number>();
  for (const month of months) {
    totals.set(month.month, 0);
  }

  let hasUnsupportedCurrencies = false;

  for (const transaction of transactions) {
    if (transaction.type !== "debit") {
      continue;
    }

    const account = accountsById.get(transaction.accountId);
    if (account?.type !== "transaction") {
      continue;
    }

    const monthKey = format(transaction.date, "yyyy-MM");
    if (!totals.has(monthKey)) {
      continue;
    }

    const converted = convertLedgerAmount(transaction.amount, account.currency, currency, rates, unsupported);
    if (converted.skipped) {
      hasUnsupportedCurrencies = true;
      continue;
    }

    totals.set(monthKey, (totals.get(monthKey) ?? 0) + converted.amount);
  }

  return { totals, hasUnsupportedCurrencies };
};

export const averageTrailingExpenses = (
  totals: ReadonlyMap<string, number>,
  window: ReadonlyArray<InsightMonth>,
  oldest: Date | null,
): { typicalMonthlyExpenses: number | null; typicalMonthCount: number } => {
  const available = completeMonthsOnLedger(window, oldest);
  if (available.length === 0) {
    return { typicalMonthlyExpenses: null, typicalMonthCount: 0 };
  }

  let sum = 0;
  for (const month of available) {
    sum += totals.get(month.month) ?? 0;
  }

  return {
    typicalMonthlyExpenses: sum / available.length,
    typicalMonthCount: available.length,
  };
};

export const runwayMonthsFrom = (liquid: number, typicalMonthlyExpenses: number | null): number | null => {
  if (typicalMonthlyExpenses === null || typicalMonthlyExpenses <= 0) {
    return null;
  }
  return Math.max(0, liquid) / typicalMonthlyExpenses;
};

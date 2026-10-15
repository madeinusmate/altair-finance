import { calculateTransactionAccountBalance } from "@/lib/accounting";
import type { SupportedCurrency } from "@/lib/currencies";
import { convertLedgerAmount } from "@/lib/insights/convert";

export const LIQUID_ACCOUNT_CATEGORIES = ["checking", "savings", "cash"] as const;

const LIQUID_CATEGORIES: ReadonlySet<string> = new Set(LIQUID_ACCOUNT_CATEGORIES);

export type InsightAccount = {
  id: string;
  type: string;
  nature: string;
  category: string;
  currency: string;
  initialBalance: number;
};

export type InsightActivity = {
  accountId: string;
  type: string;
  amount: number;
};

export type InsightTransferLeg = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fromAmount: number | null;
  toAmount: number | null;
};

export type InsightSnapshot = {
  accountId: string;
  balance: number;
  date: Date;
  createdAt: Date;
};

const roundWithPrecision = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Hero rounding only. Savings rate and runway sums stay full precision. */
export const roundForNetWorth = (value: number): number => {
  const decimals = Math.abs(value) >= 1_000_000 ? 0 : 2;
  return roundWithPrecision(value, decimals);
};

/** Asset / liability split from `GET /api/net-worth`. Not used for runway. */
export const classifyConvertedBalance = (
  nature: string,
  convertedBalance: number,
): { assets: number; liabilities: number } => {
  if (nature === "asset") {
    return { assets: convertedBalance, liabilities: 0 };
  }
  if (convertedBalance >= 0) {
    return { assets: 0, liabilities: convertedBalance };
  }
  return { assets: Math.abs(convertedBalance), liabilities: 0 };
};

export const isLiquidAccount = (account: Pick<InsightAccount, "category" | "nature" | "type">): boolean => {
  return (
    LIQUID_CATEGORIES.has(account.category) &&
    account.nature === "asset" &&
    (account.type === "transaction" || account.type === "balance")
  );
};

/** Greatest `date`, then greatest `createdAt`. Optional `asOf` drops later rows. */
export const selectLatestSnapshot = (
  rows: ReadonlyArray<InsightSnapshot>,
  asOf?: Date,
): InsightSnapshot | null => {
  let best: InsightSnapshot | null = null;
  const cap = asOf?.getTime();

  for (const row of rows) {
    const rowTime = row.date.getTime();
    if (Number.isNaN(rowTime)) {
      continue;
    }
    if (cap !== undefined && rowTime > cap) {
      continue;
    }
    if (!best) {
      best = row;
      continue;
    }

    const bestTime = best.date.getTime();
    if (rowTime > bestTime || (rowTime === bestTime && row.createdAt.getTime() > best.createdAt.getTime())) {
      best = row;
    }
  }

  return best;
};

export const transactionAccountBalance = (
  account: Pick<InsightAccount, "id" | "initialBalance" | "nature">,
  transactions: ReadonlyArray<InsightActivity>,
  transfers: ReadonlyArray<InsightTransferLeg>,
): number => {
  let credits = 0;
  let debits = 0;
  for (const transaction of transactions) {
    if (transaction.accountId !== account.id) {
      continue;
    }
    if (transaction.type === "credit") {
      credits += transaction.amount;
    } else if (transaction.type === "debit") {
      debits += transaction.amount;
    }
  }

  let transferIn = 0;
  let transferOut = 0;
  for (const transfer of transfers) {
    if (transfer.toAccountId === account.id) {
      transferIn += transfer.toAmount ?? transfer.amount;
    }
    if (transfer.fromAccountId === account.id) {
      transferOut += transfer.fromAmount ?? transfer.amount;
    }
  }

  const nature = account.nature === "liability" ? "liability" : "asset";
  return calculateTransactionAccountBalance(
    account.initialBalance,
    credits,
    debits,
    transferIn,
    transferOut,
    nature,
  );
};

export const currentAccountBalance = (
  account: InsightAccount,
  transactions: ReadonlyArray<InsightActivity>,
  transfers: ReadonlyArray<InsightTransferLeg>,
  balanceHistory: ReadonlyArray<InsightSnapshot>,
  investmentHistory: ReadonlyArray<InsightSnapshot> = [],
): number => {
  if (account.type === "balance") {
    const latest = selectLatestSnapshot(balanceHistory.filter((row) => row.accountId === account.id));
    return latest?.balance ?? account.initialBalance;
  }

  if (account.type === "investment") {
    const latest = selectLatestSnapshot(investmentHistory.filter((row) => row.accountId === account.id));
    return latest?.balance ?? 0;
  }

  return transactionAccountBalance(account, transactions, transfers);
};

const snapshotsByAccount = (rows: ReadonlyArray<InsightSnapshot>): Map<string, InsightSnapshot[]> => {
  const grouped = new Map<string, InsightSnapshot[]>();
  for (const row of rows) {
    const list = grouped.get(row.accountId);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.accountId, [row]);
    }
  }
  return grouped;
};

export type LiquidBalanceInput = {
  accounts: ReadonlyArray<InsightAccount>;
  transactions: ReadonlyArray<InsightActivity>;
  transfers: ReadonlyArray<InsightTransferLeg>;
  balanceHistory: ReadonlyArray<InsightSnapshot>;
  investmentHistory?: ReadonlyArray<InsightSnapshot>;
  currency: SupportedCurrency;
  rates: Record<SupportedCurrency, number>;
};

/** Current liquid balances in the display currency. No net-worth rounding. */
export const sumLiquidBalances = ({
  accounts,
  transactions,
  transfers,
  balanceHistory,
  investmentHistory = [],
  currency,
  rates,
}: LiquidBalanceInput): { liquid: number; hasUnsupportedCurrencies: boolean } => {
  const balanceRows = snapshotsByAccount(balanceHistory);
  const investmentRows = snapshotsByAccount(investmentHistory);
  let liquid = 0;
  let hasUnsupportedCurrencies = false;

  for (const account of accounts) {
    if (!isLiquidAccount(account)) {
      continue;
    }

    const balance = currentAccountBalance(
      account,
      transactions,
      transfers,
      balanceRows.get(account.id) ?? [],
      investmentRows.get(account.id) ?? [],
    );
    const converted = convertLedgerAmount(balance, account.currency, currency, rates, "skip");
    if (converted.skipped) {
      hasUnsupportedCurrencies = true;
      continue;
    }
    liquid += converted.amount;
  }

  return { liquid, hasUnsupportedCurrencies };
};

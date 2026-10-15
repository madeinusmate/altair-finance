import { convertAmount } from "@/lib/fx";
import { isSupportedCurrency, type SupportedCurrency } from "@/lib/currencies";
import { formatAsOfDate, listMonths } from "@/lib/insights/range";
import {
  classifyConvertedBalance,
  roundForNetWorth,
  snapshotBalancesForMonths,
  transactionBalancesForMonths,
  type InsightAccount,
  type InsightSnapshot,
  type InsightTransaction,
  type InsightTransfer,
} from "@/lib/insights/balances";

export interface NetWorthPoint {
  month: string;
  monthLabel: string;
  asOf: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface NetWorthSeries {
  points: NetWorthPoint[];
  hasUnsupportedCurrencies: boolean;
  unsupportedCurrencies: string[];
}

export interface NetWorthHistory extends NetWorthSeries {
  currency: string;
}

export interface NetWorthSeriesInput {
  accounts: readonly InsightAccount[];
  transactions: readonly InsightTransaction[];
  transfers: readonly InsightTransfer[];
  balanceHistory: readonly InsightSnapshot[];
  investmentHistory: readonly InsightSnapshot[];
  start: Date;
  end: Date;
  currency: SupportedCurrency;
  rates: Record<SupportedCurrency, number>;
}

interface MonthBucket {
  assets: number;
  liabilities: number;
}

const groupBy = <T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = grouped.get(id);
    if (list) {
      list.push(row);
    } else {
      grouped.set(id, [row]);
    }
  }
  return grouped;
};

const unsupportedCurrenciesIn = (accounts: readonly InsightAccount[]): string[] => {
  const unsupported: string[] = [];
  const seen = new Set<string>();
  for (const account of accounts) {
    if (isSupportedCurrency(account.currency) || seen.has(account.currency)) {
      continue;
    }
    seen.add(account.currency);
    unsupported.push(account.currency);
  }
  return unsupported;
};

const applyNativeBalance = (
  bucket: MonthBucket,
  account: InsightAccount,
  nativeBalance: number,
  currency: SupportedCurrency,
  rates: Record<SupportedCurrency, number>
): void => {
  if (!isSupportedCurrency(account.currency)) {
    return;
  }

  const converted = roundForNetWorth(convertAmount(nativeBalance, account.currency, currency, rates));
  const classified = classifyConvertedBalance(account.nature, converted);
  bucket.assets += classified.assets;
  bucket.liabilities += classified.liabilities;
};

/**
 * Household assets, liabilities, and net worth for each month in the range.
 * One forward pass per account. Every month uses the same rate map.
 * Does not read the database and does not include investment profit/loss.
 */
export const buildNetWorthSeries = ({
  accounts,
  transactions,
  transfers,
  balanceHistory,
  investmentHistory,
  start,
  end,
  currency,
  rates,
}: NetWorthSeriesInput): NetWorthSeries => {
  const unsupportedCurrencies = unsupportedCurrenciesIn(accounts);
  if (unsupportedCurrencies.length > 0) {
    return {
      points: [],
      hasUnsupportedCurrencies: true,
      unsupportedCurrencies,
    };
  }

  const months = listMonths(start, end);
  const buckets: MonthBucket[] = months.map(() => ({ assets: 0, liabilities: 0 }));
  const transactionsByAccount = groupBy(transactions, (transaction) => transaction.accountId);
  const incomingByAccount = groupBy(transfers, (transfer) => transfer.toAccountId);
  const outgoingByAccount = groupBy(transfers, (transfer) => transfer.fromAccountId);
  const balanceHistoryByAccount = groupBy(balanceHistory, (row) => row.accountId);
  const investmentHistoryByAccount = groupBy(investmentHistory, (row) => row.accountId);

  for (const account of accounts) {
    let nativeBalances: Array<number | null>;

    if (account.type === "transaction") {
      nativeBalances = transactionBalancesForMonths(
        account,
        months,
        transactionsByAccount.get(account.id) ?? [],
        incomingByAccount.get(account.id) ?? [],
        outgoingByAccount.get(account.id) ?? []
      );
    } else if (account.type === "balance") {
      nativeBalances = snapshotBalancesForMonths(
        account,
        months,
        balanceHistoryByAccount.get(account.id) ?? [],
        "initial"
      );
    } else if (account.type === "investment") {
      nativeBalances = snapshotBalancesForMonths(
        account,
        months,
        investmentHistoryByAccount.get(account.id) ?? [],
        "omit"
      );
    } else {
      continue;
    }

    for (let index = 0; index < months.length; index += 1) {
      const nativeBalance = nativeBalances[index];
      if (nativeBalance === null) {
        continue;
      }
      applyNativeBalance(buckets[index], account, nativeBalance, currency, rates);
    }
  }

  return {
    points: months.map((month, index) => ({
      month: month.month,
      monthLabel: month.monthLabel,
      asOf: formatAsOfDate(month.asOf),
      assets: buckets[index].assets,
      liabilities: buckets[index].liabilities,
      netWorth: buckets[index].assets - buckets[index].liabilities,
    })),
    hasUnsupportedCurrencies: false,
    unsupportedCurrencies: [],
  };
};

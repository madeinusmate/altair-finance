import { isSupportedCurrency, type SupportedCurrency } from "@/lib/currencies";
import { convertAmount } from "@/lib/fx";
import { formatLocalDate, yearAgoPeriod } from "@/lib/insights/range";

/** Deltas under half a cent are flat so FX dust does not show a move. */
export const FLAT_DELTA = 0.005;

export type SpendingDirection = "up" | "down" | "flat";
export type SpendingStatus = "new" | "gone" | "ongoing";

export type SpendingAccount = {
  id: string;
  type: "balance" | "transaction" | "investment";
  currency: string;
};

/** Debits with no payee share this label in the payee breakdown. */
export const NO_PAYEE_LABEL = "No payee";

export type SpendingLedgerEntry =
  | {
      kind: "transaction";
      accountId: string;
      type: "debit" | "credit";
      category: string;
      payee?: string | null;
      amount: number;
      date: Date;
    }
  | {
      kind: "transfer";
      amount: number;
      date: Date;
    };

export type SpendingCategoryComparison = {
  category: string;
  amount: number;
  percentage: number;
  previousAmount: number;
  delta: number;
  percentChange: number | null;
  direction: SpendingDirection;
  status: SpendingStatus;
  yearAgoAmount?: number;
  yearAgoDelta?: number;
  yearAgoPercentChange?: number | null;
  yearAgoDirection?: SpendingDirection;
};

export type SpendingYearAgo = {
  startDate: string;
  endDate: string;
  total: number;
  totalDelta: number;
  totalPercentChange: number | null;
  totalDirection: SpendingDirection;
};

export type SpendingComparison = {
  categories: SpendingCategoryComparison[];
  /** Same row shape as categories. `category` holds the payee name. */
  payees: SpendingCategoryComparison[];
  total: number;
  previousTotal: number;
  totalDelta: number;
  totalPercentChange: number | null;
  totalDirection: SpendingDirection;
  comparison: { startDate: string; endDate: string; dayCount: number };
  yearAgo: SpendingYearAgo | null;
  currency: string;
  hasUnsupportedCurrencies: boolean;
};

export type AmountDelta = {
  delta: number;
  direction: SpendingDirection;
  percentChange: number | null;
  status: SpendingStatus;
};

export type DebitSum = {
  byCategory: Map<string, number>;
  byPayee: Map<string, number>;
  total: number;
  hasUnsupportedCurrencies: boolean;
};

export const payeeGroupName = (payee: string | null | undefined): string => {
  const name = payee?.trim();
  return name ? name : NO_PAYEE_LABEL;
};

const sumValues = (amounts: Map<string, number>): number => {
  let total = 0;
  for (const amount of amounts.values()) total += amount;
  return total;
};

const inWindow = (date: Date, start: Date, end: Date): boolean => {
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
};

/**
 * Debits on transaction accounts, grouped by category and by payee.
 * Transfers and credits are ignored. One unsupported account currency is skipped.
 */
export const sumTransactionDebits = (
  entries: readonly SpendingLedgerEntry[],
  accounts: readonly SpendingAccount[],
  rates: Record<SupportedCurrency, number>,
  displayCurrency: SupportedCurrency,
  start: Date,
  end: Date,
): DebitSum => {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const byCategory = new Map<string, number>();
  const byPayee = new Map<string, number>();
  let hasUnsupportedCurrencies = false;

  for (const entry of entries) {
    if (entry.kind !== "transaction") continue;
    if (entry.type !== "debit") continue;
    if (!inWindow(entry.date, start, end)) continue;

    const account = accountsById.get(entry.accountId);
    if (!account || account.type !== "transaction") continue;

    if (!isSupportedCurrency(account.currency)) {
      hasUnsupportedCurrencies = true;
      continue;
    }

    let converted: number;
    try {
      converted = convertAmount(entry.amount, account.currency, displayCurrency, rates);
    } catch {
      hasUnsupportedCurrencies = true;
      continue;
    }

    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + converted);
    const payee = payeeGroupName(entry.payee);
    byPayee.set(payee, (byPayee.get(payee) ?? 0) + converted);
  }

  return { byCategory, byPayee, total: sumValues(byCategory), hasUnsupportedCurrencies };
};

export const amountDelta = (current: number, previous: number): AmountDelta => {
  const delta = current - previous;
  const flat = Math.abs(delta) < FLAT_DELTA;
  const direction: SpendingDirection = flat ? "flat" : delta > 0 ? "up" : "down";
  const percentChange = previous > 0 && !flat ? (delta / previous) * 100 : null;
  const status: SpendingStatus =
    previous <= 0 && current > 0 ? "new" : current <= 0 && previous > 0 ? "gone" : "ongoing";
  return { delta, direction, percentChange, status };
};

const statusRank = (status: SpendingStatus): number => (status === "gone" ? 1 : 0);

/**
 * Union of category names. A row with no spend in both the current and previous
 * windows is omitted. Year-ago fields are present only when that map is passed.
 */
export const categoryDeltas = (
  current: Map<string, number>,
  previous: Map<string, number>,
  currentTotal: number,
  yearAgo: Map<string, number> | null,
): SpendingCategoryComparison[] => {
  const names = new Set<string>([
    ...current.keys(),
    ...previous.keys(),
    ...(yearAgo ? yearAgo.keys() : []),
  ]);
  const rows: SpendingCategoryComparison[] = [];

  for (const category of names) {
    const amount = current.get(category) ?? 0;
    const previousAmount = previous.get(category) ?? 0;
    if (amount <= 0 && previousAmount <= 0) continue;

    const compared = amountDelta(amount, previousAmount);
    const row: SpendingCategoryComparison = {
      category,
      amount,
      percentage: currentTotal > 0 ? (amount / currentTotal) * 100 : 0,
      previousAmount,
      delta: compared.delta,
      percentChange: compared.percentChange,
      direction: compared.direction,
      status: compared.status,
    };

    if (yearAgo) {
      const yearAgoAmount = yearAgo.get(category) ?? 0;
      const yearCompared = amountDelta(amount, yearAgoAmount);
      row.yearAgoAmount = yearAgoAmount;
      row.yearAgoDelta = yearCompared.delta;
      row.yearAgoPercentChange = yearCompared.percentChange;
      row.yearAgoDirection = yearCompared.direction;
    }

    rows.push(row);
  }

  return rows.toSorted((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    if (a.status === "gone" && b.status === "gone") {
      return b.previousAmount - a.previousAmount || a.category.localeCompare(b.category);
    }
    return b.amount - a.amount || a.category.localeCompare(b.category);
  });
};

export const yearAgoWindowForLedger = (
  start: Date,
  end: Date,
  oldestLedgerAt: Date | null,
): { start: Date; end: Date } | null => {
  const window = yearAgoPeriod(start, end);
  if (!window) return null;
  if (!oldestLedgerAt || oldestLedgerAt.getTime() > window.end.getTime()) return null;
  return window;
};

export const buildSpendingComparison = (input: {
  entries: readonly SpendingLedgerEntry[];
  accounts: readonly SpendingAccount[];
  rates: Record<SupportedCurrency, number>;
  displayCurrency: SupportedCurrency;
  current: { start: Date; end: Date };
  previous: { start: Date; end: Date; dayCount: number };
  yearAgo: { start: Date; end: Date } | null;
}): SpendingComparison => {
  const currentSum = sumTransactionDebits(
    input.entries,
    input.accounts,
    input.rates,
    input.displayCurrency,
    input.current.start,
    input.current.end,
  );
  const previousSum = sumTransactionDebits(
    input.entries,
    input.accounts,
    input.rates,
    input.displayCurrency,
    input.previous.start,
    input.previous.end,
  );
  const yearAgoSum = input.yearAgo
    ? sumTransactionDebits(
        input.entries,
        input.accounts,
        input.rates,
        input.displayCurrency,
        input.yearAgo.start,
        input.yearAgo.end,
      )
    : null;

  const totalCompared = amountDelta(currentSum.total, previousSum.total);
  const yearAgoCompared = yearAgoSum ? amountDelta(currentSum.total, yearAgoSum.total) : null;

  return {
    categories: categoryDeltas(
      currentSum.byCategory,
      previousSum.byCategory,
      currentSum.total,
      yearAgoSum ? yearAgoSum.byCategory : null,
    ),
    payees: categoryDeltas(
      currentSum.byPayee,
      previousSum.byPayee,
      currentSum.total,
      yearAgoSum ? yearAgoSum.byPayee : null,
    ),
    total: currentSum.total,
    previousTotal: previousSum.total,
    totalDelta: totalCompared.delta,
    totalPercentChange: totalCompared.percentChange,
    totalDirection: totalCompared.direction,
    comparison: {
      startDate: formatLocalDate(input.previous.start),
      endDate: formatLocalDate(input.previous.end),
      dayCount: input.previous.dayCount,
    },
    yearAgo:
      input.yearAgo && yearAgoSum && yearAgoCompared
        ? {
            startDate: formatLocalDate(input.yearAgo.start),
            endDate: formatLocalDate(input.yearAgo.end),
            total: yearAgoSum.total,
            totalDelta: yearAgoCompared.delta,
            totalPercentChange: yearAgoCompared.percentChange,
            totalDirection: yearAgoCompared.direction,
          }
        : null,
    currency: input.displayCurrency,
    hasUnsupportedCurrencies:
      currentSum.hasUnsupportedCurrencies ||
      previousSum.hasUnsupportedCurrencies ||
      (yearAgoSum?.hasUnsupportedCurrencies ?? false),
  };
};

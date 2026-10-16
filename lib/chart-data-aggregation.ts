import { Transaction, Transfer, BalanceHistory, InvestmentHistory } from "@/lib/db/schema";
import { calculateTransactionAccountBalance, calculateNetContributions } from "@/lib/accounting";
import { startOfMonth, endOfMonth, endOfDay, format, eachMonthOfInterval, parseISO } from "date-fns";

export interface MonthlyInflowOutflow {
  month: string; // "YYYY-MM" format
  monthLabel: string; // "Jan 2024" format
  inflow: number;
  outflow: number;
}

export interface MonthlyBalance {
  month: string; // "YYYY-MM" format
  monthLabel: string; // "Jan 2024" format
  balance: number;
}

export interface PNLDataPoint {
  date: Date;
  dateLabel: string; // "Jan 1, 2024" format
  balance: number;
  netContributions: number;
  pnl: number;
}

/**
 * Format currency with smart abbreviation (K, M for large values)
 */
export const formatCurrencySmart = (amount: number, currency: string): string => {
  const absAmount = Math.abs(amount);
  
  if (absAmount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(millions).replace(/\d+/, (match) => match) + "M";
  }
  
  if (absAmount >= 1_000) {
    const thousands = amount / 1_000;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(thousands).replace(/\d+/, (match) => match) + "K";
  }
  
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Generate array of month objects for continuous range
 */
export const getDateRangeMonths = (startDate: Date, endDate: Date): Array<{ month: string; monthLabel: string; date: Date }> => {
  const months = eachMonthOfInterval({ start: startDate, end: endDate });
  return months.map((date) => ({
    month: format(date, "yyyy-MM"),
    monthLabel: format(date, "MMM yyyy"),
    date,
  }));
};

/**
 * Aggregate monthly inflow/outflow from transactions and transfers
 * Credits = inflow, Debits = outflow (regardless of account nature)
 */
export const aggregateMonthlyInflowOutflow = (
  transactions: Transaction[],
  transfers: Transfer[],
  accountId: string,
  startDate: Date,
  endDate: Date
): MonthlyInflowOutflow[] => {
  // Get all months in the range
  const months = getDateRangeMonths(startDate, endDate);
  
  // Initialize monthly data
  const monthlyData = new Map<string, { inflow: number; outflow: number }>();
  months.forEach(({ month }) => {
    monthlyData.set(month, { inflow: 0, outflow: 0 });
  });
  
  // Aggregate transactions
  transactions.forEach((transaction) => {
    const transactionDate = new Date(transaction.date);
    const month = format(transactionDate, "yyyy-MM");
    
    if (monthlyData.has(month)) {
      const data = monthlyData.get(month)!;
      if (transaction.type === "credit") {
        data.inflow += transaction.amount;
      } else {
        data.outflow += transaction.amount;
      }
    }
  });
  
  // Aggregate transfers
  transfers.forEach((transfer) => {
    const transferDate = new Date(transfer.date);
    const month = format(transferDate, "yyyy-MM");
    
    if (monthlyData.has(month)) {
      const data = monthlyData.get(month)!;
      
      // For incoming transfers (to this account)
      if (transfer.toAccountId === accountId) {
        data.inflow += transfer.toAmount ?? transfer.amount;
      }
      
      // For outgoing transfers (from this account)
      if (transfer.fromAccountId === accountId) {
        data.outflow += transfer.fromAmount ?? transfer.amount;
      }
    }
  });
  
  // Convert to array format
  return months.map(({ month, monthLabel }) => ({
    month,
    monthLabel,
    inflow: monthlyData.get(month)?.inflow ?? 0,
    outflow: monthlyData.get(month)?.outflow ?? 0,
  }));
};

/**
 * Reconstruct monthly balance for transaction accounts
 * Calculates running balance at end of each month
 */
export const reconstructMonthlyBalance = (
  transactions: Transaction[],
  transfers: Transfer[],
  accountId: string,
  initialBalance: number,
  nature: "asset" | "liability",
  startDate: Date,
  endDate: Date
): MonthlyBalance[] => {
  // Get all months in the range
  const months = getDateRangeMonths(startDate, endDate);
  
  // Sort transactions and transfers by date
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const sortedTransfers = [...transfers]
    .filter((t) => t.fromAccountId === accountId || t.toAccountId === accountId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Calculate balance at end of each month
  const monthlyBalances: MonthlyBalance[] = [];
  
  months.forEach(({ month, monthLabel, date }) => {
    const monthEnd = endOfMonth(date);
    
    // Get all transactions up to end of this month
    const transactionsUpToDate = sortedTransactions.filter(
      (t) => new Date(t.date) <= monthEnd
    );
    
    // Get all transfers up to end of this month
    const transfersUpToDate = sortedTransfers.filter(
      (t) => new Date(t.date) <= monthEnd
    );
    
    // Calculate totals
    const credits = transactionsUpToDate
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);
    
    const debits = transactionsUpToDate
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);
    
    const transferIn = transfersUpToDate
      .filter((t) => t.toAccountId === accountId)
      .reduce((sum, t) => sum + (t.toAmount ?? t.amount), 0);
    
    const transferOut = transfersUpToDate
      .filter((t) => t.fromAccountId === accountId)
      .reduce((sum, t) => sum + (t.fromAmount ?? t.amount), 0);
    
    // Calculate balance using the accounting utility
    const balance = calculateTransactionAccountBalance(
      initialBalance,
      credits,
      debits,
      transferIn,
      transferOut,
      nature
    );
    
    monthlyBalances.push({
      month,
      monthLabel,
      balance,
    });
  });
  
  return monthlyBalances;
};

export interface BalancePoint {
  time: number;
  dateLabel: string;
  balance: number;
}

type SeriesTransaction = {
  type: "debit" | "credit";
  amount: number;
  date: Date;
};

type SeriesTransfer = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fromAmount: number | null;
  toAmount: number | null;
  date: Date;
};

type BalanceSnapshot = {
  date: Date;
  balance: number;
  createdAt?: Date;
};

const movementDelta = (
  nature: "asset" | "liability",
  kind: "credit" | "debit" | "transferIn" | "transferOut",
  amount: number
): number => {
  const increases = nature === "asset" ? kind === "credit" || kind === "transferIn" : kind === "debit" || kind === "transferOut";
  return increases ? amount : -amount;
};

const labelFormatForRange = (start: Date, end: Date): string => {
  return start.getFullYear() === end.getFullYear() ? "MMM d" : "MMM d, yy";
};

const toBalancePoint = (time: number, balance: number, labelFormat: string): BalancePoint => ({
  time,
  dateLabel: format(new Date(time), labelFormat),
  balance,
});

/**
 * Running balance for a transaction account.
 * The first point is the balance at the start of the range, before activity inside it.
 * Later points are the balance after each movement. The series holds through the end of the range.
 */
export const reconstructBalanceSeries = (
  transactions: readonly SeriesTransaction[],
  transfers: readonly SeriesTransfer[],
  accountId: string,
  initialBalance: number,
  nature: "asset" | "liability",
  startDate: Date,
  endDate: Date
): BalancePoint[] => {
  const startTime = startDate.getTime();
  const endTime = Math.max(startTime, endOfDay(endDate).getTime());
  const labelFormat = labelFormatForRange(startDate, new Date(endTime));
  const events: Array<{ time: number; delta: number }> = [];

  for (const transaction of transactions) {
    events.push({
      time: new Date(transaction.date).getTime(),
      delta: movementDelta(nature, transaction.type, transaction.amount),
    });
  }

  for (const transfer of transfers) {
    if (transfer.toAccountId === accountId) {
      events.push({
        time: new Date(transfer.date).getTime(),
        delta: movementDelta(nature, "transferIn", transfer.toAmount ?? transfer.amount),
      });
    }
    if (transfer.fromAccountId === accountId) {
      events.push({
        time: new Date(transfer.date).getTime(),
        delta: movementDelta(nature, "transferOut", transfer.fromAmount ?? transfer.amount),
      });
    }
  }

  events.sort((a, b) => a.time - b.time);

  let balance = initialBalance;
  const inRange: Array<{ time: number; delta: number }> = [];
  for (const event of events) {
    if (event.time < startTime) {
      balance += event.delta;
    } else if (event.time <= endTime) {
      inRange.push(event);
    }
  }

  const points = [toBalancePoint(startTime, balance, labelFormat)];
  for (const event of inRange) {
    balance += event.delta;
    const last = points[points.length - 1];
    if (last.time === event.time && points.length > 1) {
      last.balance = balance;
      continue;
    }
    points.push(toBalancePoint(event.time, balance, labelFormat));
  }

  const last = points[points.length - 1];
  if (last.time < endTime) {
    points.push(toBalancePoint(endTime, balance, labelFormat));
  }

  return points;
};

/**
 * Balance-account snapshots drawn across a range.
 * A snapshot dated before the range is the opening balance. The last value holds to the end.
 */
export const balanceSnapshotSeries = (
  history: readonly BalanceSnapshot[],
  startDate: Date,
  endDate: Date,
  initialBalance: number
): BalancePoint[] => {
  const startTime = startDate.getTime();
  const endTime = Math.max(startTime, endOfDay(endDate).getTime());
  const labelFormat = labelFormatForRange(startDate, new Date(endTime));
  const sorted = [...history].sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
  });

  let opening = initialBalance;
  const inRange: BalanceSnapshot[] = [];
  for (const entry of sorted) {
    const time = entry.date.getTime();
    if (time <= startTime) {
      opening = entry.balance;
    } else if (time <= endTime) {
      inRange.push(entry);
    }
  }

  const points = [toBalancePoint(startTime, opening, labelFormat)];
  for (const entry of inRange) {
    const time = entry.date.getTime();
    const last = points[points.length - 1];
    if (last.time === time) {
      last.balance = entry.balance;
      continue;
    }
    points.push(toBalancePoint(time, entry.balance, labelFormat));
  }

  const last = points[points.length - 1];
  if (last.time < endTime) {
    points.push(toBalancePoint(endTime, last.balance, labelFormat));
  }

  return points;
};

/**
 * Calculate PNL data for investment accounts
 * PNL = investmentHistory.balance - netContributionsUpToDate
 * Only calculated at investment_history entry dates
 */
export const calculatePNLData = (
  investmentHistory: InvestmentHistory[],
  transfers: Transfer[],
  accountId: string,
  startDate: Date,
  endDate: Date
): PNLDataPoint[] => {
  // Filter and sort investment history by date
  const sortedHistory = [...investmentHistory]
    .filter((entry) => {
      const entryDate = new Date(entry.date);
      return entryDate >= startDate && entryDate <= endDate;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Sort transfers by date
  const sortedTransfers = [...transfers]
    .filter((t) => t.fromAccountId === accountId || t.toAccountId === accountId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Calculate PNL at each investment history entry
  const pnlData: PNLDataPoint[] = [];
  
  sortedHistory.forEach((entry) => {
    const entryDate = new Date(entry.date);
    
    // Calculate net contributions up to this date
    const transfersUpToDate = sortedTransfers.filter(
      (t) => new Date(t.date) <= entryDate
    );
    
    const transferIn = transfersUpToDate
      .filter((t) => t.toAccountId === accountId)
      .reduce((sum, t) => sum + (t.toAmount ?? t.amount), 0);
    
    const transferOut = transfersUpToDate
      .filter((t) => t.fromAccountId === accountId)
      .reduce((sum, t) => sum + (t.fromAmount ?? t.amount), 0);
    
    // Investment accounts are always assets
    const netContributions = transferIn - transferOut;
    const pnl = entry.balance - netContributions;
    
    pnlData.push({
      date: entryDate,
      dateLabel: format(entryDate, "MMM d, yyyy"),
      balance: entry.balance,
      netContributions,
      pnl,
    });
  });
  
  return pnlData;
};

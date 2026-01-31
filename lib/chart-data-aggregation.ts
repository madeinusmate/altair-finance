import { Transaction, Transfer, BalanceHistory, InvestmentHistory } from "@/lib/db/schema";
import { calculateTransactionAccountBalance, calculateNetContributions } from "@/lib/accounting";
import { startOfMonth, endOfMonth, format, eachMonthOfInterval, parseISO } from "date-fns";

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

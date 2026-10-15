import { calculateTransactionAccountBalance } from "@/lib/accounting";

/**
 * Per-account balance at an as-of instant.
 * Snapshot rows in force are the greatest `date` still `<= asOf`, then the greatest `created_at`.
 * Asset and liability classification matches `app/api/net-worth/route.ts`, including `roundForNetWorth`.
 */

export interface InsightAccount {
  id: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  currency: string;
  initialBalance: number;
  createdAt: Date;
}

export interface InsightTransaction {
  accountId: string;
  type: "debit" | "credit";
  amount: number;
  date: Date;
}

export interface InsightTransfer {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fromAmount: number | null;
  toAmount: number | null;
  date: Date;
}

export interface InsightSnapshot {
  accountId: string;
  balance: number;
  date: Date;
  createdAt: Date;
}

export interface ActivityTotals {
  credits: number;
  debits: number;
  transferIn: number;
  transferOut: number;
}

export interface BalanceAsOfInput {
  account: InsightAccount;
  asOf: Date;
  transactions: readonly InsightTransaction[];
  transfers: readonly InsightTransfer[];
  balanceHistory: readonly InsightSnapshot[];
  investmentHistory: readonly InsightSnapshot[];
}

const roundWithPrecision = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Round one converted account balance the same way the net worth hero does, before summing. */
export const roundForNetWorth = (value: number): number => {
  const abs = Math.abs(value);
  const decimals = abs >= 1_000_000 ? 0 : 2;
  return roundWithPrecision(value, decimals);
};

export const classifyConvertedBalance = (
  nature: "asset" | "liability",
  convertedBalance: number
): { assets: number; liabilities: number } => {
  if (nature === "asset") {
    return { assets: convertedBalance, liabilities: 0 };
  }

  if (convertedBalance >= 0) {
    return { assets: 0, liabilities: convertedBalance };
  }

  return { assets: Math.abs(convertedBalance), liabilities: 0 };
};

export const transferInAmount = (transfer: Pick<InsightTransfer, "toAmount" | "amount">): number => {
  return transfer.toAmount ?? transfer.amount;
};

export const transferOutAmount = (transfer: Pick<InsightTransfer, "fromAmount" | "amount">): number => {
  return transfer.fromAmount ?? transfer.amount;
};

export const compareSnapshots = (
  a: Pick<InsightSnapshot, "date" | "createdAt">,
  b: Pick<InsightSnapshot, "date" | "createdAt">
): number => {
  const dateDiff = a.date.getTime() - b.date.getTime();
  if (dateDiff !== 0) {
    return dateDiff;
  }
  return a.createdAt.getTime() - b.createdAt.getTime();
};

export const selectSnapshotInForce = <T extends Pick<InsightSnapshot, "date" | "createdAt">>(
  rows: readonly T[],
  asOf: Date
): T | null => {
  const asOfTime = asOf.getTime();
  let best: T | null = null;

  for (const row of rows) {
    const time = row.date.getTime();
    if (time > asOfTime) {
      continue;
    }
    if (!best) {
      best = row;
      continue;
    }
    const bestTime = best.date.getTime();
    if (time > bestTime || (time === bestTime && row.createdAt.getTime() > best.createdAt.getTime())) {
      best = row;
    }
  }

  return best;
};

const emptyActivity = (): ActivityTotals => ({
  credits: 0,
  debits: 0,
  transferIn: 0,
  transferOut: 0,
});

/**
 * Walk this account's rows once and return the native balance at each month.
 * `null` means the account does not exist at that as-of yet and must be left out of the sum.
 * Transaction and transfer arrays must already be limited to this account.
 * Snapshot arrays must already be limited to this account.
 */
export const transactionBalancesForMonths = (
  account: InsightAccount,
  months: readonly { asOf: Date }[],
  transactions: readonly InsightTransaction[],
  incoming: readonly InsightTransfer[],
  outgoing: readonly InsightTransfer[]
): Array<number | null> => {
  const events: Array<{ time: number } & ActivityTotals> = [];

  for (const transaction of transactions) {
    events.push({
      time: transaction.date.getTime(),
      credits: transaction.type === "credit" ? transaction.amount : 0,
      debits: transaction.type === "debit" ? transaction.amount : 0,
      transferIn: 0,
      transferOut: 0,
    });
  }

  for (const transfer of incoming) {
    events.push({
      time: transfer.date.getTime(),
      credits: 0,
      debits: 0,
      transferIn: transferInAmount(transfer),
      transferOut: 0,
    });
  }

  for (const transfer of outgoing) {
    events.push({
      time: transfer.date.getTime(),
      credits: 0,
      debits: 0,
      transferIn: 0,
      transferOut: transferOutAmount(transfer),
    });
  }

  events.sort((a, b) => a.time - b.time);

  const createdAt = account.createdAt.getTime();
  const firstActivity = events.length > 0 ? events[0].time : Number.POSITIVE_INFINITY;
  const running = emptyActivity();
  let index = 0;
  const balances: Array<number | null> = [];

  for (const month of months) {
    const asOfTime = month.asOf.getTime();
    while (index < events.length && events[index].time <= asOfTime) {
      const event = events[index];
      running.credits += event.credits;
      running.debits += event.debits;
      running.transferIn += event.transferIn;
      running.transferOut += event.transferOut;
      index += 1;
    }

    const included = createdAt <= asOfTime || firstActivity <= asOfTime;
    if (!included) {
      balances.push(null);
      continue;
    }

    balances.push(
      calculateTransactionAccountBalance(
        account.initialBalance,
        running.credits,
        running.debits,
        running.transferIn,
        running.transferOut,
        account.nature
      )
    );
  }

  return balances;
};

export const snapshotBalancesForMonths = (
  account: InsightAccount,
  months: readonly { asOf: Date }[],
  snapshots: readonly InsightSnapshot[],
  emptyBalance: "omit" | "initial"
): Array<number | null> => {
  if (snapshots.length === 0) {
    if (emptyBalance === "omit") {
      return months.map(() => null);
    }
    const createdAt = account.createdAt.getTime();
    return months.map((month) => (createdAt <= month.asOf.getTime() ? account.initialBalance : null));
  }

  const sorted = [...snapshots].sort(compareSnapshots);
  const firstDate = sorted[0].date.getTime();
  let index = 0;
  let current: InsightSnapshot | null = null;
  const balances: Array<number | null> = [];

  for (const month of months) {
    const asOfTime = month.asOf.getTime();
    while (index < sorted.length && sorted[index].date.getTime() <= asOfTime) {
      current = sorted[index];
      index += 1;
    }

    if (firstDate <= asOfTime && current) {
      balances.push(current.balance);
    } else {
      balances.push(null);
    }
  }

  return balances;
};

export const balanceAsOf = ({
  account,
  asOf,
  transactions,
  transfers,
  balanceHistory,
  investmentHistory,
}: BalanceAsOfInput): { included: boolean; balance: number } => {
  const months = [{ asOf }];
  let balances: Array<number | null>;

  if (account.type === "transaction") {
    balances = transactionBalancesForMonths(
      account,
      months,
      transactions.filter((transaction) => transaction.accountId === account.id),
      transfers.filter((transfer) => transfer.toAccountId === account.id),
      transfers.filter((transfer) => transfer.fromAccountId === account.id)
    );
  } else if (account.type === "balance") {
    balances = snapshotBalancesForMonths(
      account,
      months,
      balanceHistory.filter((row) => row.accountId === account.id),
      "initial"
    );
  } else if (account.type === "investment") {
    balances = snapshotBalancesForMonths(
      account,
      months,
      investmentHistory.filter((row) => row.accountId === account.id),
      "omit"
    );
  } else {
    balances = [null];
  }

  const balance = balances[0];
  if (balance === null) {
    return { included: false, balance: 0 };
  }

  return { included: true, balance };
};

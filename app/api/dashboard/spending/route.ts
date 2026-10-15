import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency } from "@/lib/currencies";
import { earliestTimestamp, parseLocalDateRange, previousPeriod, yearAgoPeriod } from "@/lib/insights/range";
import {
  buildSpendingComparison,
  yearAgoWindowForLedger,
  type SpendingAccount,
  type SpendingLedgerEntry,
} from "@/lib/insights/spending";

type DashboardDb = ReturnType<typeof getDb>;

const readOldestLedgerDate = (db: DashboardDb): Date | null => {
  const transaction = db
    .select({ date: schema.transactions.date })
    .from(schema.transactions)
    .orderBy(asc(schema.transactions.date))
    .limit(1)
    .get();
  const transfer = db
    .select({ date: schema.transfers.date })
    .from(schema.transfers)
    .orderBy(asc(schema.transfers.date))
    .limit(1)
    .get();
  const balance = db
    .select({ date: schema.balanceHistory.date })
    .from(schema.balanceHistory)
    .orderBy(asc(schema.balanceHistory.date))
    .limit(1)
    .get();
  const investment = db
    .select({ date: schema.investmentHistory.date })
    .from(schema.investmentHistory)
    .orderBy(asc(schema.investmentHistory.date))
    .limit(1)
    .get();
  const account = db
    .select({ date: schema.accounts.createdAt })
    .from(schema.accounts)
    .orderBy(asc(schema.accounts.createdAt))
    .limit(1)
    .get();

  return earliestTimestamp([
    transaction?.date,
    transfer?.date,
    balance?.date,
    investment?.date,
    account?.date,
  ]);
};

const loadDebits = (
  db: DashboardDb,
  start: Date,
  end: Date,
): { entries: SpendingLedgerEntry[]; accounts: SpendingAccount[] } => {
  const rows = db
    .select({
      accountId: schema.transactions.accountId,
      type: schema.transactions.type,
      category: schema.transactions.category,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      accountType: schema.accounts.type,
      currency: schema.accounts.currency,
    })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(
      and(
        eq(schema.transactions.type, "debit"),
        eq(schema.accounts.type, "transaction"),
        gte(schema.transactions.date, start),
        lte(schema.transactions.date, end),
      ),
    )
    .all();

  return {
    entries: rows.map((row) => ({
      kind: "transaction" as const,
      accountId: row.accountId,
      type: row.type,
      category: row.category,
      amount: row.amount,
      date: row.date,
    })),
    accounts: rows.map((row) => ({
      id: row.accountId,
      type: row.accountType,
      currency: row.currency,
    })),
  };
};

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

    // Local day bounds, same split as monthly income. The previous UTC parse
    // could move a boundary transaction across the window on a device off UTC.
    const range = parseLocalDateRange(startDateParam, endDateParam);
    if (!range) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);
    const previous = previousPeriod(range.start, range.end);
    const yearAgoCandidate = yearAgoPeriod(range.start, range.end);
    const yearAgo = yearAgoCandidate
      ? yearAgoWindowForLedger(range.start, range.end, readOldestLedgerDate(db))
      : null;

    const current = loadDebits(db, range.start, range.end);
    const prior = loadDebits(db, previous.start, previous.end);
    const yearAgoRows = yearAgo ? loadDebits(db, yearAgo.start, yearAgo.end) : { entries: [], accounts: [] };

    const comparison = buildSpendingComparison({
      entries: [...current.entries, ...prior.entries, ...yearAgoRows.entries],
      accounts: [...current.accounts, ...prior.accounts, ...yearAgoRows.accounts],
      rates: fxSnapshot.rates,
      displayCurrency: currency,
      current: range,
      previous,
      yearAgo,
    });

    return NextResponse.json(comparison);
  } catch (error) {
    console.error("Error calculating spending:", error);
    return NextResponse.json({ error: "Failed to calculate spending" }, { status: 500 });
  }
};

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endOfDay, format, startOfDay, startOfMonth, subMonths } from "date-fns";
import { calculateTransactionAccountBalance } from "../lib/accounting";
import {
  balanceAsOf,
  roundForNetWorth,
  selectSnapshotInForce,
  type InsightAccount,
  type InsightSnapshot,
  type InsightTransaction,
  type InsightTransfer,
} from "../lib/insights/balances";
import { buildNetWorthSeries, type NetWorthSeriesInput } from "../lib/insights/net-worth-series";
import { listMonths, parseLocalDateRange, parseLocalDay } from "../lib/insights/range";
import type { SupportedCurrency } from "../lib/currencies";

const rates: Record<SupportedCurrency, number> = {
  HKD: 7.8,
  USD: 1,
  SGD: 1.25,
  EUR: 2,
  GBP: 0.8,
  CHF: 0.9,
  JPY: 150,
  AUD: 1.5,
  CNY: 7.2,
  CAD: 1.35,
  NZD: 1.65,
  MYR: 4.4,
  THB: 35,
  TWD: 32,
  KRW: 1350,
};

const janStart = new Date(2026, 0, 1, 0, 0, 0, 0);
const marEnd = new Date(2026, 2, 31, 23, 59, 59, 999);

const account = (overrides: Partial<InsightAccount> & Pick<InsightAccount, "id" | "type">): InsightAccount => ({
  nature: "asset",
  currency: "USD",
  initialBalance: 0,
  createdAt: janStart,
  ...overrides,
});

const seriesFor = (partial: Partial<NetWorthSeriesInput> & Pick<NetWorthSeriesInput, "accounts">) =>
  buildNetWorthSeries({
    transactions: [],
    transfers: [],
    balanceHistory: [],
    investmentHistory: [],
    start: janStart,
    end: marEnd,
    currency: "USD",
    rates,
    ...partial,
  });

const pointKeys = ["asOf", "assets", "liabilities", "month", "monthLabel", "netWorth"];

describe("net worth over time", () => {
  it("matches transaction month-end balances and the hero formula, including rounding", () => {
    const cash = account({
      id: "cash",
      type: "transaction",
      initialBalance: 1000,
      createdAt: new Date(2025, 11, 1, 0, 0, 0, 0),
    });
    const transactions: InsightTransaction[] = [
      { accountId: "cash", type: "credit", amount: 10, date: new Date(2025, 11, 15, 12, 0, 0, 0) },
      { accountId: "cash", type: "credit", amount: 250.126, date: new Date(2026, 0, 15, 12, 0, 0, 0) },
      { accountId: "cash", type: "debit", amount: 100, date: new Date(2026, 1, 10, 12, 0, 0, 0) },
    ];
    const transfers: InsightTransfer[] = [
      {
        fromAccountId: "other",
        toAccountId: "cash",
        amount: 1,
        fromAmount: 99,
        toAmount: 40,
        date: new Date(2026, 1, 20, 12, 0, 0, 0),
      },
      {
        fromAccountId: "cash",
        toAccountId: "other",
        amount: 2,
        fromAmount: 15,
        toAmount: 70,
        date: new Date(2026, 2, 5, 12, 0, 0, 0),
      },
    ];

    const result = seriesFor({ accounts: [cash], transactions, transfers });
    const months = listMonths(janStart, marEnd);

    const nativeUntil = (asOf: Date): number => {
      const credits = transactions
        .filter((transaction) => transaction.date.getTime() <= asOf.getTime() && transaction.type === "credit")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const debits = transactions
        .filter((transaction) => transaction.date.getTime() <= asOf.getTime() && transaction.type === "debit")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const transferIn = transfers
        .filter((transfer) => transfer.toAccountId === "cash" && transfer.date.getTime() <= asOf.getTime())
        .reduce((sum, transfer) => sum + (transfer.toAmount ?? transfer.amount), 0);
      const transferOut = transfers
        .filter((transfer) => transfer.fromAccountId === "cash" && transfer.date.getTime() <= asOf.getTime())
        .reduce((sum, transfer) => sum + (transfer.fromAmount ?? transfer.amount), 0);
      return calculateTransactionAccountBalance(cash.initialBalance, credits, debits, transferIn, transferOut, "asset");
    };

    assert.deepEqual(
      result.points.map((point) => point.month),
      ["2026-01", "2026-02", "2026-03"]
    );
    assert.deepEqual(
      result.points.map((point) => point.assets),
      [1260.13, 1200.13, 1185.13]
    );

    for (let index = 0; index < months.length; index += 1) {
      const native = nativeUntil(months[index].asOf);
      const resolved = balanceAsOf({
        account: cash,
        asOf: months[index].asOf,
        transactions,
        transfers,
        balanceHistory: [],
        investmentHistory: [],
      });
      assert.equal(resolved.included, true);
      assert.equal(resolved.balance, native);
      assert.equal(result.points[index].assets, roundForNetWorth(native));
      assert.equal(result.points[index].liabilities, 0);
      assert.equal(result.points[index].netWorth, roundForNetWorth(native));
    }

    const heroNative = calculateTransactionAccountBalance(1000, 10 + 250.126, 100, 40, 15, "asset");
    assert.equal(heroNative, 1185.126);
    assert.equal(result.points[2].netWorth, roundForNetWorth(heroNative));
    assert.equal(result.points[2].netWorth, 1185.13);

    assert.equal(roundForNetWorth(1_500_000.4), 1_500_000);
    assert.equal(roundForNetWorth(1_500_000.6), 1_500_001);
    assert.equal(roundForNetWorth(-1_500_000.6), -1_500_001);

    const large = seriesFor({
      accounts: [account({ id: "big", type: "transaction", initialBalance: 1_500_000.6 })],
      start: janStart,
      end: new Date(2026, 0, 31, 23, 59, 59, 999),
    });
    assert.equal(large.points[0].assets, 1_500_001);
    assert.equal(large.points[0].netWorth, 1_500_001);

    const halfA = account({ id: "half-a", type: "balance", initialBalance: 600_000.126 });
    const halfB = account({ id: "half-b", type: "balance", initialBalance: 600_000.126 });
    const summed = seriesFor({
      accounts: [halfA, halfB],
      start: janStart,
      end: new Date(2026, 0, 31, 23, 59, 59, 999),
    });
    assert.equal(roundForNetWorth(600_000.126), 600_000.13);
    assert.equal(summed.points[0].assets, 1_200_000.26);
    assert.notEqual(summed.points[0].assets, roundForNetWorth(1_200_000.26));
  });

  it("puts a positive liability in liabilities and a negative liability in assets", () => {
    const debt = account({ id: "debt", type: "transaction", nature: "liability" });
    const overpay = account({ id: "overpay", type: "transaction", nature: "liability" });
    const transactions: InsightTransaction[] = [
      { accountId: "debt", type: "debit", amount: 300.126, date: new Date(2026, 0, 5, 12, 0, 0, 0) },
      { accountId: "overpay", type: "credit", amount: 80.126, date: new Date(2026, 0, 5, 12, 0, 0, 0) },
    ];

    const result = seriesFor({ accounts: [debt, overpay], transactions });

    assert.equal(calculateTransactionAccountBalance(0, 0, 300.126, 0, 0, "liability"), 300.126);
    assert.equal(calculateTransactionAccountBalance(0, 80.126, 0, 0, 0, "liability"), -80.126);
    assert.equal(result.points[0].liabilities, 300.13);
    assert.equal(result.points[0].assets, 80.13);
    assert.equal(result.points[0].netWorth, -220);
    assert.equal(result.points[2].liabilities, 300.13);
    assert.equal(result.points[2].assets, 80.13);
  });

  it("reduces assets when an asset balance is negative", () => {
    const overdrawn = account({ id: "checking", type: "balance", initialBalance: -40.126 });
    const result = seriesFor({ accounts: [overdrawn] });

    assert.equal(result.points[0].assets, -40.13);
    assert.equal(result.points[0].liabilities, 0);
    assert.equal(result.points[0].netWorth, -40.13);
  });

  it("forward-fills balance snapshots and breaks same-day ties with created_at", () => {
    const savings = account({
      id: "savings",
      type: "balance",
      initialBalance: 999,
      createdAt: new Date(2025, 11, 1, 0, 0, 0, 0),
    });
    const janDate = new Date(2026, 0, 10, 8, 0, 0, 0);
    const earlier: InsightSnapshot = {
      accountId: "savings",
      balance: 100,
      date: janDate,
      createdAt: new Date(2026, 0, 10, 9, 0, 0, 0),
    };
    const later: InsightSnapshot = {
      accountId: "savings",
      balance: 175,
      date: new Date(janDate.getTime()),
      createdAt: new Date(2026, 0, 12, 9, 0, 0, 0),
    };
    const march: InsightSnapshot = {
      accountId: "savings",
      balance: 300,
      date: new Date(2026, 2, 1, 0, 0, 0, 0),
      createdAt: new Date(2026, 2, 1, 1, 0, 0, 0),
    };
    const decoy: InsightSnapshot = {
      accountId: "other",
      balance: 50_000,
      date: janDate,
      createdAt: new Date(2026, 0, 20, 0, 0, 0, 0),
    };
    const balanceHistory = [earlier, later, march, decoy];
    const start = new Date(2025, 11, 1, 0, 0, 0, 0);
    const result = seriesFor({
      accounts: [savings],
      balanceHistory,
      start,
      end: marEnd,
    });

    assert.deepEqual(
      result.points.map((point) => point.month),
      ["2025-12", "2026-01", "2026-02", "2026-03"]
    );
    assert.deepEqual(
      result.points.map((point) => point.assets),
      [0, 175, 175, 300]
    );
    assert.equal(selectSnapshotInForce([earlier, later], new Date(2026, 0, 31, 23, 59, 59, 999))?.balance, 175);
    assert.equal(selectSnapshotInForce([later, earlier], new Date(2026, 0, 31, 23, 59, 59, 999))?.balance, 175);

    const december = balanceAsOf({
      account: savings,
      asOf: new Date(2025, 11, 31, 23, 59, 59, 999),
      transactions: [],
      transfers: [],
      balanceHistory,
      investmentHistory: [],
    });
    assert.equal(december.included, false);

    const february = balanceAsOf({
      account: savings,
      asOf: new Date(2026, 1, 28, 23, 59, 59, 999),
      transactions: [],
      transfers: [],
      balanceHistory,
      investmentHistory: [],
    });
    assert.equal(february.included, true);
    assert.equal(february.balance, 175);
  });

  it("prefers a later snapshot date over a later created_at", () => {
    const rows: InsightSnapshot[] = [
      {
        accountId: "savings",
        balance: 100,
        date: new Date(2026, 0, 10, 8, 0, 0, 0),
        createdAt: new Date(2026, 2, 1, 0, 0, 0, 0),
      },
      {
        accountId: "savings",
        balance: 180,
        date: new Date(2026, 0, 20, 8, 0, 0, 0),
        createdAt: new Date(2026, 0, 11, 0, 0, 0, 0),
      },
    ];
    const savings = account({ id: "savings", type: "balance", initialBalance: 999 });
    const result = seriesFor({ accounts: [savings], balanceHistory: rows });

    assert.equal(selectSnapshotInForce(rows, new Date(2026, 0, 31, 23, 59, 59, 999))?.balance, 180);
    assert.equal(result.points[0].assets, 180);
  });

  it("uses initial_balance from created_at when a balance account has no history", () => {
    const savings = account({
      id: "savings",
      type: "balance",
      initialBalance: 40,
      createdAt: new Date(2026, 2, 4, 15, 0, 0, 0),
    });
    const result = seriesFor({ accounts: [savings] });

    assert.deepEqual(
      result.points.map((point) => point.assets),
      [0, 0, 40]
    );
  });

  it("forward-fills an investment mark and ignores transfers and profit/loss", () => {
    const brokerage = account({
      id: "brokerage",
      type: "investment",
      initialBalance: 999,
      createdAt: janStart,
    });
    const investmentHistory: InsightSnapshot[] = [
      {
        accountId: "brokerage",
        balance: 1000,
        date: new Date(2026, 1, 15, 12, 0, 0, 0),
        createdAt: new Date(2026, 1, 15, 12, 0, 0, 0),
      },
      {
        accountId: "brokerage",
        balance: 1250,
        date: new Date(2026, 2, 1, 9, 0, 0, 0),
        createdAt: new Date(2026, 2, 1, 9, 0, 0, 0),
      },
    ];
    const transfers: InsightTransfer[] = [
      {
        fromAccountId: "cash",
        toAccountId: "brokerage",
        amount: 1,
        fromAmount: 1,
        toAmount: 5000,
        date: new Date(2026, 0, 20, 12, 0, 0, 0),
      },
    ];

    const result = seriesFor({
      accounts: [brokerage],
      investmentHistory,
      transfers,
    });

    assert.deepEqual(
      result.points.map((point) => point.assets),
      [0, 1000, 1250]
    );
    assert.deepEqual(
      result.points.map((point) => point.netWorth),
      [0, 1000, 1250]
    );
    for (const point of result.points) {
      assert.equal(Object.hasOwn(point, "profitLoss"), false);
      assert.deepEqual(Object.keys(point).sort(), pointKeys);
    }
  });

  it("leaves an investment account at zero when a transfer has no mark", () => {
    const brokerage = account({ id: "brokerage", type: "investment", initialBalance: 999 });
    const transfers: InsightTransfer[] = [
      {
        fromAccountId: "cash",
        toAccountId: "brokerage",
        amount: 5000,
        fromAmount: 5000,
        toAmount: 5000,
        date: new Date(2026, 0, 20, 12, 0, 0, 0),
      },
    ];
    const result = seriesFor({ accounts: [brokerage], transfers });

    assert.deepEqual(
      result.points.map((point) => point.netWorth),
      [0, 0, 0]
    );
  });

  it("omits a transaction account until it is created", () => {
    const cash = account({
      id: "cash",
      type: "transaction",
      initialBalance: 800,
      createdAt: new Date(2026, 2, 4, 15, 0, 0, 0),
    });
    const result = seriesFor({ accounts: [cash] });

    assert.deepEqual(
      result.points.map((point) => point.assets),
      [0, 0, 800]
    );
    assert.equal(result.points[0].monthLabel, "Jan 2026");
    assert.equal(result.points[2].monthLabel, "Mar 2026");
  });

  it("includes a backdated transaction from that transaction's month", () => {
    const cash = account({
      id: "cash",
      type: "transaction",
      initialBalance: 800,
      createdAt: new Date(2026, 2, 4, 15, 0, 0, 0),
    });
    const transactions: InsightTransaction[] = [
      { accountId: "cash", type: "credit", amount: 50, date: new Date(2026, 0, 20, 12, 0, 0, 0) },
    ];
    const result = seriesFor({ accounts: [cash], transactions });

    assert.deepEqual(
      result.points.map((point) => point.assets),
      [850, 850, 850]
    );
  });

  it("converts every month with the same rate map", () => {
    const usd = account({ id: "usd", type: "balance", initialBalance: 10.126 });
    const eur = account({ id: "eur", type: "balance", currency: "EUR", initialBalance: 50 });
    const sharedRates = rates;
    const inUsd = seriesFor({ accounts: [usd, eur], currency: "USD", rates: sharedRates });
    const inSgd = seriesFor({ accounts: [usd, eur], currency: "SGD", rates: sharedRates });

    assert.deepEqual(
      inUsd.points.map((point) => point.assets),
      [35.13, 35.13, 35.13]
    );
    assert.deepEqual(
      inSgd.points.map((point) => point.assets),
      [43.91, 43.91, 43.91]
    );
    assert.equal(inUsd.points[0].assets, inUsd.points[2].assets);
    assert.equal(inSgd.hasUnsupportedCurrencies, false);
  });

  it("returns an empty series when any account currency is unsupported", () => {
    const result = seriesFor({
      accounts: [
        account({ id: "ok", type: "balance", initialBalance: 100 }),
        account({ id: "bad", type: "balance", currency: "INR", initialBalance: 5 }),
        account({ id: "also-bad", type: "transaction", currency: "MXN", initialBalance: 8 }),
      ],
    });

    assert.deepEqual(result.points, []);
    assert.equal(result.hasUnsupportedCurrencies, true);
    assert.deepEqual(result.unsupportedCurrencies, ["INR", "MXN"]);
  });

  it("uses the dashboard default range of three months ending today", () => {
    const now = new Date(2026, 9, 15, 15, 30, 0, 0);
    const endDate = endOfDay(now);
    const startDate = startOfDay(subMonths(startOfMonth(now), 2));
    const months = listMonths(startDate, endDate);

    assert.deepEqual(
      months.map((month) => month.month),
      ["2026-08", "2026-09", "2026-10"]
    );
    assert.deepEqual(
      months.map((month) => month.monthLabel),
      ["Aug 2026", "Sep 2026", "Oct 2026"]
    );
    assert.equal(format(months[0].asOf, "yyyy-MM-dd"), "2026-08-31");
    assert.equal(format(months[1].asOf, "yyyy-MM-dd"), "2026-09-30");
    assert.equal(months[2].asOf.getTime(), endDate.getTime());

    const parsed = parseLocalDateRange("2026-08-01", "2026-10-15");
    assert.ok(parsed);
    assert.equal(parsed.start.getTime(), startDate.getTime());
    assert.equal(parsed.end.getTime(), endDate.getTime());
    assert.equal(parsed.start.getHours(), 0);
    assert.equal(parsed.start.getMilliseconds(), 0);
    assert.equal(parsed.end.getHours(), 23);
    assert.equal(parsed.end.getMinutes(), 59);
    assert.equal(parsed.end.getSeconds(), 59);
    assert.equal(parsed.end.getMilliseconds(), 999);
    assert.equal(parseLocalDay("2026-08-01", "start")?.getDate(), 1);
    assert.equal(parseLocalDateRange("nope", "2026-10-15"), null);
    assert.equal(parseLocalDateRange("2026-10-15", "2026-08-01"), null);

    const cash = account({
      id: "cash",
      type: "transaction",
      createdAt: startDate,
    });
    const result = seriesFor({
      accounts: [cash],
      transactions: [
        { accountId: "cash", type: "credit", amount: 20, date: new Date(2026, 9, 15, 12, 0, 0, 0) },
        { accountId: "cash", type: "credit", amount: 80, date: new Date(2026, 9, 16, 0, 0, 0, 0) },
      ],
      start: parsed.start,
      end: parsed.end,
    });

    assert.deepEqual(
      result.points.map((point) => point.month),
      ["2026-08", "2026-09", "2026-10"]
    );
    assert.equal(result.points[2].asOf, "2026-10-15");
    assert.equal(result.points[2].asOf, format(endDate, "yyyy-MM-dd"));
    assert.equal(result.points[2].netWorth, 20);
    assert.equal(result.points[0].netWorth, 0);
  });

  it("still emits a flat line when the reconstructed balance is zero", () => {
    const result = seriesFor({
      accounts: [account({ id: "cash", type: "transaction" })],
    });

    assert.equal(result.points.length, 3);
    assert.deepEqual(
      result.points.map((point) => point.netWorth),
      [0, 0, 0]
    );
  });
});

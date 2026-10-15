import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { endOfDay, format, startOfDay, startOfMonth, subMonths } from "date-fns";
import { SavingsRunwayCard, type SavingsRunwayData } from "../components/dashboard/savings-runway-card";
import type { SupportedCurrency } from "../lib/currencies";
import {
  isLiquidAccount,
  roundForNetWorth,
  selectLatestSnapshot,
  sumLiquidBalances,
  transactionAccountBalance,
  type InsightAccount,
  type InsightSnapshot,
} from "../lib/insights/balances";
import {
  averageTrailingExpenses,
  computeRangeFlows,
  expenseTotalsByMonth,
  runwayMonthsFrom,
  sankeySavingsResidual,
  toSankeyNodes,
  type FlowTransfer,
} from "../lib/insights/flows";
import { monthsInRange, parseLocalDate, parseLocalEndDate, trailingCompleteMonths } from "../lib/insights/range";
import { buildSavingsInsight, type SavingsAccount } from "../lib/insights/savings";

const rates: Record<SupportedCurrency, number> = {
  USD: 1,
  EUR: 0.5,
  SGD: 1.25,
  HKD: 8,
  GBP: 0.75,
};

const rangeStart = new Date(2026, 7, 1, 0, 0, 0, 0);
const rangeEnd = new Date(2026, 9, 15, 23, 59, 59, 999);
const now = new Date(2026, 9, 15, 12, 0, 0, 0);

const account = (
  overrides: Partial<SavingsAccount> & Pick<SavingsAccount, "id" | "type" | "nature" | "category">,
): SavingsAccount => ({
  currency: "USD",
  initialBalance: 0,
  createdAt: new Date(2026, 6, 1),
  ...overrides,
});

const snapshot = (accountId: string, balance: number, createdAt = new Date(2026, 8, 1, 12)): InsightSnapshot => ({
  accountId,
  balance,
  date: new Date(2026, 8, 1),
  createdAt,
});

describe("savings rate", () => {
  it("keeps credits minus debits on transaction accounts and ignores other account types", () => {
    const flows = computeRangeFlows({
      accounts: [
        account({ id: "chk", type: "transaction", nature: "asset", category: "checking" }),
        account({ id: "bal", type: "balance", nature: "asset", category: "savings" }),
        account({ id: "cc", type: "transaction", nature: "liability", category: "credit_card" }),
      ],
      transactions: [
        { accountId: "chk", type: "credit", amount: 1000, date: new Date(2026, 7, 2) },
        { accountId: "chk", type: "debit", amount: 250, date: new Date(2026, 8, 3) },
        { accountId: "bal", type: "debit", amount: 999, date: new Date(2026, 8, 3) },
        { accountId: "cc", type: "credit", amount: 40, date: new Date(2026, 8, 4) },
        { accountId: "cc", type: "debit", amount: 10, date: new Date(2026, 8, 4) },
      ],
      transfers: [],
      start: rangeStart,
      end: rangeEnd,
      currency: "USD",
      rates,
    });

    assert.equal(flows.income, 1040);
    assert.equal(flows.expenses, 260);
    assert.equal(flows.kept, 780);
    assert.equal(flows.savingsRate, 780 / 1040);
  });

  it("does not clamp a negative debit out of the rate", () => {
    const flows = computeRangeFlows({
      accounts: [account({ id: "chk", type: "transaction", nature: "asset", category: "checking" })],
      transactions: [
        { accountId: "chk", type: "credit", amount: 100, date: new Date(2026, 7, 2) },
        { accountId: "chk", type: "debit", amount: -5, date: new Date(2026, 7, 3) },
      ],
      transfers: [],
      start: rangeStart,
      end: rangeEnd,
      currency: "USD",
      rates,
    });

    assert.equal(flows.expenses, -5);
    assert.equal(flows.kept, 105);
    assert.equal(flows.savingsRate, 105 / 100);
  });

  it("leaves the rate unchanged when cash moves to an investment account", () => {
    const accounts = [
      account({ id: "chk", type: "transaction", nature: "asset", category: "checking" }),
      account({ id: "brk", type: "investment", nature: "asset", category: "brokerage", currency: "SGD" }),
    ];
    const transactions = [
      { accountId: "chk", type: "credit", amount: 1000, date: new Date(2026, 7, 2) },
      { accountId: "chk", type: "debit", amount: 250, date: new Date(2026, 8, 3) },
    ];
    const withoutTransfer = computeRangeFlows({
      accounts,
      transactions,
      transfers: [],
      start: rangeStart,
      end: rangeEnd,
      currency: "USD",
      rates,
    });
    const transfer: FlowTransfer = {
      fromAccountId: "chk",
      toAccountId: "brk",
      amount: 50,
      fromAmount: 50,
      toAmount: 250,
      date: new Date(2026, 8, 10),
    };
    const withTransfer = computeRangeFlows({
      accounts,
      transactions,
      transfers: [transfer],
      start: rangeStart,
      end: rangeEnd,
      currency: "USD",
      rates,
    });

    assert.equal(withoutTransfer.savingsRate, 0.75);
    assert.equal(withTransfer.savingsRate, withoutTransfer.savingsRate);
    assert.equal(withTransfer.signedInvestment, 200);
    assert.equal(withTransfer.leftInCash, withTransfer.kept - withTransfer.signedInvestment);
    assert.equal(withTransfer.leftInCash, sankeySavingsResidual(withTransfer.income, withTransfer.expenses, withTransfer.signedInvestment));
  });

  it("keeps a withdrawal as a negative invested amount and a larger cash remainder", () => {
    const flows = computeRangeFlows({
      accounts: [
        account({ id: "chk", type: "transaction", nature: "asset", category: "checking" }),
        account({ id: "brk", type: "investment", nature: "asset", category: "brokerage", currency: "SGD" }),
      ],
      transactions: [
        { accountId: "chk", type: "credit", amount: 1000, date: new Date(2026, 7, 2) },
        { accountId: "chk", type: "debit", amount: 250, date: new Date(2026, 8, 3) },
      ],
      transfers: [
        {
          fromAccountId: "brk",
          toAccountId: "chk",
          amount: 40,
          fromAmount: 100,
          toAmount: 70,
          date: new Date(2026, 8, 12),
        },
      ],
      start: rangeStart,
      end: rangeEnd,
      currency: "USD",
      rates,
    });

    assert.equal(flows.kept, 750);
    assert.equal(flows.signedInvestment, -80);
    assert.ok(flows.leftInCash > flows.kept);
    assert.equal(flows.leftInCash, 830);
    const nodes = toSankeyNodes(flows);
    assert.equal(nodes.investment, 0);
    assert.equal(nodes.savings, flows.kept);
    assert.equal(sankeySavingsResidual(flows.income, flows.expenses, flows.signedInvestment), flows.kept);
  });

  it("returns a null rate when income is zero", () => {
    const flows = computeRangeFlows({
      accounts: [account({ id: "chk", type: "transaction", nature: "asset", category: "checking" })],
      transactions: [{ accountId: "chk", type: "debit", amount: 40, date: new Date(2026, 8, 2) }],
      transfers: [],
      start: rangeStart,
      end: rangeEnd,
      currency: "USD",
      rates,
    });

    assert.equal(flows.income, 0);
    assert.equal(flows.savingsRate, null);
    assert.equal(flows.kept, -40);
  });

  it("skips unsupported currencies and still sums supported accounts", () => {
    const flows = computeRangeFlows({
      accounts: [
        account({ id: "chk", type: "transaction", nature: "asset", category: "checking" }),
        account({ id: "jpy", type: "transaction", nature: "asset", category: "checking", currency: "JPY" }),
      ],
      transactions: [
        { accountId: "chk", type: "credit", amount: 100, date: new Date(2026, 7, 2) },
        { accountId: "jpy", type: "credit", amount: 999, date: new Date(2026, 7, 2) },
      ],
      transfers: [],
      start: rangeStart,
      end: rangeEnd,
      currency: "USD",
      rates,
    });

    assert.equal(flows.income, 100);
    assert.equal(flows.hasUnsupportedCurrencies, true);
    assert.equal(flows.savingsRate, 1);
  });
});

describe("liquid balances and runway", () => {
  const checking: InsightAccount = {
    id: "chk",
    type: "transaction",
    nature: "asset",
    category: "checking",
    currency: "USD",
    initialBalance: -200,
  };
  const savings: InsightAccount = {
    id: "sav",
    type: "balance",
    nature: "asset",
    category: "savings",
    currency: "USD",
    initialBalance: 0,
  };
  const cash: InsightAccount = {
    id: "cash",
    type: "balance",
    nature: "asset",
    category: "cash",
    currency: "EUR",
    initialBalance: 25,
  };
  const creditCard: InsightAccount = {
    id: "cc",
    type: "transaction",
    nature: "liability",
    category: "credit_card",
    currency: "USD",
    initialBalance: 5000,
  };
  const mortgage: InsightAccount = {
    id: "mtg",
    type: "balance",
    nature: "liability",
    category: "mortgage",
    currency: "USD",
    initialBalance: 0,
  };
  const brokerage: InsightAccount = {
    id: "brk",
    type: "investment",
    nature: "asset",
    category: "brokerage",
    currency: "USD",
    initialBalance: 0,
  };
  const investmentTaggedSavings: InsightAccount = {
    id: "inv",
    type: "investment",
    nature: "asset",
    category: "savings",
    currency: "USD",
    initialBalance: 9000,
  };
  const liabilityChecking: InsightAccount = {
    id: "lch",
    type: "transaction",
    nature: "liability",
    category: "checking",
    currency: "USD",
    initialBalance: 4000,
  };

  it("sums checking, savings, and cash assets and floors runway months", () => {
    for (const included of [checking, savings, cash]) {
      assert.equal(isLiquidAccount(included), true);
    }
    for (const excluded of [creditCard, mortgage, brokerage, investmentTaggedSavings, liabilityChecking]) {
      assert.equal(isLiquidAccount(excluded), false);
    }

    const result = sumLiquidBalances({
      accounts: [checking, savings, cash, creditCard, mortgage, brokerage, investmentTaggedSavings, liabilityChecking],
      transactions: [],
      transfers: [],
      balanceHistory: [snapshot("sav", 50), snapshot("mtg", 200000)],
      investmentHistory: [snapshot("inv", 8000), snapshot("brk", 3000)],
      currency: "USD",
      rates,
    });

    assert.equal(result.liquid, -100);
    assert.equal(runwayMonthsFrom(result.liquid, 80), 0);
    assert.equal(Math.max(0, result.liquid), 0);
  });

  it("keeps liquid sums at full precision", () => {
    const result = sumLiquidBalances({
      accounts: [
        {
          id: "chk",
          type: "transaction",
          nature: "asset",
          category: "checking",
          currency: "USD",
          initialBalance: 1_000_000.5,
        },
      ],
      transactions: [],
      transfers: [],
      balanceHistory: [],
      currency: "USD",
      rates,
    });

    assert.equal(result.liquid, 1_000_000.5);
    assert.equal(roundForNetWorth(result.liquid), 1_000_001);
  });

  it("reconstructs a checking balance with transfer leg amounts", () => {
    const result = sumLiquidBalances({
      accounts: [
        {
          id: "chk",
          type: "transaction",
          nature: "asset",
          category: "checking",
          currency: "USD",
          initialBalance: 100,
        },
      ],
      transactions: [
        { accountId: "chk", type: "credit", amount: 40 },
        { accountId: "chk", type: "debit", amount: 15 },
      ],
      transfers: [
        { fromAccountId: "other", toAccountId: "chk", amount: 5, fromAmount: 9, toAmount: 7 },
        { fromAccountId: "chk", toAccountId: "other", amount: 3, fromAmount: 4, toAmount: 8 },
      ],
      balanceHistory: [],
      currency: "USD",
      rates,
    });

    assert.equal(result.liquid, 128);
    assert.equal(
      transactionAccountBalance(
        { id: "card", initialBalance: 10, nature: "liability" },
        [
          { accountId: "card", type: "debit", amount: 5 },
          { accountId: "card", type: "credit", amount: 2 },
        ],
        [{ fromAccountId: "card", toAccountId: "other", amount: 1, fromAmount: 4, toAmount: 1 }],
      ),
      17,
    );
  });

  it("picks the latest balance snapshot, then the later created_at", () => {
    const selected = selectLatestSnapshot([
      { accountId: "sav", balance: 5, date: new Date(2026, 7, 1), createdAt: new Date(2026, 9, 2) },
      { accountId: "sav", balance: 10, date: new Date(2026, 8, 1), createdAt: new Date(2026, 8, 1, 9) },
      { accountId: "sav", balance: 40, date: new Date(2026, 8, 1), createdAt: new Date(2026, 8, 1, 18) },
    ]);

    assert.equal(selected?.balance, 40);
  });
});

describe("trailing expense window", () => {
  it("uses the three complete months before October and not the dashboard start", () => {
    const window = trailingCompleteMonths(now, 3);
    assert.deepEqual(
      window.map((month) => month.month),
      ["2026-07", "2026-08", "2026-09"],
    );

    const dashboardStart = startOfDay(subMonths(startOfMonth(now), 2));
    const dashboardEnd = endOfDay(now);
    assert.equal(format(dashboardStart, "yyyy-MM-dd"), "2026-08-01");
    assert.equal(format(window[0].start, "yyyy-MM-dd"), "2026-07-01");
    assert.notEqual(format(window[0].start, "yyyy-MM-dd"), format(dashboardStart, "yyyy-MM-dd"));
    assert.equal(
      window.some((month) => month.month === "2026-10"),
      false,
    );

    const dashboardMonths = monthsInRange(dashboardStart, dashboardEnd);
    assert.deepEqual(
      dashboardMonths.map((month) => month.month),
      ["2026-08", "2026-09", "2026-10"],
    );
    const october = dashboardMonths.find((month) => month.month === "2026-10");
    assert.equal(october?.asOf.getTime(), dashboardEnd.getTime());
  });

  it("parses yyyy-MM-dd as a local day", () => {
    const start = parseLocalDate("2026-10-15");
    const end = parseLocalEndDate("2026-10-15");
    assert.ok(start);
    assert.ok(end);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 9);
    assert.equal(start.getDate(), 15);
    assert.equal(start.getHours(), 0);
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMilliseconds(), 999);
    assert.equal(parseLocalDate("2026-02-31"), null);
    assert.equal(parseLocalDate("2026-10-15T00:00:00.000Z"), null);
  });

  it("averages one available complete month and leaves runway null when none exist", () => {
    const window = trailingCompleteMonths(now, 3);
    const totals = new Map<string, number>([
      ["2026-07", 9000],
      ["2026-08", 0],
      ["2026-09", 300],
    ]);
    const oneMonth = averageTrailingExpenses(totals, window, new Date(2026, 8, 10));
    assert.equal(oneMonth.typicalMonthCount, 1);
    assert.equal(oneMonth.typicalMonthlyExpenses, 300);
    assert.equal(runwayMonthsFrom(600, oneMonth.typicalMonthlyExpenses), 2);

    const none = averageTrailingExpenses(totals, window, new Date(2026, 9, 2));
    assert.equal(none.typicalMonthCount, 0);
    assert.equal(none.typicalMonthlyExpenses, null);
    assert.equal(runwayMonthsFrom(600, none.typicalMonthlyExpenses), null);
  });

  it("returns null runway when the trailing average is zero", () => {
    const window = trailingCompleteMonths(now, 3);
    const totals = new Map(window.map((month) => [month.month, 0]));
    const typical = averageTrailingExpenses(totals, window, new Date(2026, 6, 1));
    assert.equal(typical.typicalMonthCount, 3);
    assert.equal(typical.typicalMonthlyExpenses, 0);
    assert.equal(runwayMonthsFrom(500, typical.typicalMonthlyExpenses), null);
  });

  it("converts every month in the window with the same latest rate map", () => {
    const window = trailingCompleteMonths(now, 3);
    const { totals } = expenseTotalsByMonth(
      [account({ id: "sgd", type: "transaction", nature: "asset", category: "checking", currency: "SGD" })],
      [
        { accountId: "sgd", type: "debit", amount: 125, date: new Date(2026, 6, 15) },
        { accountId: "sgd", type: "debit", amount: 50, date: new Date(2026, 9, 2) },
      ],
      window,
      "USD",
      rates,
    );

    assert.equal(totals.get("2026-07"), 100);
    assert.equal(totals.get("2026-08"), 0);
    assert.equal(totals.get("2026-09"), 0);
    assert.equal(totals.has("2026-10"), false);

    const insight = buildSavingsInsight({
      accounts: [
        account({
          id: "sgd",
          type: "transaction",
          nature: "asset",
          category: "checking",
          currency: "SGD",
          createdAt: new Date(2026, 6, 1),
          initialBalance: 0,
        }),
      ],
      transactions: [
        { accountId: "sgd", type: "credit", amount: 250, date: new Date(2026, 7, 2) },
        { accountId: "sgd", type: "debit", amount: 125, date: new Date(2026, 6, 15) },
        { accountId: "sgd", type: "debit", amount: 50, date: new Date(2026, 9, 2) },
      ],
      transfers: [],
      balanceHistory: [],
      start: rangeStart,
      end: rangeEnd,
      startDate: "2026-08-01",
      endDate: "2026-10-15",
      currency: "USD",
      rates,
      now,
    });

    assert.equal(insight.income, 200);
    assert.equal(insight.expenses, 40);
    assert.equal(insight.kept, 160);
    assert.equal(insight.savingsRate, 0.8);
    assert.equal(insight.typicalMonthCount, 3);
    assert.equal(insight.typicalMonthlyExpenses, 100 / 3);
    assert.equal(insight.range.startDate, "2026-08-01");
    assert.equal(insight.runwayMonths, Math.max(0, insight.liquid) / (100 / 3));
  });
});

const cardFixture = (overrides: Partial<SavingsRunwayData> = {}): SavingsRunwayData => ({
  currency: "USD",
  range: { startDate: "2026-08-01", endDate: "2026-10-15" },
  income: 1000,
  expenses: 250,
  kept: 750,
  savingsRate: 0.75,
  signedInvestment: 200,
  leftInCash: 550,
  liquid: 4200,
  typicalMonthlyExpenses: 1000,
  typicalMonthCount: 3,
  runwayMonths: 4.2,
  hasUnsupportedCurrencies: false,
  ...overrides,
});

describe("savings runway card", () => {
  it("names the range, the rate, invested, and left in cash", () => {
    const html = renderToStaticMarkup(createElement(SavingsRunwayCard, { data: cardFixture(), isLoading: false }));

    assert.match(html, /Savings rate/);
    assert.match(html, /75\.0%/);
    assert.match(html, /Aug 1, 2026/);
    assert.match(html, /Oct 15, 2026/);
    assert.match(html, /Invested/);
    assert.match(html, /Left in cash/);
    assert.match(html, /\$200\.00/);
    assert.match(html, /\$550\.00/);
    assert.match(html, /4\.2 months of expenses in cash/);
    assert.match(html, /Based on the last 3 full months, not the selected dates/);
    assert.match(html, /\$4,200\.00 liquid today/);
    assert.equal(html.includes(">Savings<"), false);
  });

  it("shows kept without a percent when the period has no income", () => {
    const html = renderToStaticMarkup(
      createElement(SavingsRunwayCard, {
        data: cardFixture({
          income: 0,
          expenses: 40,
          kept: -40,
          savingsRate: null,
          signedInvestment: 0,
          leftInCash: -40,
        }),
        isLoading: false,
      }),
    );

    assert.match(html, /No income in this period/);
    assert.match(html, /-\$40\.00 kept/);
    assert.equal(html.includes("%"), false);
  });

  it("hides the months figure when no complete month exists and says when spending is zero", () => {
    const empty = renderToStaticMarkup(
      createElement(SavingsRunwayCard, {
        data: cardFixture({
          typicalMonthCount: 0,
          typicalMonthlyExpenses: null,
          runwayMonths: null,
          liquid: 80,
        }),
        isLoading: false,
      }),
    );
    assert.match(empty, /Runway uses full months before this one, not the selected dates/);
    assert.equal(empty.includes("months of expenses"), false);

    const quiet = renderToStaticMarkup(
      createElement(SavingsRunwayCard, {
        data: cardFixture({
          typicalMonthCount: 2,
          typicalMonthlyExpenses: 0,
          runwayMonths: null,
        }),
        isLoading: false,
      }),
    );
    assert.match(quiet, /No recent expenses/);
    assert.match(quiet, /Based on the last 2 full months, not the selected dates/);
  });
});

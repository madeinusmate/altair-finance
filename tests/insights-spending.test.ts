import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertAmount } from "../lib/fx";
import type { SupportedCurrency } from "../lib/currencies";
import {
  clampDayInMonth,
  formatLocalDate,
  monthsInRange,
  parseLocalDateEnd,
  parseLocalDateStart,
  previousPeriod,
  yearAgoPeriod,
} from "../lib/insights/range";
import {
  buildSpendingComparison,
  NO_PAYEE_LABEL,
  yearAgoWindowForLedger,
  type SpendingAccount,
  type SpendingComparison,
  type SpendingLedgerEntry,
} from "../lib/insights/spending";

const rates: Record<SupportedCurrency, number> = {
  HKD: 7.8,
  USD: 1,
  SGD: 1.35,
  EUR: 0.9,
  GBP: 0.78,
  CHF: 0.88,
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

const checking: SpendingAccount = { id: "checking", type: "transaction", currency: "USD" };
const savings: SpendingAccount = { id: "savings", type: "balance", currency: "USD" };
const sgdCard: SpendingAccount = { id: "sgd", type: "transaction", currency: "SGD" };
const eurCard: SpendingAccount = { id: "eur", type: "transaction", currency: "EUR" };

const day = (year: number, monthIndex: number, date: number, hour = 12): Date => {
  return new Date(year, monthIndex, date, hour, 0, 0, 0);
};

const startOf = (year: number, monthIndex: number, date: number): Date => {
  return new Date(year, monthIndex, date, 0, 0, 0, 0);
};

const endOf = (year: number, monthIndex: number, date: number): Date => {
  return new Date(year, monthIndex, date, 23, 59, 59, 999);
};

const debit = (
  category: string,
  amount: number,
  date: Date,
  accountId = "checking",
  payee: string | null = null,
): SpendingLedgerEntry => ({
  kind: "transaction",
  accountId,
  type: "debit",
  category,
  payee,
  amount,
  date,
});

const compare = (
  entries: SpendingLedgerEntry[],
  current: { start: Date; end: Date },
  options?: {
    accounts?: SpendingAccount[];
    yearAgo?: { start: Date; end: Date } | null;
    rateMap?: Record<SupportedCurrency, number>;
  },
): SpendingComparison => {
  const previous = previousPeriod(current.start, current.end);
  return buildSpendingComparison({
    entries,
    accounts: options?.accounts ?? [checking],
    rates: options?.rateMap ?? rates,
    displayCurrency: "USD",
    current,
    previous,
    yearAgo: options?.yearAgo === undefined ? null : options.yearAgo,
  });
};

const categoryNamed = (result: SpendingComparison, name: string) => {
  const category = result.categories.find((row) => row.category === name);
  assert.ok(category, name);
  return category;
};

const payeeNamed = (result: SpendingComparison, name: string) => {
  const payee = result.payees.find((row) => row.category === name);
  assert.ok(payee, name);
  return payee;
};

describe("spending versus last period", () => {
  const october = { start: startOf(2026, 9, 1), end: endOf(2026, 9, 15) };

  it("parses yyyy-MM-dd as a local day rather than UTC midnight", () => {
    const start = parseLocalDateStart("2026-10-15");
    const end = parseLocalDateEnd("2026-10-15");
    assert.ok(start);
    assert.ok(end);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 9);
    assert.equal(start.getDate(), 15);
    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
    assert.equal(end.getSeconds(), 59);
    assert.equal(end.getMilliseconds(), 999);
  });

  it("keeps share of this period distinct from the change versus the previous window", () => {
    const result = compare(
      [
        debit("Food & Drink", 120, day(2026, 9, 5)),
        debit("Transport", 180, day(2026, 9, 6)),
        debit("Food & Drink", 100, day(2026, 8, 20)),
      ],
      october,
    );
    const food = categoryNamed(result, "Food & Drink");
    const transport = categoryNamed(result, "Transport");

    assert.equal(food.amount, 120);
    assert.equal(food.percentage, 40);
    assert.equal(food.previousAmount, 100);
    assert.equal(food.delta, 20);
    assert.equal(food.percentChange, 20);
    assert.equal(food.direction, "up");
    assert.equal(food.status, "ongoing");
    assert.equal("yearAgoAmount" in food, false);

    assert.equal(transport.amount, 180);
    assert.equal(transport.percentage, 60);
    assert.equal(transport.status, "new");
    assert.equal(transport.percentChange, null);
    assert.equal(transport.direction, "up");
    assert.equal(result.categories.map((row) => row.category).join(","), "Transport,Food & Drink");
    assert.equal(result.total, 300);
    assert.equal(result.previousTotal, 100);
    assert.equal(result.yearAgo, null);
    assert.equal(
      result.categories.reduce((sum, row) => sum + row.amount, 0),
      result.total,
    );
  });

  it("groups the same debits by payee and buckets a blank payee", () => {
    const result = compare(
      [
        debit("Food & Drink", 80, day(2026, 9, 5), "checking", "Cafe"),
        debit("Food & Drink", 40, day(2026, 9, 6), "checking", "Cafe"),
        debit("Transport", 30, day(2026, 9, 7), "checking", null),
        debit("Food & Drink", 50, day(2026, 8, 20), "checking", "Cafe"),
        debit("Transport", 20, day(2026, 8, 21), "checking", "  "),
        debit("Shopping", 10, day(2026, 8, 22), "checking", "Market"),
        debit("Travel", 15, day(2026, 9, 8), "checking", "Airline"),
      ],
      october,
    );

    const cafe = payeeNamed(result, "Cafe");
    const unassigned = payeeNamed(result, NO_PAYEE_LABEL);
    const airline = payeeNamed(result, "Airline");
    const market = payeeNamed(result, "Market");

    assert.equal(cafe.amount, 120);
    assert.equal(cafe.previousAmount, 50);
    assert.equal(cafe.percentage, (120 / 165) * 100);
    assert.equal(cafe.status, "ongoing");
    assert.equal(unassigned.amount, 30);
    assert.equal(unassigned.previousAmount, 20);
    assert.equal(airline.status, "new");
    assert.equal(airline.previousAmount, 0);
    assert.equal(market.status, "gone");
    assert.equal(market.amount, 0);
    assert.equal(
      result.payees.reduce((sum, row) => sum + row.amount, 0),
      result.total,
    );
    assert.equal(result.total, 165);
    assert.equal(
      result.payees.map((row) => row.category).join(","),
      "Cafe,No payee,Airline,Market",
    );
  });

  it("marks a category only in the current window as new and only in the previous window as gone", () => {
    const result = compare(
      [
        debit("Travel", 50, day(2026, 9, 4)),
        debit("Rent", 80, day(2026, 8, 18)),
      ],
      october,
    );
    const travel = categoryNamed(result, "Travel");
    const rent = categoryNamed(result, "Rent");

    assert.equal(travel.status, "new");
    assert.equal(travel.percentChange, null);
    assert.equal(travel.previousAmount, 0);
    assert.equal(rent.status, "gone");
    assert.equal(rent.amount, 0);
    assert.equal(rent.percentage, 0);
    assert.equal(rent.previousAmount, 80);
    assert.equal(rent.delta, -80);
    assert.equal(rent.direction, "down");
    assert.equal(rent.percentChange, -100);
    assert.deepEqual(
      result.categories.map((row) => row.category),
      ["Travel", "Rent"],
    );

    const sorted = compare(
      [
        debit("Food", 50, day(2026, 9, 5)),
        debit("Food", 40, day(2026, 8, 20)),
        debit("Travel", 80, day(2026, 9, 6)),
        debit("Rent", 30, day(2026, 8, 18)),
        debit("Utilities", 90, day(2026, 8, 19)),
      ],
      october,
    );
    assert.deepEqual(
      sorted.categories.map((row) => row.category),
      ["Travel", "Food", "Utilities", "Rent"],
    );
  });

  it("omits a category that is zero in both the current and previous windows", () => {
    const yearAgo = yearAgoPeriod(october.start, october.end);
    assert.ok(yearAgo);
    const result = compare(
      [
        debit("Ghost", 0, day(2026, 9, 3)),
        debit("Ghost", 0, day(2026, 8, 20)),
        debit("Last year only", 40, day(2025, 9, 4)),
      ],
      october,
      { yearAgo },
    );

    assert.equal(
      result.categories.some((row) => row.category === "Ghost" || row.category === "Last year only"),
      false,
    );
    assert.equal(result.categories.length, 0);
    assert.equal(result.yearAgo?.total, 40);
  });

  it("uses an equal day count ending the day before the selected start", () => {
    const lastThreeMonths = previousPeriod(startOf(2026, 7, 1), endOf(2026, 9, 15));
    assert.equal(lastThreeMonths.dayCount, 76);
    assert.equal(formatLocalDate(lastThreeMonths.start), "2026-05-17");
    assert.equal(formatLocalDate(lastThreeMonths.end), "2026-07-31");

    const january = previousPeriod(startOf(2026, 0, 1), endOf(2026, 0, 31));
    assert.equal(january.dayCount, 31);
    assert.equal(formatLocalDate(january.start), "2025-12-01");
    assert.equal(formatLocalDate(january.end), "2025-12-31");
  });

  it("sets year-ago only for a single month when the ledger already covered that window", () => {
    const slice = { start: startOf(2026, 9, 1), end: endOf(2026, 9, 15) };
    const yearAgo = yearAgoPeriod(slice.start, slice.end);
    assert.ok(yearAgo);
    assert.equal(formatLocalDate(yearAgo.start), "2025-10-01");
    assert.equal(formatLocalDate(yearAgo.end), "2025-10-15");

    const threeMonths = { start: startOf(2026, 7, 1), end: endOf(2026, 9, 15) };
    assert.equal(yearAgoPeriod(threeMonths.start, threeMonths.end), null);
    assert.equal(yearAgoWindowForLedger(threeMonths.start, threeMonths.end, startOf(2000, 0, 1)), null);

    const after = yearAgoWindowForLedger(slice.start, slice.end, new Date(yearAgo.end.getTime() + 1));
    assert.equal(after, null);

    const covered = yearAgoWindowForLedger(slice.start, slice.end, startOf(2025, 9, 1));
    assert.ok(covered);
    const quiet = compare([], slice, { yearAgo: covered });
    assert.equal(quiet.yearAgo?.total, 0);
    assert.equal(quiet.yearAgo?.totalDelta, 0);
    assert.equal(quiet.yearAgo?.totalDirection, "flat");
    assert.equal(quiet.yearAgo?.totalPercentChange, null);
    assert.equal(quiet.categories.length, 0);
    assert.equal(quiet.yearAgo?.startDate, "2025-10-01");
    assert.equal(quiet.yearAgo?.endDate, "2025-10-15");

    const withSpend = compare(
      [debit("Food & Drink", 120, day(2026, 9, 5)), debit("Food & Drink", 80, day(2025, 9, 5))],
      slice,
      { yearAgo: covered },
    );
    const food = categoryNamed(withSpend, "Food & Drink");
    assert.equal(food.yearAgoAmount, 80);
    assert.equal(food.yearAgoDelta, 40);
    assert.equal(food.yearAgoPercentChange, 50);
    assert.equal(food.yearAgoDirection, "up");
    assert.equal(withSpend.yearAgo?.total, 80);
    assert.equal(withSpend.yearAgo?.totalDelta, 40);
    assert.equal(withSpend.yearAgo?.totalDirection, "up");
  });

  it("clamps a 31st onto non-leap February so the date does not spill into March", () => {
    const clamped = clampDayInMonth(2023, 1, 31);
    assert.equal(formatLocalDate(clamped), "2023-02-28");
    assert.equal(clamped.getMonth(), 1);

    const leapDay = yearAgoPeriod(startOf(2024, 1, 29), endOf(2024, 1, 29));
    assert.ok(leapDay);
    assert.equal(formatLocalDate(leapDay.start), "2023-02-28");
    assert.equal(formatLocalDate(leapDay.end), "2023-02-28");
    assert.equal(leapDay.end.getMonth(), 1);

    const jan2025 = yearAgoPeriod(startOf(2025, 0, 31), endOf(2025, 0, 31));
    const jan2024 = yearAgoPeriod(startOf(2024, 0, 31), endOf(2024, 0, 31));
    assert.equal(formatLocalDate(jan2025!.start), "2024-01-31");
    assert.equal(formatLocalDate(jan2025!.end), "2024-01-31");
    assert.equal(formatLocalDate(jan2024!.start), "2023-01-31");
    assert.equal(formatLocalDate(jan2024!.end), "2023-01-31");
  });

  it("ignores a non-transaction debit, a transfer, and a credit refund", () => {
    const result = compare(
      [
        debit("Food & Drink", 40, day(2026, 9, 5)),
        debit("Food & Drink", 999, day(2026, 9, 5), "savings"),
        {
          kind: "transaction",
          accountId: "checking",
          type: "credit",
          category: "Food & Drink",
          amount: 15,
          date: day(2026, 9, 6),
        },
        { kind: "transfer", amount: 400, date: day(2026, 9, 7) },
      ],
      october,
      { accounts: [checking, savings] },
    );

    assert.equal(result.total, 40);
    assert.equal(categoryNamed(result, "Food & Drink").amount, 40);
    assert.equal(result.hasUnsupportedCurrencies, false);
  });

  it("converts both windows with the same rate map", () => {
    const entries = [
      debit("Supplies", 135, day(2026, 9, 5), "sgd"),
      debit("Supplies", 90, day(2026, 9, 6), "eur"),
      debit("Supplies", 135, day(2026, 8, 20), "sgd"),
    ];
    const accounts = [sgdCard, eurCard];
    const result = compare(entries, october, { accounts });

    const expectedCurrent =
      convertAmount(135, "SGD", "USD", rates) + convertAmount(90, "EUR", "USD", rates);
    const expectedPrevious = convertAmount(135, "SGD", "USD", rates);
    assert.equal(categoryNamed(result, "Supplies").amount, expectedCurrent);
    assert.equal(categoryNamed(result, "Supplies").previousAmount, expectedPrevious);
    assert.equal(expectedCurrent, 200);
    assert.equal(expectedPrevious, 100);

    const laterRates: Record<SupportedCurrency, number> = { ...rates, SGD: 2.7 };
    const later = compare(entries, october, { accounts, rateMap: laterRates });
    assert.equal(categoryNamed(later, "Supplies").amount, convertAmount(135, "SGD", "USD", laterRates) + convertAmount(90, "EUR", "USD", laterRates));
    assert.equal(categoryNamed(later, "Supplies").previousAmount, convertAmount(135, "SGD", "USD", laterRates));
    assert.equal(categoryNamed(later, "Supplies").previousAmount, 50);
  });

  it("treats a delta under half a cent as flat", () => {
    const result = compare(
      [debit("Coffee", 10.001, day(2026, 9, 5)), debit("Coffee", 10, day(2026, 8, 20))],
      october,
    );
    const coffee = categoryNamed(result, "Coffee");
    assert.ok(Math.abs(coffee.delta - 0.001) < 1e-9);
    assert.ok(Math.abs(coffee.delta) < 0.005);
    assert.equal(coffee.direction, "flat");
    assert.equal(coffee.percentChange, null);
    assert.equal(coffee.status, "ongoing");
  });

  it("skips an unsupported account currency and still returns the other categories", () => {
    const result = compare(
      [
        debit("Food & Drink", 10, day(2026, 9, 5)),
        debit("Travel", 80, day(2026, 9, 6), "legacy"),
      ],
      october,
      { accounts: [checking, { id: "legacy", type: "transaction", currency: "INR" }] },
    );
    assert.equal(result.hasUnsupportedCurrencies, true);
    assert.equal(result.total, 10);
    assert.equal(result.categories.length, 1);
    assert.equal(result.categories[0]?.category, "Food & Drink");

    const withoutGbp = Object.fromEntries(
      Object.entries(rates).filter(([currency]) => currency !== "GBP"),
    ) as Record<SupportedCurrency, number>;
    const missingRate = compare(
      [
        debit("Food & Drink", 10, day(2026, 9, 5)),
        debit("Travel", 20, day(2026, 9, 6), "gbp"),
      ],
      october,
      {
        accounts: [checking, { id: "gbp", type: "transaction", currency: "GBP" }],
        rateMap: withoutGbp,
      },
    );
    assert.equal(missingRate.hasUnsupportedCurrencies, true);
    assert.equal(missingRate.total, 10);
    assert.equal(missingRate.categories.length, 1);
  });

  it("lists months from the start month through the end month and caps as-of at the range end", () => {
    const months = monthsInRange(startOf(2026, 7, 1), endOf(2026, 9, 15));
    assert.deepEqual(
      months.map((month) => month.month),
      ["2026-08", "2026-09", "2026-10"],
    );
    assert.deepEqual(
      months.map((month) => month.monthLabel),
      ["Aug 2026", "Sep 2026", "Oct 2026"],
    );
    assert.equal(formatLocalDate(months[0]!.asOf), "2026-08-31");
    assert.equal(formatLocalDate(months[2]!.asOf), "2026-10-15");
    assert.equal(months[2]!.asOf.getTime(), endOf(2026, 9, 15).getTime());
  });
});

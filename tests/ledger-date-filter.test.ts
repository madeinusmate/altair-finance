import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endOfDay, format } from "date-fns";
import {
  customLedgerRange,
  isInLedgerDateFilter,
  ledgerPresetRange,
  parseLedgerDay,
} from "../lib/ledger/date-filter";

describe("ledger date filter", () => {
  it("keeps every date when the filter is all time", () => {
    const filter = { kind: "all" as const };

    assert.equal(isInLedgerDateFilter(new Date(1999, 0, 1), filter), true);
    assert.equal(isInLedgerDateFilter(new Date(2014, 3, 1), filter), true);
    assert.equal(isInLedgerDateFilter("2026-03-15T00:00:00.000Z", filter), true);
    assert.equal(isInLedgerDateFilter(0, filter), true);
    assert.equal(isInLedgerDateFilter(new Date(), filter), true);
  });

  it("includes the first and last local day of this month and excludes the adjacent days", () => {
    const now = new Date(2026, 9, 15, 18, 45, 0);
    const range = ledgerPresetRange("this-month", now);
    const filter = { kind: "range" as const, startDate: range.startDate, endDate: range.endDate };

    assert.equal(format(range.startDate, "yyyy-MM-dd"), "2026-10-01");
    assert.equal(format(range.endDate, "yyyy-MM-dd"), "2026-10-31");
    assert.equal(isInLedgerDateFilter(new Date(2026, 9, 1, 0, 0, 0, 0), filter), true);
    assert.equal(isInLedgerDateFilter(new Date(2026, 9, 31, 23, 59, 59, 999), filter), true);
    assert.equal(isInLedgerDateFilter(new Date(2026, 8, 30, 23, 59, 59, 999), filter), false);
    assert.equal(isInLedgerDateFilter(new Date(2026, 10, 1, 0, 0, 0, 0), filter), false);
  });

  it("does not include today in last month", () => {
    const now = new Date(2026, 9, 15, 12, 0, 0);
    const range = ledgerPresetRange("last-month", now);
    const filter = { kind: "range" as const, startDate: range.startDate, endDate: range.endDate };

    assert.equal(format(range.startDate, "yyyy-MM-dd"), "2026-09-01");
    assert.equal(format(range.endDate, "yyyy-MM-dd"), "2026-09-30");
    assert.equal(isInLedgerDateFilter(now, filter), false);
    assert.equal(isInLedgerDateFilter(new Date(2026, 8, 30, 12, 0, 0), filter), true);

    const today = new Date();
    const liveRange = ledgerPresetRange("last-month", today);
    assert.notEqual(format(today, "yyyy-MM"), format(liveRange.startDate, "yyyy-MM"));
    assert.equal(
      isInLedgerDateFilter(today, {
        kind: "range",
        startDate: liveRange.startDate,
        endDate: liveRange.endDate,
      }),
      false,
    );
  });

  it("classifies a UTC-midnight ISO string by the local day date-fns prints", () => {
    const iso = "2026-03-15T00:00:00.000Z";
    const printed = format(new Date(iso), "yyyy-MM-dd");
    const [year, month, day] = printed.split("-").map(Number);
    const startDate = new Date(year, month - 1, day);
    const endDate = endOfDay(startDate);

    assert.equal(isInLedgerDateFilter(iso, { kind: "range", startDate, endDate }), true);
    assert.equal(format(new Date(iso), "yyyy-MM-dd"), printed);

    const previousDay = new Date(year, month - 1, day - 1);
    assert.equal(
      isInLedgerDateFilter(iso, {
        kind: "range",
        startDate: previousDay,
        endDate: endOfDay(previousDay),
      }),
      false,
    );

    const utcCalendarDay = iso.slice(0, 10);
    if (utcCalendarDay !== printed) {
      const [utcYear, utcMonth, utcDay] = utcCalendarDay.split("-").map(Number);
      const utcStart = new Date(utcYear, utcMonth - 1, utcDay);
      assert.equal(
        isInLedgerDateFilter(iso, {
          kind: "range",
          startDate: utcStart,
          endDate: endOfDay(utcStart),
        }),
        false,
      );
    }
  });

  it("keeps a later day this month inside last 3 and last 12 months", () => {
    const now = new Date(2026, 9, 15, 8, 0, 0);
    const last3 = ledgerPresetRange("last-3-months", now);
    const last12 = ledgerPresetRange("last-12-months", now);

    assert.equal(format(last3.startDate, "yyyy-MM-dd"), "2026-08-01");
    assert.equal(format(last3.endDate, "yyyy-MM-dd"), "2026-10-31");
    assert.equal(format(last12.startDate, "yyyy-MM-dd"), "2025-11-01");
    assert.equal(format(last12.endDate, "yyyy-MM-dd"), "2026-10-31");

    const laterThisMonth = new Date(2026, 9, 31, 12, 0, 0);
    assert.equal(isInLedgerDateFilter(laterThisMonth, { kind: "range", ...last3 }), true);
    assert.equal(isInLedgerDateFilter(laterThisMonth, { kind: "range", ...last12 }), true);
    assert.equal(isInLedgerDateFilter(new Date(2026, 6, 31, 12, 0, 0), { kind: "range", ...last3 }), false);
    assert.equal(isInLedgerDateFilter(new Date(2025, 9, 31, 12, 0, 0), { kind: "range", ...last12 }), false);
  });

  it("parses custom days as local calendar dates and rejects an end before the start", () => {
    const parsed = parseLedgerDay("2026-03-15");
    assert.ok(parsed);
    assert.equal(parsed.getTime(), new Date(2026, 2, 15).getTime());
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 2);
    assert.equal(parsed.getDate(), 15);

    const range = customLedgerRange("2026-03-10", "2026-03-15");
    assert.ok(range);
    assert.equal(format(range.startDate, "yyyy-MM-dd"), "2026-03-10");
    assert.equal(format(range.endDate, "yyyy-MM-dd"), "2026-03-15");
    assert.equal(
      isInLedgerDateFilter(new Date(2026, 2, 15, 23, 30, 0), { kind: "range", ...range }),
      true,
    );
    assert.equal(
      isInLedgerDateFilter(new Date(2026, 2, 9, 23, 30, 0), { kind: "range", ...range }),
      false,
    );
    assert.equal(customLedgerRange("2026-03-20", "2026-03-01"), null);
    assert.equal(customLedgerRange("", "2026-03-01"), null);
    assert.equal(parseLedgerDay("2026-02-31"), null);
  });
});

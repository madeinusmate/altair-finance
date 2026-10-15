import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anchorBudgetYearMonth,
  paceForMonth,
  resolveMonthBudget,
  type BudgetMonthSource,
} from "../lib/budget/resolve-month";

const row = (id: string, yearMonth: string, amount: number): BudgetMonthSource => ({
  id,
  yearMonth,
  amount,
  currency: "USD",
});

describe("resolveMonthBudget", () => {
  const rows = [row("jan", "2026-01", 100), row("mar", "2026-03", 300)];

  it("uses the exact row when that month has a cap", () => {
    const resolved = resolveMonthBudget(rows, "2026-03");
    assert.ok(resolved);
    assert.equal(resolved.id, "mar");
    assert.equal(resolved.amount, 300);
    assert.equal(resolved.currency, "USD");
    assert.equal(resolved.inherited, false);
    assert.equal(resolved.inheritedFrom, null);
  });

  it("copies the latest earlier cap and marks it inherited", () => {
    const resolved = resolveMonthBudget(rows, "2026-02");
    assert.ok(resolved);
    assert.equal(resolved.id, null);
    assert.equal(resolved.amount, 100);
    assert.equal(resolved.inherited, true);
    assert.equal(resolved.inheritedFrom, "2026-01");
  });

  it("does not copy a later row backward", () => {
    assert.equal(resolveMonthBudget([row("mar", "2026-03", 300)], "2026-01"), null);
  });

  it("returns unbudgeted when no earlier row exists", () => {
    assert.equal(resolveMonthBudget([], "2026-04"), null);
    assert.equal(resolveMonthBudget(rows, "2025-12"), null);
  });

  it("uses the greatest earlier month when several exist", () => {
    const resolved = resolveMonthBudget(rows, "2026-04");
    assert.ok(resolved);
    assert.equal(resolved.id, null);
    assert.equal(resolved.amount, 300);
    assert.equal(resolved.inherited, true);
    assert.equal(resolved.inheritedFrom, "2026-03");
  });
});

describe("paceForMonth", () => {
  it("is on-track when spent is within the prorated cap", () => {
    const pace = paceForMonth({
      amount: 310,
      spent: 10,
      yearMonth: "2026-01",
      now: new Date(2026, 0, 1),
    });
    assert.equal(pace, "on-track");
  });

  it("is ahead when spent is over the prorated cap", () => {
    const pace = paceForMonth({
      amount: 310,
      spent: 11,
      yearMonth: "2026-01",
      now: new Date(2026, 0, 1),
    });
    assert.equal(pace, "ahead");
  });

  it("omits pace for a month that is not current", () => {
    const pace = paceForMonth({
      amount: 310,
      spent: 400,
      yearMonth: "2025-12",
      now: new Date(2026, 0, 15),
    });
    assert.equal(pace, null);
  });
});

describe("anchorBudgetYearMonth", () => {
  it("anchors a budget created today at the start of the 12-month window", () => {
    const now = new Date(2026, 9, 15);
    const createdAt = Math.floor(now.getTime() / 1000);
    assert.equal(anchorBudgetYearMonth(createdAt, now), "2025-11");
  });

  it("keeps an earlier created month as the anchor", () => {
    const now = new Date(2026, 9, 15);
    const createdAt = Math.floor(new Date(2024, 0, 5).getTime() / 1000);
    assert.equal(anchorBudgetYearMonth(createdAt, now), "2024-01");
  });

  it("uses the current month when created_at is in the future", () => {
    const now = new Date(2026, 9, 15);
    const createdAt = Math.floor(new Date(2027, 1, 1).getTime() / 1000);
    assert.equal(anchorBudgetYearMonth(createdAt, now), "2026-10");
  });
});

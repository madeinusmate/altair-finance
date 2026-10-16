import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endOfDay } from "date-fns";
import { balanceSnapshotSeries, reconstructBalanceSeries } from "../lib/chart-data-aggregation";

const start = new Date(2026, 0, 1, 0, 0, 0, 0);
const end = new Date(2026, 2, 15, 12, 0, 0, 0);

describe("reconstructBalanceSeries", () => {
  it("steps an asset balance and keeps activity outside the range out of the line", () => {
    const series = reconstructBalanceSeries(
      [
        { type: "debit", amount: 200, date: new Date(2025, 11, 20) },
        { type: "credit", amount: 50, date: new Date(2026, 0, 10) },
        { type: "debit", amount: 20, date: new Date(2026, 1, 2) },
        { type: "credit", amount: 999, date: new Date(2026, 3, 1) },
      ],
      [
        {
          fromAccountId: "other",
          toAccountId: "acct",
          amount: 30,
          fromAmount: 30,
          toAmount: 30,
          date: new Date(2026, 0, 20),
        },
        {
          fromAccountId: "acct",
          toAccountId: "other",
          amount: 10,
          fromAmount: 10,
          toAmount: 10,
          date: new Date(2026, 1, 2),
        },
      ],
      "acct",
      1000,
      "asset",
      start,
      end
    );

    assert.equal(series[0].balance, 800);
    assert.equal(series[1].balance, 850);
    assert.equal(series[2].balance, 880);
    assert.equal(series[3].balance, 850);
    assert.equal(series.at(-1)?.balance, 850);
    assert.equal(series.at(-1)?.time, endOfDay(end).getTime());
    assert.equal(series.some((point) => point.balance === 1849), false);
  });

  it("increases a liability on debits and outgoing transfers", () => {
    const series = reconstructBalanceSeries(
      [
        { type: "debit", amount: 40, date: new Date(2026, 0, 5) },
        { type: "credit", amount: 15, date: new Date(2026, 0, 8) },
      ],
      [
        {
          fromAccountId: "acct",
          toAccountId: "other",
          amount: 25,
          fromAmount: 25,
          toAmount: 25,
          date: new Date(2026, 1, 1),
        },
      ],
      "acct",
      100,
      "liability",
      start,
      end
    );

    assert.deepEqual(
      series.slice(0, 4).map((point) => point.balance),
      [100, 140, 125, 150]
    );
  });

  it("collapses movements that share a timestamp after the opening point", () => {
    const sameTime = new Date(2026, 0, 10, 8);
    const series = reconstructBalanceSeries(
      [
        { type: "debit", amount: 10, date: sameTime },
        { type: "debit", amount: 5, date: sameTime },
      ],
      [],
      "acct",
      100,
      "asset",
      start,
      end
    );

    const atEvent = series.filter((point) => point.time === sameTime.getTime());
    assert.equal(atEvent.length, 1);
    assert.equal(atEvent[0].balance, 85);
    assert.equal(series[0].balance, 100);
  });
});

describe("balanceSnapshotSeries", () => {
  it("carries the snapshot in force into the range and holds the last value", () => {
    const series = balanceSnapshotSeries(
      [
        { date: new Date(2025, 10, 1), balance: 400, createdAt: new Date(2025, 10, 1) },
        { date: new Date(2025, 11, 1), balance: 250, createdAt: new Date(2025, 11, 1) },
        { date: new Date(2025, 11, 1), balance: 260, createdAt: new Date(2025, 11, 2) },
        { date: new Date(2026, 1, 1), balance: 300, createdAt: new Date(2026, 1, 1) },
        { date: new Date(2026, 4, 1), balance: 900, createdAt: new Date(2026, 4, 1) },
      ],
      start,
      end,
      10
    );

    assert.equal(series[0].balance, 260);
    assert.equal(series[1].balance, 300);
    assert.equal(series.at(-1)?.balance, 300);
    assert.equal(series.at(-1)?.time, endOfDay(end).getTime());
  });

  it("stays on the opening balance when nothing was recorded", () => {
    const series = balanceSnapshotSeries([], start, end, 42);
    assert.deepEqual(
      series.map((point) => point.balance),
      [42, 42]
    );
  });
});

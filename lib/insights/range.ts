import {
  addMonths,
  endOfMonth,
  format,
  min,
  startOfMonth,
  subMonths,
} from "date-fns";

export type InsightMonth = {
  month: string;
  monthLabel: string;
  start: Date;
  end: Date;
  asOf: Date;
};

const LOCAL_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseLocalDay = (value: string, endOfDay: boolean): Date | null => {
  const match = LOCAL_DAY.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

/** Local midnight for a `yyyy-MM-dd` dashboard param. Not `new Date("YYYY-MM-DD")`. */
export const parseLocalDate = (value: string): Date | null => parseLocalDay(value, false);

/** Local end of that calendar day (`23:59:59.999`). */
export const parseLocalEndDate = (value: string): Date | null => parseLocalDay(value, true);

export const monthAsOf = (month: Date, rangeEnd: Date): Date => min([endOfMonth(month), rangeEnd]);

/** Months from `startOfMonth(start)` through `startOfMonth(end)`, inclusive. */
export const monthsInRange = (start: Date, end: Date): InsightMonth[] => {
  const normalizedStart = startOfMonth(start);
  const normalizedEnd = startOfMonth(end);
  const months: InsightMonth[] = [];
  let current = normalizedStart;

  while (current.getTime() <= normalizedEnd.getTime()) {
    const startOfCurrent = startOfMonth(current);
    months.push({
      month: format(startOfCurrent, "yyyy-MM"),
      monthLabel: format(startOfCurrent, "MMM yyyy"),
      start: startOfCurrent,
      end: endOfMonth(startOfCurrent),
      asOf: monthAsOf(startOfCurrent, end),
    });
    current = addMonths(current, 1);
  }

  return months;
};

/**
 * The `count` complete calendar months before the month that contains `now`.
 * On 15 Oct 2026, `trailingCompleteMonths(now, 3)` is July, August, and September.
 */
export const trailingCompleteMonths = (now: Date, count: number): InsightMonth[] => {
  if (count <= 0) {
    return [];
  }

  const currentMonthStart = startOfMonth(now);
  const first = startOfMonth(subMonths(currentMonthStart, count));
  const lastComplete = endOfMonth(subMonths(currentMonthStart, 1));
  return monthsInRange(first, lastComplete);
};

export const earliestInstant = (dates: ReadonlyArray<Date | null | undefined>): Date | null => {
  let earliest: Date | null = null;

  for (const date of dates) {
    if (!date || Number.isNaN(date.getTime())) {
      continue;
    }
    if (!earliest || date.getTime() < earliest.getTime()) {
      earliest = date;
    }
  }

  return earliest;
};

/** A complete month exists when the ledger's oldest instant falls on or before that month's end. */
export const completeMonthsOnLedger = (
  months: ReadonlyArray<InsightMonth>,
  oldest: Date | null,
): InsightMonth[] => {
  if (!oldest || Number.isNaN(oldest.getTime())) {
    return [];
  }

  const oldestTime = oldest.getTime();
  return months.filter((month) => oldestTime <= month.end.getTime());
};

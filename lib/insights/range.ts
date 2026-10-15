import {
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

/**
 * Shared dashboard date helpers for on-device insight charts.
 *
 * `yyyy-MM-dd` is a local calendar day: start at 00:00:00.000 and end at
 * 23:59:59.999. That matches the split in the monthly income route.
 * `new Date("YYYY-MM-DD")` is UTC and is not used here.
 *
 * Months run from `startOfMonth(start)` through `startOfMonth(end)`, inclusive.
 * Key `yyyy-MM`, label `MMM yyyy`.
 * A month's as-of instant is `min(endOfMonth(month), range end)`.
 */

export interface LocalDateRange {
  start: Date;
  end: Date;
}

export interface InsightMonth {
  month: string;
  monthLabel: string;
  monthStart: Date;
  start: Date;
  end: Date;
  asOf: Date;
}

export type PreviousPeriod = {
  start: Date;
  end: Date;
  dayCount: number;
};

const parseParts = (value: string): [number, number, number] | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return [year, month, day];
};

const buildLocalDate = (value: string, bound: "start" | "end"): Date | null => {
  const parts = parseParts(value);
  if (!parts) return null;
  const [year, month, day] = parts;
  const date =
    bound === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);

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

export const parseLocalDay = (value: string, bound: "start" | "end"): Date | null =>
  buildLocalDate(value, bound);

export const parseLocalDateStart = (value: string): Date | null => buildLocalDate(value, "start");

export const parseLocalDateEnd = (value: string): Date | null => buildLocalDate(value, "end");

/** Local midnight for a `yyyy-MM-dd` dashboard param. Not `new Date("YYYY-MM-DD")`. */
export const parseLocalDate = (value: string): Date | null => parseLocalDateStart(value);

/** Local end of that calendar day (`23:59:59.999`). */
export const parseLocalEndDate = (value: string): Date | null => parseLocalDateEnd(value);

export const parseLocalDateRange = (startDate: string, endDate: string): LocalDateRange | null => {
  const start = parseLocalDateStart(startDate);
  const end = parseLocalDateEnd(endDate);

  if (!start || !end || start.getTime() > end.getTime()) {
    return null;
  }

  return { start, end };
};

export const formatLocalDate = (date: Date): string => format(date, "yyyy-MM-dd");

export const formatAsOfDate = (asOf: Date): string => formatLocalDate(asOf);

export const earliestTimestamp = (dates: readonly (Date | null | undefined)[]): Date | null => {
  let earliest: Date | null = null;
  for (const date of dates) {
    if (!date || Number.isNaN(date.getTime())) continue;
    if (!earliest || date.getTime() < earliest.getTime()) earliest = date;
  }
  return earliest;
};

export const earliestInstant = (dates: ReadonlyArray<Date | null | undefined>): Date | null =>
  earliestTimestamp(dates);

export const monthAsOf = (monthStart: Date, rangeEnd: Date): Date => {
  const monthEnd = endOfMonth(monthStart);
  return monthEnd.getTime() <= rangeEnd.getTime() ? monthEnd : rangeEnd;
};

export const listMonths = (start: Date, end: Date): InsightMonth[] => {
  const normalizedEnd = startOfMonth(end);
  const months: InsightMonth[] = [];
  let current = startOfMonth(start);

  while (current.getTime() <= normalizedEnd.getTime()) {
    const monthStart = new Date(current);
    const monthEnd = endOfMonth(monthStart);
    months.push({
      month: format(monthStart, "yyyy-MM"),
      monthLabel: format(monthStart, "MMM yyyy"),
      monthStart,
      start: monthStart,
      end: monthEnd,
      asOf: monthAsOf(monthStart, end),
    });
    current = addMonths(current, 1);
  }

  return months;
};

/** Months from startOfMonth(start) through startOfMonth(end), inclusive. Key yyyy-MM. */
export const monthsInRange = (start: Date, end: Date): InsightMonth[] => listMonths(start, end);

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

/**
 * Equal length in calendar days, ending the day before the selected start.
 * dayCount = differenceInCalendarDays(end, start) + 1
 * previousEnd = endOfDay(subDays(start, 1))
 * previousStart = startOfDay(subDays(previousEnd, dayCount - 1))
 */
export const previousPeriod = (start: Date, end: Date): PreviousPeriod => {
  const dayCount = differenceInCalendarDays(end, start) + 1;
  const previousEnd = endOfDay(subDays(start, 1));
  const previousStart = startOfDay(subDays(previousEnd, dayCount - 1));
  return { start: previousStart, end: previousEnd, dayCount };
};

export const isSingleCalendarMonth = (start: Date, end: Date): boolean => {
  return start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
};

/**
 * Day-of-month copied onto a target month, clamped to that month's last day
 * so a 31st cannot spill into the following month.
 */
export const clampDayInMonth = (year: number, monthIndex: number, day: number): Date => {
  const lastDay = endOfMonth(new Date(year, monthIndex, 1)).getDate();
  const clampedDay = Math.min(Math.max(day, 1), lastDay);
  return new Date(year, monthIndex, clampedDay);
};

/**
 * Same day-of-month one year earlier, clamped to the last day of that month.
 * Null when start and end are not in the same calendar month.
 */
export const yearAgoPeriod = (start: Date, end: Date): { start: Date; end: Date } | null => {
  if (!isSingleCalendarMonth(start, end)) return null;
  const year = start.getFullYear() - 1;
  const monthIndex = start.getMonth();
  const startDate = clampDayInMonth(year, monthIndex, start.getDate());
  const endDate = clampDayInMonth(year, monthIndex, end.getDate());
  return {
    start: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0),
    end: new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999),
  };
};

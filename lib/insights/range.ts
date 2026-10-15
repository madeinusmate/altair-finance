import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";

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
  asOf: Date;
}

export const parseLocalDay = (value: string, bound: "start" | "end"): Date | null => {
  const [year, month, day] = value.split("-").map(Number);
  const date =
    bound === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

export const parseLocalDateRange = (startDate: string, endDate: string): LocalDateRange | null => {
  const start = parseLocalDay(startDate, "start");
  const end = parseLocalDay(endDate, "end");

  if (!start || !end || start.getTime() > end.getTime()) {
    return null;
  }

  return { start, end };
};

export const monthAsOf = (monthStart: Date, rangeEnd: Date): Date => {
  const monthEnd = endOfMonth(monthStart);
  return monthEnd.getTime() <= rangeEnd.getTime() ? monthEnd : rangeEnd;
};

export const listMonths = (start: Date, end: Date): InsightMonth[] => {
  const normalizedStart = startOfMonth(start);
  const normalizedEnd = startOfMonth(end);
  const months: InsightMonth[] = [];
  let current = normalizedStart;

  while (current.getTime() <= normalizedEnd.getTime()) {
    const monthStart = new Date(current);
    months.push({
      month: format(monthStart, "yyyy-MM"),
      monthLabel: format(monthStart, "MMM yyyy"),
      monthStart,
      asOf: monthAsOf(monthStart, end),
    });
    current = addMonths(current, 1);
  }

  return months;
};

export const formatAsOfDate = (asOf: Date): string => format(asOf, "yyyy-MM-dd");

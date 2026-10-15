import {
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns";

/**
 * Shared local-calendar helpers for dashboard insights.
 * yyyy-MM-dd matches the split in the monthly income route:
 * start at 00:00:00.000 and end at 23:59:59.999 in the local timezone.
 */

export type LocalDateRange = {
  start: Date;
  end: Date;
};

export type InsightMonth = {
  month: string;
  monthLabel: string;
  asOf: Date;
};

export type PreviousPeriod = {
  start: Date;
  end: Date;
  dayCount: number;
};

const parseParts = (value: string): [number, number, number] | null => {
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return [year, month, day];
};

export const parseLocalDateStart = (value: string): Date | null => {
  const parts = parseParts(value);
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const parseLocalDateEnd = (value: string): Date | null => {
  const parts = parseParts(value);
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const parseLocalDateRange = (startDate: string, endDate: string): LocalDateRange | null => {
  const start = parseLocalDateStart(startDate);
  const end = parseLocalDateEnd(endDate);
  if (!start || !end) return null;
  return { start, end };
};

export const formatLocalDate = (date: Date): string => format(date, "yyyy-MM-dd");

export const earliestTimestamp = (dates: readonly (Date | null | undefined)[]): Date | null => {
  let earliest: Date | null = null;
  for (const date of dates) {
    if (!date || Number.isNaN(date.getTime())) continue;
    if (!earliest || date.getTime() < earliest.getTime()) earliest = date;
  }
  return earliest;
};

/** As-of for a month is min(end of that month, range end). */
export const monthAsOf = (month: Date, rangeEnd: Date): Date => {
  const monthEnd = endOfMonth(month);
  return monthEnd.getTime() <= rangeEnd.getTime() ? monthEnd : rangeEnd;
};

/** Months from startOfMonth(start) through startOfMonth(end), inclusive. Key yyyy-MM. */
export const monthsInRange = (start: Date, end: Date): InsightMonth[] => {
  const last = startOfMonth(end);
  const months: InsightMonth[] = [];
  let cursor = startOfMonth(start);

  while (cursor.getTime() <= last.getTime()) {
    months.push({
      month: format(cursor, "yyyy-MM"),
      monthLabel: format(cursor, "MMM yyyy"),
      asOf: monthAsOf(cursor, end),
    });
    cursor = addMonths(cursor, 1);
  }

  return months;
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

import { endOfDay, format, startOfMonth, subMonths } from "date-fns";

export type BudgetMonthSource = {
  id: string;
  yearMonth: string;
  amount: number;
  currency: string;
};

export type ResolvedMonthBudget = {
  id: string | null;
  amount: number;
  currency: string;
  inherited: boolean;
  inheritedFrom: string | null;
};

export type BudgetPace = "on-track" | "ahead";

const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

export const parseYearMonth = (value: string): Date | null => {
  const match = YEAR_MONTH.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
};

export const currentYearMonth = (now: Date = new Date()): string => format(now, "yyyy-MM");

export const isAfterCurrentMonth = (yearMonth: string, now: Date = new Date()): boolean => {
  return yearMonth > currentYearMonth(now);
};

export const budgetMonthLabel = (yearMonth: string, pattern = "MMMM yyyy"): string => {
  const date = parseYearMonth(yearMonth);
  if (!date) {
    return yearMonth;
  }
  return format(date, pattern);
};

export const monthBounds = (yearMonth: string): { start: Date; end: Date } | null => {
  const start = parseYearMonth(yearMonth);
  if (!start) {
    return null;
  }

  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return {
    start: startOfMonth(start),
    end: endOfDay(new Date(start.getFullYear(), start.getMonth(), lastDay)),
  };
};

export const anchorBudgetYearMonth = (createdAtSeconds: number, now: Date = new Date()): string => {
  const created = new Date(createdAtSeconds * 1000);
  if (created.getTime() > now.getTime()) {
    return format(now, "yyyy-MM");
  }

  const createdMonth = format(created, "yyyy-MM");
  const windowStart = format(subMonths(startOfMonth(now), 11), "yyyy-MM");
  return createdMonth < windowStart ? createdMonth : windowStart;
};

export const resolveMonthBudget = (
  rowsForCategory: BudgetMonthSource[],
  yearMonth: string
): ResolvedMonthBudget | null => {
  const exact = rowsForCategory.find((row) => row.yearMonth === yearMonth);
  if (exact) {
    return {
      id: exact.id,
      amount: exact.amount,
      currency: exact.currency,
      inherited: false,
      inheritedFrom: null,
    };
  }

  const earlier = rowsForCategory
    .filter((row) => row.yearMonth < yearMonth)
    .sort((left, right) => (left.yearMonth < right.yearMonth ? 1 : left.yearMonth > right.yearMonth ? -1 : 0));

  const latest = earlier[0];
  if (!latest) {
    return null;
  }

  return {
    id: null,
    amount: latest.amount,
    currency: latest.currency,
    inherited: true,
    inheritedFrom: latest.yearMonth,
  };
};

export const paceForMonth = ({
  amount,
  spent,
  yearMonth,
  now = new Date(),
}: {
  amount: number;
  spent: number;
  yearMonth: string;
  now?: Date;
}): BudgetPace | null => {
  if (yearMonth !== currentYearMonth(now)) {
    return null;
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expected = amount * (now.getDate() / daysInMonth);
  return spent <= expected ? "on-track" : "ahead";
};

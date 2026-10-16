import { endOfDay, endOfMonth, format, startOfMonth, subMonths } from "date-fns";

export type LedgerDateFilter =
  | { kind: "all" }
  | { kind: "range"; startDate: Date; endDate: Date };

export type LedgerDatePreset =
  | "this-month"
  | "last-month"
  | "last-3-months"
  | "last-12-months";

const ledgerDayKey = (date: Date): string => format(date, "yyyy-MM-dd");

// Match the calendar day the ledger header prints (`format(..., "yyyy-MM-dd")`),
// including rows stored as UTC midnight.
export const isInLedgerDateFilter = (
  date: Date | string | number,
  filter: LedgerDateFilter,
): boolean => {
  if (filter.kind === "all") {
    return true;
  }

  const day = ledgerDayKey(new Date(date));
  const start = ledgerDayKey(filter.startDate);
  const end = ledgerDayKey(filter.endDate);
  return start <= day && day <= end;
};

export const ledgerPresetRange = (
  preset: LedgerDatePreset,
  now: Date = new Date(),
): { startDate: Date; endDate: Date } => {
  if (preset === "this-month") {
    return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
  }

  if (preset === "last-month") {
    const month = subMonths(now, 1);
    return { startDate: startOfMonth(month), endDate: endOfMonth(month) };
  }

  if (preset === "last-3-months") {
    return {
      startDate: startOfMonth(subMonths(now, 2)),
      endDate: endOfMonth(now),
    };
  }

  return {
    startDate: startOfMonth(subMonths(now, 11)),
    endDate: endOfMonth(now),
  };
};

// `<input type="date">` values are local calendar days. `new Date("YYYY-MM-DD")` is UTC midnight.
export const parseLedgerDay = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) {
    return null;
  }

  return date;
};

export const customLedgerRange = (
  startInput: string,
  endInput: string,
): { startDate: Date; endDate: Date } | null => {
  const startDate = parseLedgerDay(startInput);
  const endDay = parseLedgerDay(endInput);
  if (!startDate || !endDay || endInput < startInput) {
    return null;
  }

  return { startDate, endDate: endOfDay(endDay) };
};

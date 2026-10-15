"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, startOfMonth, subMonths, addMonths } from "date-fns";
import { budgetMonthLabel, parseYearMonth } from "@/lib/budget/resolve-month";

interface MonthSelectorProps {
  value: string;
  onChange: (month: string) => void;
  disabled?: boolean;
}

export const MonthSelector = ({ value, onChange, disabled }: MonthSelectorProps) => {
  const currentMonth = format(new Date(), "yyyy-MM");
  const isCurrentMonth = value === currentMonth;

  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const month = subMonths(now, i);
    months.push(format(startOfMonth(month), "yyyy-MM"));
  }

  const oldestMonth = months[months.length - 1] ?? currentMonth;

  const handlePrevious = () => {
    const current = parseYearMonth(value);
    if (!current || !oldestMonth) {
      return;
    }
    const previousMonth = format(startOfMonth(subMonths(current, 1)), "yyyy-MM");
    if (previousMonth < oldestMonth) {
      return;
    }
    onChange(previousMonth);
  };

  const handleNext = () => {
    const current = parseYearMonth(value);
    if (!current) {
      return;
    }
    const nextMonthStr = format(startOfMonth(addMonths(current, 1)), "yyyy-MM");
    if (nextMonthStr <= currentMonth) {
      onChange(nextMonthStr);
    }
  };

  const displayValue = value ? budgetMonthLabel(value) : "";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handlePrevious}
        disabled={disabled || value <= oldestMonth}
      >
        ←
      </Button>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-[180px]">
          <SelectValue>{displayValue}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {months.map((month) => (
            <SelectItem key={month} value={month}>
              {budgetMonthLabel(month)}
              {month === currentMonth && " (Current)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleNext}
        disabled={disabled || isCurrentMonth}
      >
        →
      </Button>
    </div>
  );
};

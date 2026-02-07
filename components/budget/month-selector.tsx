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

interface MonthSelectorProps {
  value: string; // YYYY-MM format
  onChange: (month: string) => void;
  disabled?: boolean;
}

export const MonthSelector = ({ value, onChange, disabled }: MonthSelectorProps) => {
  const currentMonth = format(new Date(), "yyyy-MM");
  const isCurrentMonth = value === currentMonth;

  // Generate list of months (current month and 11 previous months)
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const month = subMonths(now, i);
    months.push(format(startOfMonth(month), "yyyy-MM"));
  }

  const handlePrevious = () => {
    const current = new Date(value + "-01");
    const previous = subMonths(current, 1);
    onChange(format(startOfMonth(previous), "yyyy-MM"));
  };

  const handleNext = () => {
    const current = new Date(value + "-01");
    const next = addMonths(current, 1);
    const nextMonthStr = format(startOfMonth(next), "yyyy-MM");
    // Don't allow future months
    if (nextMonthStr <= currentMonth) {
      onChange(nextMonthStr);
    }
  };

  const displayValue = value ? format(new Date(value + "-01"), "MMMM yyyy") : "";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handlePrevious}
        disabled={disabled}
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
              {format(new Date(month + "-01"), "MMMM yyyy")}
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

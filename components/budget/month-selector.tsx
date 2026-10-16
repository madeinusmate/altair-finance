"use client";

import { useState } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { budgetMonthLabel } from "@/lib/budget/resolve-month";
import { segmentedTriggerClassName } from "@/lib/ui/segmented";
import { cn } from "@/lib/utils";

interface MonthSelectorProps {
  value: string;
  onChange: (month: string) => void;
  disabled?: boolean;
  className?: string;
}

export const MonthSelector = ({ value, onChange, disabled, className }: MonthSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const currentMonth = format(new Date(), "yyyy-MM");
  const months: string[] = [];
  const now = new Date();

  for (let i = 0; i < 12; i++) {
    months.push(format(startOfMonth(subMonths(now, i)), "yyyy-MM"));
  }

  const displayValue = value ? budgetMonthLabel(value) : "Month";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(segmentedTriggerClassName, className)}
        >
          <CalendarIcon aria-hidden="true" />
          <span className="sm:hidden">{value ? budgetMonthLabel(value, "MMM yyyy") : "Month"}</span>
          <span className="hidden sm:inline">{displayValue}</span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end" collisionPadding={16}>
        <div className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto overscroll-contain">
          {months.map((month) => (
            <Button
              key={month}
              type="button"
              variant={month === value ? "default" : "ghost"}
              size="sm"
              className="justify-start"
              onClick={() => {
                onChange(month);
                setIsOpen(false);
              }}
            >
              {budgetMonthLabel(month)}
              {month === currentMonth ? " (Current)" : ""}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

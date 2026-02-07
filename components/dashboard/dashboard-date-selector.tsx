"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { subMonths, startOfMonth, endOfMonth, endOfDay, format, startOfDay } from "date-fns";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";

export type DashboardDateRange = {
  startDate: Date;
  endDate: Date;
};

interface DashboardDateSelectorProps {
  value: DashboardDateRange;
  onChange: (range: DashboardDateRange) => void;
  className?: string;
}

export const DashboardDateSelector = ({ value, onChange, className }: DashboardDateSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Sync custom inputs when value changes externally
  const customStart = format(value.startDate, "yyyy-MM-dd");
  const customEnd = format(value.endDate, "yyyy-MM-dd");

  const handlePreset = (months: number | null) => {
    const now = new Date();
    const endDate = endOfDay(now);
    // For "Last N months", we want exactly N months including the current month
    // Example: "Last 3 months" = current month (Feb) + 2 previous months (Jan, Dec)
    // To get the start: go back (N-1) full months from the start of the current month
    if (months) {
      // Get start of current month in local timezone, then subtract (months-1) months
      // Use startOfMonth which handles timezone correctly
      const currentMonthStart = startOfMonth(now);
      const startDate = subMonths(currentMonthStart, months - 1);
      // Ensure startDate is at the beginning of the day in local timezone
      const normalizedStartDate = startOfDay(startDate);
      onChange({ startDate: normalizedStartDate, endDate });
    } else {
      onChange({ startDate: new Date(2015, 3, 1), endDate });
    }
    setIsOpen(false);
  };

  const handleCustomApply = (start: string, end: string) => {
    const startDate = startOfDay(new Date(start));
    const endDate = endOfDay(new Date(end));
    onChange({ startDate, endDate });
    setIsOpen(false);
  };
  
  const [localCustomStart, setLocalCustomStart] = useState(customStart);
  const [localCustomEnd, setLocalCustomEnd] = useState(customEnd);
  
  // Update local state when popover opens
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setLocalCustomStart(customStart);
      setLocalCustomEnd(customEnd);
    }
  };

  const isPresetActive = (months: number | null) => {
    const now = new Date();
    const endDate = endOfDay(now);
    // For "Last N months", we want exactly N months including the current month
    let startDate: Date;
    if (months) {
      const currentMonthStart = startOfMonth(now);
      startDate = startOfDay(subMonths(currentMonthStart, months - 1));
    } else {
      startDate = new Date(2015, 3, 1);
    }
    return (
      format(value.startDate, "yyyy-MM-dd") === format(startDate, "yyyy-MM-dd") &&
      format(value.endDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")
    );
  };

  const getDisplayText = () => {
    if (isPresetActive(1)) return "Current Month";
    if (isPresetActive(3)) return "Last 3 months";
    if (isPresetActive(6)) return "Last 6 months";
    if (isPresetActive(12)) return "Last 12 months";
    if (isPresetActive(null)) return "All time";
    return `${format(value.startDate, "MMM d")} - ${format(value.endDate, "MMM d")}`;
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {getDisplayText()}
          <ChevronDownIcon className="ml-2 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Quick Selection</Label>
            <div className="grid grid-cols-1 gap-1">             
              <Button
                variant={isPresetActive(3) ? "default" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => handlePreset(3)}
              >
                Last 3 months
              </Button>
              <Button
                variant={isPresetActive(6) ? "default" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => handlePreset(6)}
              >
                Last 6 months
              </Button>
              <Button
                variant={isPresetActive(12) ? "default" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => handlePreset(12)}
              >
                Last 12 months
              </Button>
              <Button
                variant={isPresetActive(null) ? "default" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => handlePreset(null)}
              >
                All time
              </Button>
            </div>
          </div>
          <div className="border-t pt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="start-date" className="text-xs font-medium text-muted-foreground">Custom Range</Label>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="start-date" className="text-xs">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={localCustomStart}
                    onChange={(e) => setLocalCustomStart(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="end-date" className="text-xs">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={localCustomEnd}
                    onChange={(e) => setLocalCustomEnd(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => handleCustomApply(localCustomStart, localCustomEnd)}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

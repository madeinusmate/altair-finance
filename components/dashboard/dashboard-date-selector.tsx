"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { subMonths, startOfMonth, endOfMonth, endOfDay, format, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";

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
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  
  // Sync custom inputs when value changes externally
  const customStart = format(value.startDate, "yyyy-MM-dd");
  const customEnd = format(value.endDate, "yyyy-MM-dd");

  const handlePreset = (months: number | null) => {
    const endDate = endOfDay(new Date());
    const startDate = months ? startOfMonth(subMonths(endDate, months - 1)) : new Date(2015, 3, 1);
    onChange({ startDate, endDate });
  };

  const handleCustomApply = (start: string, end: string) => {
    const startDate = startOfDay(new Date(start));
    const endDate = endOfDay(new Date(end));
    onChange({ startDate, endDate });
    setIsCustomOpen(false);
  };
  
  const [localCustomStart, setLocalCustomStart] = useState(customStart);
  const [localCustomEnd, setLocalCustomEnd] = useState(customEnd);
  
  // Update local state when popover opens
  const handleOpenChange = (open: boolean) => {
    setIsCustomOpen(open);
    if (open) {
      setLocalCustomStart(customStart);
      setLocalCustomEnd(customEnd);
    }
  };

  const isPresetActive = (months: number | null) => {
    const endDate = endOfDay(new Date());
    const startDate = months ? startOfMonth(subMonths(endDate, months - 1)) : new Date(2015, 3, 1);
    return (
      format(value.startDate, "yyyy-MM-dd") === format(startDate, "yyyy-MM-dd") &&
      format(value.endDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")
    );
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className || ""}`}>
      <Button
        variant={isPresetActive(1) ? "default" : "outline"}
        size="sm"
        onClick={() => handlePreset(1)}
      >
        Current Month
      </Button>
      <Button
        variant={isPresetActive(3) ? "default" : "outline"}
        size="sm"
        onClick={() => handlePreset(3)}
      >
        Last 3 months
      </Button>
      <Button
        variant={isPresetActive(6) ? "default" : "outline"}
        size="sm"
        onClick={() => handlePreset(6)}
      >
        Last 6 months
      </Button>
      <Button
        variant={isPresetActive(12) ? "default" : "outline"}
        size="sm"
        onClick={() => handlePreset(12)}
      >
        Last 12 months
      </Button>
      <Button
        variant={isPresetActive(null) ? "default" : "outline"}
        size="sm"
        onClick={() => handlePreset(null)}
      >
        All time
      </Button>
      <Popover open={isCustomOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarIcon className="mr-2 h-4 w-4" />
            Custom range
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={localCustomStart}
                onChange={(e) => setLocalCustomStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={localCustomEnd}
                onChange={(e) => setLocalCustomEnd(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsCustomOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => handleCustomApply(localCustomStart, localCustomEnd)}>
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

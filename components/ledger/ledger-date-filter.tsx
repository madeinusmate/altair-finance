"use client";

import { useId, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  customLedgerRange,
  ledgerPresetRange,
  parseLedgerDay,
  type LedgerDateFilter as LedgerDateFilterValue,
  type LedgerDatePreset,
} from "@/lib/ledger/date-filter";

const PRESET_OPTIONS: Array<{ id: LedgerDatePreset | "all"; label: string }> = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "last-3-months", label: "Last 3 months" },
  { id: "last-12-months", label: "Last 12 months" },
  { id: "all", label: "All time" },
];

const dayKey = (date: Date): string => format(date, "yyyy-MM-dd");

const matchingPreset = (
  value: LedgerDateFilterValue,
  now: Date,
): LedgerDatePreset | "all" | null => {
  if (value.kind === "all") {
    return "all";
  }

  const start = dayKey(value.startDate);
  const end = dayKey(value.endDate);
  for (const option of PRESET_OPTIONS) {
    if (option.id === "all") {
      continue;
    }
    const range = ledgerPresetRange(option.id, now);
    if (dayKey(range.startDate) === start && dayKey(range.endDate) === end) {
      return option.id;
    }
  }

  return null;
};

const filterLabel = (value: LedgerDateFilterValue, now: Date): string => {
  const preset = matchingPreset(value, now);
  const match = PRESET_OPTIONS.find((option) => option.id === preset);
  if (match) {
    return match.label;
  }

  if (value.kind === "range") {
    const sameYear = value.startDate.getFullYear() === value.endDate.getFullYear();
    const pattern = sameYear ? "MMM d" : "MMM d, yyyy";
    return `${format(value.startDate, pattern)} - ${format(value.endDate, pattern)}`;
  }

  return "All time";
};

interface LedgerDateFilterProps {
  value: LedgerDateFilterValue;
  onChange: (value: LedgerDateFilterValue) => void;
  className?: string;
}

export const LedgerDateFilter = ({ value, onChange, className }: LedgerDateFilterProps) => {
  const startId = useId();
  const endId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const now = new Date();
  const label = filterLabel(value, now);
  const activePreset = matchingPreset(value, now);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      return;
    }

    setRangeError(null);
    if (value.kind === "range") {
      setCustomStart(dayKey(value.startDate));
      setCustomEnd(dayKey(value.endDate));
      return;
    }

    setCustomStart("");
    setCustomEnd("");
  };

  const handlePreset = (preset: LedgerDatePreset | "all") => {
    if (preset === "all") {
      onChange({ kind: "all" });
    } else {
      const range = ledgerPresetRange(preset);
      onChange({ kind: "range", startDate: range.startDate, endDate: range.endDate });
    }
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    const startDate = parseLedgerDay(customStart);
    const endDate = parseLedgerDay(customEnd);
    if (startDate && endDate && customEnd < customStart) {
      setRangeError("End date must be on or after the start date.");
      return;
    }

    const range = customLedgerRange(customStart, customEnd);
    if (!range) {
      setRangeError("Choose a start and end date.");
      return;
    }

    onChange({ kind: "range", startDate: range.startDate, endDate: range.endDate });
    setRangeError(null);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Date: ${label}`}
          title={label}
          className={cn(
            "h-9 w-full justify-between rounded-md border border-input bg-transparent px-3 font-normal shadow-xs sm:w-auto sm:max-w-64",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarIcon className="size-4 shrink-0 opacity-70" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Quick Selection</Label>
            <div className="grid grid-cols-1 gap-1">
              {PRESET_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={activePreset === option.id ? "default" : "ghost"}
                  size="sm"
                  className="justify-start"
                  onClick={() => handlePreset(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Custom Range</Label>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor={startId} className="text-xs">
                    Start Date
                  </Label>
                  <Input
                    id={startId}
                    type="date"
                    value={customStart}
                    onChange={(event) => {
                      setCustomStart(event.target.value);
                      setRangeError(null);
                    }}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={endId} className="text-xs">
                    End Date
                  </Label>
                  <Input
                    id={endId}
                    type="date"
                    value={customEnd}
                    onChange={(event) => {
                      setCustomEnd(event.target.value);
                      setRangeError(null);
                    }}
                    aria-invalid={rangeError ? true : undefined}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
            {rangeError ? (
              <p className="text-xs text-destructive" role="alert">
                {rangeError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleCustomApply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

"use client";

import { cn } from "@/lib/utils";

interface BudgetBarProps {
  percentage: number;
}

const barColor = (percentage: number): string => {
  if (percentage > 100) {
    return "bg-foreground";
  }
  if (percentage >= 75) {
    return "bg-foreground/70";
  }
  return "bg-foreground/40";
};

export const BudgetBar = ({ percentage }: BudgetBarProps) => {
  const scale = Math.min(Math.max(percentage, 0), 100) / 100;

  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full w-full origin-left transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          barColor(percentage)
        )}
        style={{ transform: `scaleX(${scale})` }}
      />
    </div>
  );
};

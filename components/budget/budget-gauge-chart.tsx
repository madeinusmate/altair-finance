"use client";

import { useEffect, useState } from "react";
import { RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { BudgetPace } from "@/lib/budget/resolve-month";
import { currencyFractionDigits } from "@/lib/currencies";

interface BudgetGaugeChartProps {
  remaining: number;
  budget: number;
  spent: number;
  unbudgetedSpent: number;
  percentageUsed: number;
  currency: string;
  pace?: BudgetPace | null;
}

const chartConfig = {
  spent: {
    label: "Spent",
    color: "var(--chart-1)",
  },
  remaining: {
    label: "Remaining",
    color: "var(--muted)",
  },
} satisfies ChartConfig;

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: currencyFractionDigits(currency),
    maximumFractionDigits: currencyFractionDigits(currency),
  }).format(amount);
};

const paceLabel = (pace: BudgetPace): string => (pace === "ahead" ? "Ahead" : "On track");

export const BudgetGaugeChart = ({
  remaining,
  budget,
  spent,
  unbudgetedSpent,
  percentageUsed,
  currency,
  pace,
}: BudgetGaugeChartProps) => {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setAnimate(!media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const displayPercentage = Math.min(Math.max(percentageUsed, 0), 100);
  const chartData = [
    {
      spent: displayPercentage,
      remaining: Math.max(0, 100 - displayPercentage),
    },
  ];
  const remainingLabel = formatCurrency(remaining, currency);
  const budgetLabel = formatCurrency(budget, currency);
  const caption = [
    `Spent ${formatCurrency(spent, currency)}`,
    pace ? paceLabel(pace) : null,
    unbudgetedSpent !== 0 ? `Unbudgeted ${formatCurrency(unbudgetedSpent, currency)}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="relative">
        <div
          role="img"
          aria-label={`Left to spend ${remainingLabel} of ${budgetLabel}. ${caption}`}
          className="aspect-square"
        >
          <ChartContainer config={chartConfig} className="aspect-square h-full w-full">
            <RadialBarChart
              data={chartData}
              startAngle={90}
              endAngle={-270}
              cx="50%"
              cy="50%"
              innerRadius="76%"
              outerRadius="100%"
            >
              <RadialBar
                dataKey="spent"
                fill="var(--color-spent)"
                stackId="budget"
                cornerRadius={10}
                isAnimationActive={animate}
                className="stroke-transparent"
              />
              <RadialBar
                dataKey="remaining"
                fill="var(--color-remaining)"
                stackId="budget"
                cornerRadius={10}
                isAnimationActive={animate}
                className="stroke-transparent"
              />
            </RadialBarChart>
          </ChartContainer>
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[58%] text-center">
            <p className="text-sm text-muted-foreground">Left to spend</p>
            <p className="mt-1 text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
              {remainingLabel}
            </p>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">of {budgetLabel}</p>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-pretty text-sm text-muted-foreground">{caption}</p>
    </div>
  );
};

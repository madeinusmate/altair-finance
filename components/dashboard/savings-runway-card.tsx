"use client";

import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseLocalDate } from "@/lib/insights/range";

export interface SavingsRunwayData {
  currency: string;
  range: { startDate: string; endDate: string };
  income: number;
  expenses: number;
  kept: number;
  savingsRate: number | null;
  signedInvestment: number;
  leftInCash: number;
  liquid: number;
  typicalMonthlyExpenses: number | null;
  typicalMonthCount: number;
  runwayMonths: number | null;
  hasUnsupportedCurrencies: boolean;
}

interface SavingsRunwayCardProps {
  data: SavingsRunwayData | null;
  isLoading: boolean;
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const runwayBasis = (count: number): string => {
  if (count <= 0) {
    return "Runway uses full months before this one, not the selected dates.";
  }
  const noun = count === 1 ? "month" : "months";
  return `Based on the last ${count} full ${noun}, not the selected dates.`;
};

const runwayHeadline = (data: SavingsRunwayData): string | null => {
  if (data.typicalMonthCount === 0 || data.typicalMonthlyExpenses === null) {
    return null;
  }
  if (data.runwayMonths === null) {
    return "No recent expenses";
  }
  return `${data.runwayMonths.toFixed(1)} months of expenses in cash`;
};

const rangeLabel = (data: SavingsRunwayData): string => {
  const start = parseLocalDate(data.range.startDate);
  const end = parseLocalDate(data.range.endDate);
  if (!start || !end) {
    return `${data.range.startDate} – ${data.range.endDate}`;
  }
  return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
};

export const SavingsRunwayCard = ({ data, isLoading }: SavingsRunwayCardProps) => {
  if (isLoading) {
    return (
      <Card className="h-full border-transparent shadow-none">
        <CardContent className="px-4 py-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-28" />
          <Skeleton className="mt-3 h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="h-full border-transparent shadow-none">
        <CardContent className="px-4 py-4">
          <p className="text-[13px] text-muted-foreground">Savings rate</p>
          <p className="mt-1 text-sm text-muted-foreground">Savings rate unavailable</p>
        </CardContent>
      </Card>
    );
  }

  const headline = runwayHeadline(data);
  const periodLabel = rangeLabel(data);

  return (
    <Card className="h-full border-transparent shadow-none">
      <CardContent className="px-4 py-4">
        <p className="text-[13px] text-muted-foreground">Savings rate</p>
        {data.savingsRate === null ? (
          <p className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.03em]">No income in this period</p>
        ) : (
          <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
            {(data.savingsRate * 100).toFixed(1)}%
          </p>
        )}
        {data.savingsRate === null ? (
          <p className="mt-1 text-sm tabular-nums">{formatCurrency(data.kept, data.currency)} kept</p>
        ) : null}
        <p className="mt-1 text-[13px] text-muted-foreground">{periodLabel}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[13px] text-muted-foreground">Invested</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">
              {formatCurrency(data.signedInvestment, data.currency)}
            </p>
          </div>
          <div>
            <p className="text-[13px] text-muted-foreground">Left in cash</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">{formatCurrency(data.leftInCash, data.currency)}</p>
          </div>
        </div>
        <div className="mt-3 border-t border-border/60 pt-3">
          {headline ? <p className="text-sm font-medium tabular-nums">{headline}</p> : null}
          <p className="mt-1 text-[13px] text-muted-foreground">
            {formatCurrency(data.liquid, data.currency)} liquid today. {runwayBasis(data.typicalMonthCount)}
          </p>
          {data.hasUnsupportedCurrencies ? (
            <p className="mt-1 text-[13px] text-muted-foreground">Unsupported currencies were left out.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

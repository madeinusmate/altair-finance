"use client";

import { Card, CardContent } from "@/components/ui/card";
import { currencyFractionDigits } from "@/lib/currencies";
import { Skeleton } from "@/components/ui/skeleton";

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
    minimumFractionDigits: currencyFractionDigits(currency),
    maximumFractionDigits: currencyFractionDigits(currency),
  }).format(amount);
};

export const SavingsRunwayCard = ({ data, isLoading }: SavingsRunwayCardProps) => {
  if (isLoading) {
    return (
      <Card className="h-full border-transparent py-0 shadow-none">
        <CardContent className="flex h-full flex-col px-4 py-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-28" />
          <Skeleton className="mt-2 h-4 w-40" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="h-full border-transparent py-0 shadow-none">
        <CardContent className="flex h-full flex-col px-4 py-4">
          <p className="text-[13px] text-muted-foreground">Savings rate</p>
          <p className="mt-1 text-sm text-muted-foreground">Savings rate unavailable</p>
        </CardContent>
      </Card>
    );
  }

  const rate = data.savingsRate === null ? null : `${(data.savingsRate * 100).toFixed(1)}%`;
  const detail =
    rate === null
      ? data.kept === 0
        ? null
        : `${formatCurrency(data.kept, data.currency)} kept`
      : `${formatCurrency(data.kept, data.currency)} kept of ${formatCurrency(data.income, data.currency)}`;

  return (
    <Card className="h-full border-transparent py-0 shadow-none">
      <CardContent className="flex h-full flex-col px-4 py-4">
        <p className="text-[13px] text-muted-foreground">Savings rate</p>
        <p
          className={
            rate === null
              ? "mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] text-muted-foreground"
              : "mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums"
          }
        >
          {rate ?? "No income"}
        </p>
        {detail ? <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">{detail}</p> : null}
        {data.hasUnsupportedCurrencies ? (
          <p className="mt-1 text-[13px] text-muted-foreground">Unsupported currencies were left out.</p>
        ) : null}
      </CardContent>
    </Card>
  );
};

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetBar } from "@/components/budget/budget-bar";

interface BudgetSummaryCardProps {
  overallBudget: number;
  overallSpent: number;
  overallRemaining: number;
  overallPercentageUsed: number;
  currency: string;
  isLoading?: boolean;
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const BudgetSummaryCard = ({
  overallBudget,
  overallSpent,
  overallRemaining,
  overallPercentageUsed,
  currency,
  isLoading,
}: BudgetSummaryCardProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Left to spend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-8 w-32 bg-muted animate-pulse rounded" />
            <div className="h-4 w-full bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">Left to spend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-[40px] font-medium leading-none tracking-[-0.03em] tabular-nums">
            {formatCurrency(overallRemaining, currency)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Remaining this month</p>
        </div>

        <BudgetBar percentage={overallPercentageUsed} />

        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Spent</span>
            <span className="font-medium tabular-nums">
              {formatCurrency(overallSpent, currency)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-medium tabular-nums">{formatCurrency(overallBudget, currency)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

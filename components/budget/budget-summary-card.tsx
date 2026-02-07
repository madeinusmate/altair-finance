"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

const getStatusColor = (percentage: number): string => {
  if (percentage > 100) {
    return "text-red-600";
  } else if (percentage >= 75) {
    return "text-yellow-600";
  }
  return "text-green-600";
};

const getProgressColor = (percentage: number): string => {
  if (percentage > 100) {
    return "bg-red-600";
  } else if (percentage >= 75) {
    return "bg-yellow-600";
  }
  return "bg-green-600";
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
          <CardTitle>Overall Budget</CardTitle>
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

  const statusColor = getStatusColor(overallPercentageUsed);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Overall Budget</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className={cn("text-2xl font-bold", statusColor)}>
            {formatCurrency(overallBudget, currency)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total monthly budget</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Spent</span>
            <span className="font-medium">{formatCurrency(overallSpent, currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Remaining</span>
            <span className={cn("font-medium", overallRemaining < 0 ? "text-red-600" : "")}>
              {formatCurrency(overallRemaining, currency)}
            </span>
          </div>
          
        </div>
      </CardContent>
    </Card>
  );
};

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";

interface BudgetTileProps {
  currency: string;
}

interface BudgetSummary {
  overallBudget: number;
  overallSpent: number;
  overallRemaining: number;
  overallPercentageUsed: number;
  currency: string;
  status: "under" | "approaching" | "over";
  month: string;
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const getStatusHint = (status: "under" | "approaching" | "over", percentage: number): string => {
  if (status === "over") {
    return `${Math.abs(percentage - 100).toFixed(0)}% over`;
  }
  return `${percentage.toFixed(0)}% used`;
};

export const BudgetTile = ({ currency }: BudgetTileProps) => {
  const router = useRouter();
  const [data, setData] = useState<BudgetSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await apiClient.get<BudgetSummary>(`/api/dashboard/budget?currency=${currency}`);
        setData(result);
      } catch (error) {
        console.error("Error fetching budget summary:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [currency]);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Budget</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-24" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.overallBudget === 0) {
    return (
      <Card className="h-full cursor-pointer transition-colors hover:bg-muted" onClick={() => router.push("/budget")}>
        <CardContent className="py-5">
          <p className="text-[13px] text-muted-foreground">Left to spend</p>
          <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] text-muted-foreground">Set a budget</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full cursor-pointer transition-colors hover:bg-muted" onClick={() => router.push("/budget")}>
      <CardContent className="py-5">
        <p className="text-[13px] text-muted-foreground">Left to spend</p>
        <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
          {formatCurrency(data.overallRemaining, data.currency)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{getStatusHint(data.status, data.overallPercentageUsed)}</p>
      </CardContent>
    </Card>
  );
};

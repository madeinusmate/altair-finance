"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Target } from "lucide-react";

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

const getStatusColor = (status: "under" | "approaching" | "over"): string => {
  switch (status) {
    case "over":
      return "text-red-600 border-red-200 dark:border-red-900";
    case "approaching":
      return "text-yellow-600 border-yellow-200 dark:border-yellow-900";
    default:
      return "text-green-600 border-green-200 dark:border-green-900";
  }
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
      <Card>
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
      <Card
        className="cursor-pointer hover:bg-accent transition-colors"
        onClick={() => router.push("/budget")}
      >
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Budget
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-muted-foreground">No budget set</div>
          <p className="text-xs text-muted-foreground mt-1">Click to create</p>
        </CardContent>
      </Card>
    );
  }

  const statusColor = getStatusColor(data.status);

  return (
    <Card
      className={cn(
        "cursor-pointer hover:bg-accent transition-colors",
        statusColor.includes("border") && `border-2 ${statusColor.split(" ")[1]}`
      )}
      onClick={() => router.push("/budget")}
    >
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4" />
          Budget
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", statusColor.split(" ")[0])}>
          {formatCurrency(data.overallRemaining, data.currency)}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {data.overallPercentageUsed.toFixed(1)}% used
        </p>
        {data.status === "over" && (
          <p className="text-xs text-red-600 mt-1 font-medium">
            {Math.abs(data.overallPercentageUsed - 100).toFixed(1)}% over budget
          </p>
        )}
      </CardContent>
    </Card>
  );
};

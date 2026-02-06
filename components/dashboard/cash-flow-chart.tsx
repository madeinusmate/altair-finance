"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip, Cell } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { type DashboardDateRange } from "./dashboard-date-selector";

interface CashFlowData {
  income: Array<{ category: string; amount: number }>;
  expenses: Array<{ category: string; amount: number }>;
  currency: string;
}

interface CashFlowChartProps {
  dateRange: DashboardDateRange;
  isLoading?: boolean;
  data?: CashFlowData;
}

const chartConfig = {
  income: {
    label: "Income",
    color: "hsl(142, 76%, 36%)", // green-600
  },
  expenses: {
    label: "Expenses",
    color: "hsl(0, 84%, 60%)", // red-500
  },
} satisfies ChartConfig;

// Format currency helper
const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const CashFlowChart = ({
  dateRange,
  isLoading,
  data,
}: CashFlowChartProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || (data.income.length === 0 && data.expenses.length === 0)) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle>Cash Flow Visualization</CardTitle>
            <CardDescription>Income sources and expense categories</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No cash flow data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare data for visualization
  // Show top income sources and expense categories
  const topIncome = data.income.slice(0, 5);
  const topExpenses = data.expenses.slice(0, 5);

  // Create a combined view showing income sources on left, expenses on right
  const maxLength = Math.max(topIncome.length, topExpenses.length);
  const chartData = Array.from({ length: maxLength }, (_, i) => {
    const incomeItem = topIncome[i];
    const expenseItem = topExpenses[i];
    return {
      name: `Item ${i + 1}`,
      incomeSource: incomeItem?.category || "",
      incomeAmount: incomeItem?.amount || 0,
      expenseCategory: expenseItem?.category || "",
      expenseAmount: expenseItem?.amount || 0,
    };
  });

  // Alternative: Show income and expenses side by side
  const sideBySideData = [
    ...topIncome.map((item) => ({
      category: item.category,
      type: "Income",
      amount: item.amount,
    })),
    ...topExpenses.map((item) => ({
      category: item.category,
      type: "Expenses",
      amount: -item.amount, // Negative for expenses
    })),
  ].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Cash Flow Visualization</CardTitle>
          <CardDescription>Income sources and expense categories</CardDescription>
        </div>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-[hsl(142,76%,36%)]" />
              <span className="text-muted-foreground">Salary</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-[hsl(142,76%,36%)] opacity-70" />
              <span className="text-muted-foreground">Freelance</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-[hsl(142,76%,36%)] opacity-50" />
              <span className="text-muted-foreground">Savings</span>
            </div>
          </div>

          {/* Chart */}
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sideBySideData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  type="number"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => formatCurrency(Math.abs(value), data.currency)}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  width={120}
                />
                <Tooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, item) => {
                        const numericValue = typeof value === "number" ? value : Number(value);
                        const payload = item?.payload as { type?: string };
                        return formatCurrency(Math.abs(numericValue), data.currency);
                      }}
                      labelFormatter={(label) => label}
                    />
                  }
                />
                <Bar
                  dataKey="amount"
                  radius={[0, 4, 4, 0]}
                >
                  {sideBySideData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.type === "Income" ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>

          {/* Summary */}
          <div className="flex items-center justify-between text-sm border-t pt-4">
            <div>
              <span className="text-muted-foreground">Total Income: </span>
              <span className="font-medium text-green-600">
                {formatCurrency(
                  data.income.reduce((sum, item) => sum + item.amount, 0),
                  data.currency
                )}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Expenses: </span>
              <span className="font-medium text-red-600">
                {formatCurrency(
                  data.expenses.reduce((sum, item) => sum + item.amount, 0),
                  data.currency
                )}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

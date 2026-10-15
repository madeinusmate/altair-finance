"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip, Cell } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { type DashboardDateRange } from "./dashboard-date-selector";
import { chartCobalt, chartInk, axisTick, chartGrid } from "@/components/charts/palette";

interface CashFlowSlice {
  categoryId: number;
  category: string;
  amount: number;
}

interface CashFlowData {
  income: CashFlowSlice[];
  expenses: CashFlowSlice[];
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
    color: chartCobalt,
  },
  expenses: {
    label: "Expenses",
    color: chartInk,
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
      incomeCategoryId: incomeItem?.categoryId,
      incomeSource: incomeItem?.category || "",
      incomeAmount: incomeItem?.amount || 0,
      expenseCategoryId: expenseItem?.categoryId,
      expenseCategory: expenseItem?.category || "",
      expenseAmount: expenseItem?.amount || 0,
    };
  });

  const sideBySideData = [
    ...topIncome.map((item) => ({
      categoryId: item.categoryId,
      category: item.category,
      type: "Income",
      amount: item.amount,
    })),
    ...topExpenses.map((item) => ({
      categoryId: item.categoryId,
      category: item.category,
      type: "Expenses",
      amount: -item.amount,
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
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: chartCobalt }} />
              <span className="text-muted-foreground">Income</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: chartInk }} />
              <span className="text-muted-foreground">Expenses</span>
            </div>
          </div>

          {/* Chart */}
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sideBySideData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid vertical={false} stroke={chartGrid} />
                <XAxis
                  type="number"
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatCurrency(Math.abs(value), data.currency)}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
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
                  {sideBySideData.map((entry) => (
                    <Cell
                      key={`cell-${entry.type}-${entry.categoryId}`}
                      fill={entry.type === "Income" ? chartCobalt : chartInk}
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
              <span className="font-medium text-foreground">
                {formatCurrency(
                  data.income.reduce((sum, item) => sum + item.amount, 0),
                  data.currency
                )}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Expenses: </span>
              <span className="font-medium text-foreground">
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

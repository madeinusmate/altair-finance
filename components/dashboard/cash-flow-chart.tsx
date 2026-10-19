"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { currencyFractionDigits } from "@/lib/currencies";
import { type DashboardDateRange } from "./dashboard-date-selector";

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
    color: "var(--chart-1)",
  },
  expenses: {
    label: "Expenses",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

// Format currency helper
const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: currencyFractionDigits(currency),
    maximumFractionDigits: currencyFractionDigits(currency),
  }).format(amount);
};

export const CashFlowChart = ({
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
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
            <BarChart accessibilityLayer data={sideBySideData} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => formatCurrency(Math.abs(value), data.currency)}
              />
              <YAxis
                type="category"
                dataKey="category"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={120}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dashed"
                    formatter={(value) => {
                      const numericValue = typeof value === "number" ? value : Number(value);
                      return formatCurrency(Math.abs(numericValue), data.currency);
                    }}
                    labelFormatter={(label) => label}
                  />
                }
              />
              <ChartLegend
                content={<ChartLegendContent />}
                payload={[
                  { value: "income", type: "square", color: "var(--color-income)", dataKey: "income" },
                  { value: "expenses", type: "square", color: "var(--color-expenses)", dataKey: "expenses" },
                ]}
              />
              <Bar dataKey="amount" radius={4}>
                {sideBySideData.map((entry) => (
                  <Cell
                    key={`cell-${entry.type}-${entry.categoryId}`}
                    fill={entry.type === "Income" ? "var(--color-income)" : "var(--color-expenses)"}
                  />
                ))}
              </Bar>
            </BarChart>
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

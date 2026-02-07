"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { type DashboardDateRange } from "./dashboard-date-selector";

// Format currency helper
const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

interface MonthlyIncomeExpenses {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  currency: string;
}

interface MonthlyIncomeExpensesChartProps {
  dateRange: DashboardDateRange;
  currency: string;
  isLoading?: boolean;
  data?: MonthlyIncomeExpenses[];
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

export const MonthlyIncomeExpensesChart = ({
  dateRange,
  currency,
  isLoading,
  data,
}: MonthlyIncomeExpensesChartProps) => {
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

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly Income & Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Income & Expenses</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value) => formatCurrency(value, currency)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.monthLabel ? payload[0].payload.monthLabel : ""
                    }
                    formatter={(value, name) => {
                      const numericValue = typeof value === "number" ? value : Number(value);
                      const displayValue = formatCurrency(numericValue, currency);
                      const label = name === "expenses" ? "Expenses" : "Income";
                      return (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono text-foreground">{displayValue}</span>
                        </div>
                      );
                    }}
                  />
                }
              />

              <Bar
                dataKey="income"
                fill="hsl(142, 76%, 36%)"
                radius={[4, 4, 0, 0]}
                name="Income"
              />
              <Bar
                dataKey="expenses"
                fill="hsl(0, 84%, 60%)"
                radius={[4, 4, 0, 0]}
                name="Expenses"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
        {/* Custom Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "hsl(142, 76%, 36%)" }} />
            <span className="text-sm text-muted-foreground">Income</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "hsl(0, 84%, 60%)" }} />
            <span className="text-sm text-muted-foreground">Expenses</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { type DashboardDateRange } from "./dashboard-date-selector";
import { axisTick, chartCobalt, chartGrid, chartInk } from "@/components/charts/palette";

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
    color: chartCobalt,
  },
  expenses: {
    label: "Expenses",
    color: chartInk,
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
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={chartGrid} />
              <XAxis
                dataKey="monthLabel"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={72}
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
                      // Check case-insensitively for expenses (name could be "expenses", "Expenses", or dataKey)
                      const isExpenses = typeof name === "string" && name.toLowerCase() === "expenses";
                      const label = isExpenses ? "Expenses" : "Income";
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
                fill={chartCobalt}
                radius={[8, 8, 0, 0]}
                name="Income"
              />
              <Bar
                dataKey="expenses"
                fill={chartInk}
                radius={[8, 8, 0, 0]}
                name="Expenses"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
        {/* Custom Legend */}
        <div className="mt-4 flex items-center justify-center gap-6 border-t border-[#e4e4e7] pt-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: chartCobalt }} />
            <span className="text-sm text-[#717173]">Income</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: chartInk }} />
            <span className="text-sm text-[#717173]">Expenses</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

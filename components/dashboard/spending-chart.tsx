"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
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

interface SpendingCategory {
  category: string;
  amount: number;
  percentage: number;
}

interface SpendingChartProps {
  dateRange: DashboardDateRange;
  currency: string;
  isLoading?: boolean;
  data?: {
    categories: SpendingCategory[];
    total: number;
  };
}

const COLORS = [
  "hsl(142, 76%, 36%)", // green-600
  "hsl(221, 83%, 53%)", // blue-600
  "hsl(262, 83%, 58%)", // purple-600
  "hsl(0, 84%, 60%)", // red-500
  "hsl(38, 92%, 50%)", // amber-500
  "hsl(var(--muted-foreground))", // muted
];

const chartConfig = {
  spending: {
    label: "Spending",
    color: "hsl(142, 76%, 36%)",
  },
} satisfies ChartConfig;

export const SpendingChart = ({
  dateRange,
  currency,
  isLoading,
  data,
}: SpendingChartProps) => {
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

  if (!data || data.categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Net Spending</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No spending data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.categories.map((cat, index) => ({
    name: cat.category,
    spending: cat.amount,
    fill: COLORS[index % COLORS.length],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net Spending</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                type="number"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value) => formatCurrency(value, currency)}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                width={120}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => label}
                    formatter={(value, _, item) => {
                      const numericValue = typeof value === "number" ? value : Number(value);
                      const payload = item?.payload as { name?: string; fill?: string };
                      const category = data.categories.find((cat) => cat.category === payload?.name);
                      const percentage = category?.percentage || 0;
                      return (
                        <div className="flex flex-col gap-1">
                          <span className="font-mono">{formatCurrency(numericValue, currency)}</span>
                          <span className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Bar
                dataKey="spending"
                radius={[0, 4, 4, 0]}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

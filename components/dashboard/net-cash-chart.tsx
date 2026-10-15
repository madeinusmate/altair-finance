"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { axisTick, chartCobalt, chartGrid } from "@/components/charts/palette";

interface MonthlyPoint {
  monthLabel: string;
  income: number;
  expenses: number;
}

interface NetCashChartProps {
  currency: string;
  isLoading?: boolean;
  data?: MonthlyPoint[];
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const chartConfig = {
  net: {
    label: "Net cash",
    color: chartCobalt,
  },
} satisfies ChartConfig;

export const NetCashChart = ({ currency, isLoading, data }: NetCashChartProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const points = (data ?? []).map((point) => ({
    monthLabel: point.monthLabel,
    net: point.income - point.expenses,
  }));

  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Net cash</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[280px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net cash</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="netCashFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartCobalt} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={chartCobalt} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={chartGrid} />
              <XAxis dataKey="monthLabel" tick={axisTick} tickLine={false} axisLine={false} />
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
                    formatter={(value) => formatCurrency(typeof value === "number" ? value : Number(value), currency)}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="net"
                stroke={chartCobalt}
                strokeWidth={2}
                fill="url(#netCashFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

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
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export const NetCashChart = ({ currency, isLoading, data }: NetCashChartProps) => {
  const fillId = useId().replace(/:/g, "");

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
        <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
          <AreaChart accessibilityLayer data={points} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-net)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-net)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={72}
              tickFormatter={(value) => formatCurrency(value, currency)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  formatter={(value) => formatCurrency(typeof value === "number" ? value : Number(value), currency)}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="net"
              stroke="var(--color-net)"
              strokeWidth={2}
              fill={`url(#${fillId})`}
              fillOpacity={0.4}
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

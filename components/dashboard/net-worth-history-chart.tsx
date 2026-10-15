"use client";

import { useId, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
import type { NetWorthHistory } from "@/lib/insights/net-worth-series";

interface NetWorthHistoryChartProps {
  currency: string;
  isLoading?: boolean;
  data?: NetWorthHistory | null;
}

const formatNetWorth = (amount: number, currency: string): string => {
  const decimals = Math.abs(amount) >= 1_000_000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
};

const formatAxis = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: Math.abs(amount) >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(amount) >= 1_000 ? 1 : 0,
  }).format(amount);
};

const chartConfig = {
  assets: {
    label: "Assets",
    color: "var(--chart-2)",
  },
  liabilities: {
    label: "Liabilities",
    color: "var(--chart-4)",
  },
  netWorth: {
    label: "Net worth",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const series = ["liabilities", "assets", "netWorth"] as const;

const ChartShell = ({ children }: { children: ReactNode }) => (
  <Card>
    <CardHeader>
      <CardTitle>Net worth over time</CardTitle>
      <CardDescription>Assets, liabilities, and household net worth</CardDescription>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const emptyMessage = (message: string) => (
  <ChartShell>
    <div className="flex h-[320px] items-center justify-center">
      <p className="max-w-sm text-center text-sm text-muted-foreground">{message}</p>
    </div>
  </ChartShell>
);

export const NetWorthHistoryChart = ({ currency, isLoading, data }: NetWorthHistoryChartProps) => {
  const gradientId = useId().replace(/:/g, "");

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data?.hasUnsupportedCurrencies) {
    return emptyMessage("Net worth history is hidden until every account uses a supported currency.");
  }

  if (!data || data.points.length === 0) {
    return emptyMessage("No data available");
  }

  return (
    <ChartShell>
      <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
        <AreaChart accessibilityLayer data={data.points} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={72}
            tickFormatter={(value) => formatAxis(typeof value === "number" ? value : Number(value), currency)}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="line"
                formatter={(value, name) => {
                  const numericValue = typeof value === "number" ? value : Number(value);
                  return (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">{name}</span>
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {formatNetWorth(numericValue, currency)}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          <defs>
            {series.map((key) => (
              <linearGradient key={key} id={`${gradientId}-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.8} />
                <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
          {series.map((key) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              name={chartConfig[key].label}
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              fill={`url(#${gradientId}-${key})`}
              fillOpacity={key === "netWorth" ? 0.4 : 0.2}
              dot={false}
            />
          ))}
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
    </ChartShell>
  );
};

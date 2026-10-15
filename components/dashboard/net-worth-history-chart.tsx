"use client";

import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { axisTick, chartCobalt, chartCobaltSoft, chartGrid, chartInk } from "@/components/charts/palette";
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
    color: chartCobaltSoft,
  },
  liabilities: {
    label: "Liabilities",
    color: chartInk,
  },
  netWorth: {
    label: "Net worth",
    color: chartCobalt,
  },
} satisfies ChartConfig;

const legend = [
  { key: "assets", label: "Assets", color: chartCobaltSoft },
  { key: "liabilities", label: "Liabilities", color: chartInk },
  { key: "netWorth", label: "Net worth", color: chartCobalt },
] as const;

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
      <ChartContainer config={chartConfig} className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={chartGrid} />
            <XAxis dataKey="monthLabel" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(value) => formatAxis(typeof value === "number" ? value : Number(value), currency)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    const numericValue = typeof value === "number" ? value : Number(value);
                    return (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{name}</span>
                        <span className="font-mono tabular-nums text-foreground">
                          {formatNetWorth(numericValue, currency)}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Line
              type="linear"
              dataKey="assets"
              name="Assets"
              stroke={chartCobaltSoft}
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0, fill: chartCobaltSoft }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="linear"
              dataKey="liabilities"
              name="Liabilities"
              stroke={chartInk}
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0, fill: chartInk }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="linear"
              dataKey="netWorth"
              name="Net worth"
              stroke={chartCobalt}
              strokeWidth={2.5}
              dot={{ r: 2.5, strokeWidth: 0, fill: chartCobalt }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border pt-4">
        {legend.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-sm text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </ChartShell>
  );
};

"use client";

import { useId } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { type DashboardDateRange } from "./dashboard-date-selector";
import { formatCurrencySmart } from "@/lib/chart-data-aggregation";

interface InvestmentDataPoint {
  date: string;
  dateLabel: string;
  value: number;
  netContributions: number;
  pnl: number;
  pnlPercentage: number;
}

interface InvestmentPerformanceData {
  data: InvestmentDataPoint[];
  currentValue: number;
  previousValue: number;
  percentageChange: number;
  currency: string;
}

interface InvestmentAccount {
  id: string;
  name: string;
}

interface InvestmentPerformanceChartProps {
  dateRange: DashboardDateRange;
  currency: string;
  isLoading?: boolean;
  data?: InvestmentPerformanceData;
  accounts?: InvestmentAccount[];
  selectedAccountId?: string;
  onAccountChange?: (accountId: string | undefined) => void;
}

const chartConfig = {
  value: {
    label: "Investment Value",
    color: "var(--chart-1)",
  },
  netContributions: {
    label: "Net Contributions",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

const series = ["netContributions", "value"] as const;

export const InvestmentPerformanceChart = ({
  currency,
  isLoading,
  data,
  accounts = [],
  selectedAccountId,
  onAccountChange,
}: InvestmentPerformanceChartProps) => {
  const gradientId = useId().replace(/:/g, "");
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



  if (!data || data.data.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle>Investment Performance</CardTitle>
            <CardDescription>Track your investment growth</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {accounts.length > 0 && (
              <Select value={selectedAccountId || "all"} onValueChange={onAccountChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No investment data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort data by actual date to ensure chronological order
  const sortedData = [...data.data].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const chartData = sortedData.map((point) => ({
    date: point.date,
    dateLabel: point.dateLabel,
    value: point.value,
    netContributions: point.netContributions ?? 0,
    pnl: point.pnl,
    pnlPercentage: point.pnlPercentage,
  }));

  // Get the last datapoint from the time series
  const lastDataPoint = chartData[chartData.length - 1];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Investments Performance</CardTitle>
          <CardDescription>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-semibold tracking-[-0.02em] tabular-nums">
                {formatCurrencySmart(data.currentValue, currency)}
              </span>
              {lastDataPoint && (() => {
                const pnlValue = lastDataPoint.pnl ?? 0;
                const pnlPercentage = lastDataPoint.pnlPercentage ?? 0;
                const isPositive = pnlPercentage >= 0;
                return (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <TrendingUp
                      className={`h-4 w-4 ${!isPositive ? "rotate-180" : ""}`}
                    />
                    {isPositive ? "+" : ""}
                    {pnlPercentage.toFixed(1)}% ({pnlValue >= 0 ? "+" : ""}
                    {formatCurrencySmart(pnlValue, currency)})
                  </span>
                );
              })()}
            </div>
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <Select value={selectedAccountId || "all"} onValueChange={onAccountChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 8, right: 12, left: 12, bottom: 0 }}
          >
            <defs>
              {series.map((key) => (
                <linearGradient key={key} id={`${gradientId}-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              type="category"
              tickFormatter={(value) => format(new Date(value), "MMM d")}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              allowDuplicatedCategory={false}
            />
            <YAxis
              tickFormatter={(value) => formatCurrencySmart(value, currency)}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={72}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(value) =>
                    typeof value === "string" ? format(new Date(value), "MMM d, yyyy") : value
                  }
                  formatter={(value, name, item) => {
                    if (name !== "value") {
                      return (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">Net Contributions</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCurrencySmart(typeof value === "number" ? value : Number(value), currency)}
                          </span>
                        </div>
                      );
                    }

                    const dataPayload = item?.payload as {
                      pnl?: number;
                      pnlPercentage?: number;
                    };

                    return (
                      <div className="grid gap-1.5">
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">Total Value</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCurrencySmart(typeof value === "number" ? value : Number(value), currency)}
                          </span>
                        </div>
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">PnL</span>
                          <span className="font-mono tabular-nums text-foreground">
                            {(dataPayload.pnl || 0) >= 0 ? "+" : ""}
                            {formatCurrencySmart(dataPayload.pnl || 0, currency)} ({(dataPayload.pnlPercentage || 0) >= 0 ? "+" : ""}
                            {(dataPayload.pnlPercentage || 0).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
              }
            />
            {series.map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                fill={`url(#${gradientId}-${key})`}
                fillOpacity={key === "value" ? 0.4 : 0.15}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={false}
                connectNulls={key === "netContributions"}
              />
            ))}
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

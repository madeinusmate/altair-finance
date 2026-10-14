"use client";

import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Filter, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { type DashboardDateRange } from "./dashboard-date-selector";
import { formatCurrencySmart } from "@/lib/chart-data-aggregation";
import { axisTick, chartCobalt, chartCobaltSoft, chartGrid, chartInk } from "@/components/charts/palette";

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
    color: chartCobalt,
  },
  netContributions: {
    label: "Net Contributions",
    color: chartInk,
  },
} satisfies ChartConfig;

export const InvestmentPerformanceChart = ({
  dateRange,
  currency,
  isLoading,
  data,
  accounts = [],
  selectedAccountId,
  onAccountChange,
}: InvestmentPerformanceChartProps) => {
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
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <defs>
                <linearGradient id="gradientValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartCobalt} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={chartCobaltSoft} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={chartGrid} />
              <XAxis
                dataKey="date"
                type="category"
                tickFormatter={(value) => format(new Date(value), "MMM d")}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                allowDuplicatedCategory={false}
              />
              <YAxis
                tick={axisTick}
                tickFormatter={(value) => formatCurrencySmart(value, currency)}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) {
                    return null;
                  }

                  // Get the payload data (all lines share the same payload)
                  const dataPayload = payload[0]?.payload as {
                    value?: number;
                    netContributions?: number;
                    pnl?: number;
                    pnlPercentage?: number;
                  } | undefined;

                  if (!dataPayload) {
                    return null;
                  }

                  return (
                    <div className="grid min-w-32 items-start gap-1.5 rounded-2xl border border-border bg-popover px-3 py-2 text-xs shadow-none">
                              <div className="font-medium">
                                {typeof label === "string" ? format(new Date(label), "MMM d, yyyy") : label}
                              </div>
                      <div className="grid gap-1.5">
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">Total Value</span>
                          <span className="font-mono font-medium">
                            {formatCurrencySmart(dataPayload.value || 0, currency)}
                          </span>
                        </div>
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">PnL (Absolute)</span>
                          <span className="font-mono text-foreground">
                            {(dataPayload.pnl || 0) >= 0 ? "+" : ""}
                            {formatCurrencySmart(dataPayload.pnl || 0, currency)}
                          </span>
                        </div>
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">PnL (Percentage)</span>
                          <span className="font-mono text-foreground">
                            {(dataPayload.pnlPercentage || 0) >= 0 ? "+" : ""}
                            {(dataPayload.pnlPercentage || 0).toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">Net Contributions</span>
                          <span className={`font-mono`}>
                           {formatCurrencySmart(dataPayload.netContributions || 0, currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="natural"
                dataKey="value"
                fill="url(#gradientValue)"
                fillOpacity={1}
                stroke={chartCobalt}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="netContributions"
                stroke={chartInk}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, fill: chartInk }}
                connectNulls={true}
              />
             
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
        {/* Custom Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: chartCobalt }} />
            <span className="text-sm text-muted-foreground">Investment Value</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: chartInk }} />
            <span className="text-sm text-muted-foreground">Net Contributions</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

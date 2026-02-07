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
    color: "hsl(142, 76%, 36%)", // green-600
  },
  netContributions: {
    label: "Net Contributions",
    color: "#000000", // black
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
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
            </Button>
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
              <span className="text-2xl font-bold">
                {formatCurrencySmart(data.currentValue, currency)}
              </span>
              {lastDataPoint && (() => {
                const pnlValue = lastDataPoint.pnl ?? 0;
                const pnlPercentage = lastDataPoint.pnlPercentage ?? 0;
                const isPositive = pnlPercentage >= 0;
                return (
                  <span
                    className={`flex items-center gap-1 text-sm ${
                      isPositive ? "text-green-600" : "text-red-600"
                    }`}
                  >
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
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <defs>
                <linearGradient id="gradientValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis
                dataKey="date"
                type="category"
                tickFormatter={(value) => format(new Date(value), "MMM d")}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                allowDuplicatedCategory={false}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value) => formatCurrencySmart(value, currency)}
                tickLine={false}
                axisLine={false}
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
                    <div className="border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
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
                          <span className={`font-mono ${(dataPayload.pnl || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {(dataPayload.pnl || 0) >= 0 ? "+" : ""}
                            {formatCurrencySmart(dataPayload.pnl || 0, currency)}
                          </span>
                        </div>
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">PnL (Percentage)</span>
                          <span className={`font-mono ${(dataPayload.pnlPercentage || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
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
                stroke="hsl(142, 76%, 36%)"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="netContributions"
                stroke="#000000"
                strokeWidth={1}
                dot={false}
                activeDot={{ r: 4, fill: "#000000" }}
                connectNulls={true}
              />
             
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
        {/* Custom Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 rounded" style={{ backgroundColor: "hsl(142, 76%, 36%)" }} />
            <span className="text-sm text-muted-foreground">Investment Value</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 rounded" style={{ backgroundColor: "#000000" }} />
            <span className="text-sm text-muted-foreground">Net Contributions</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

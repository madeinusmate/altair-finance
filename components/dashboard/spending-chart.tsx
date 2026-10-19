"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type DashboardDateRange } from "./dashboard-date-selector";
import { chartInk, chartSlate, spendingFills } from "@/components/charts/palette";
import type { SpendingCategoryComparison, SpendingComparison, SpendingDirection } from "@/lib/insights/spending";
import { currencyFractionDigits } from "@/lib/currencies";

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: currencyFractionDigits(currency),
    maximumFractionDigits: currencyFractionDigits(currency),
  }).format(amount);
};

const formatChange = (
  delta: number,
  percentChange: number | null,
  direction: SpendingDirection,
  currency: string,
): string => {
  if (direction === "flat") return "unchanged";
  const amount = formatCurrency(Math.abs(delta), currency);
  if (percentChange === null) return `${direction} ${amount}`;
  return `${direction} ${amount} (${Math.abs(percentChange).toFixed(1)}%)`;
};

const formatIsoDate = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return format(date, "MMM d, yyyy");
};

const formatMonthLabel = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return format(date, "MMM yyyy");
};

type SpendingBreakdown = "categories" | "payees";

interface SpendingChartProps {
  dateRange: DashboardDateRange;
  currency: string;
  isLoading?: boolean;
  data?: SpendingComparison;
}

const BreakdownSwitch = ({
  value,
  onChange,
}: {
  value: SpendingBreakdown;
  onChange: (value: SpendingBreakdown) => void;
}) => (
  <ToggleGroup
    type="single"
    variant="segmented"
    value={value}
    onValueChange={(next) => {
      if (next === "categories" || next === "payees") onChange(next);
    }}
    aria-label="Spending breakdown"
  >
    <ToggleGroupItem value="categories">Categories</ToggleGroupItem>
    <ToggleGroupItem value="payees">Payees</ToggleGroupItem>
  </ToggleGroup>
);

const chartConfig = {
  spending: {
    label: "Spending",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export const SpendingChart = ({
  currency,
  isLoading,
  data,
}: SpendingChartProps) => {
  const [breakdown, setBreakdown] = useState<SpendingBreakdown>("categories");

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

  const groups: SpendingCategoryComparison[] =
    breakdown === "payees" ? (data?.payees ?? []) : (data?.categories ?? []);
  const hasRows =
    groups.length > 0 ||
    (data?.categories.length ?? 0) > 0 ||
    (data?.payees?.length ?? 0) > 0 ||
    (data?.previousTotal ?? 0) > 0 ||
    (data?.total ?? 0) > 0;
  if (!data || !hasRows) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Spending Breakdown</CardTitle>
          <CardAction>
            <BreakdownSwitch value={breakdown} onChange={setBreakdown} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No spending data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartGroups = groups.filter((group) => group.amount > 0);
  const newNames: string[] = [];
  const goneNames: string[] = [];
  for (const group of groups) {
    if (group.status === "new") newNames.push(group.category);
    else if (group.status === "gone") goneNames.push(group.category);
  }

  const chartData = chartGroups.map((group, index) => ({
    name: group.category,
    spending: group.amount,
    percentage: group.percentage,
    previousAmount: group.previousAmount,
    percentChange: group.percentChange,
    direction: group.direction,
    delta: group.delta,
    status: group.status,
    fill: spendingFills[index % spendingFills.length],
  }));

  const chartHeight = breakdown === "payees" ? Math.max(280, chartData.length * 36) : 280;
  const chartScrolls = chartHeight > 420;

  const maxCategoryLength = chartData.reduce((longest, category) => Math.max(longest, category.name.length), 0);
  const yAxisWidth = Math.max(120, Math.min(200, maxCategoryLength * 8 + 20));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Breakdown</CardTitle>
        <CardAction>
          <BreakdownSwitch value={breakdown} onChange={setBreakdown} />
        </CardAction>
        <CardDescription className="flex flex-col gap-1">
          <span>
            <span className="font-medium tabular-nums" style={{ color: chartInk }}>
              {formatCurrency(data.total, currency)}
            </span>
            <span className="tabular-nums" style={{ color: chartInk }}>
              {" "}
              {formatChange(data.totalDelta, data.totalPercentChange, data.totalDirection, currency)}
            </span>
            <span style={{ color: chartSlate }}>
              {" "}
              vs {formatIsoDate(data.comparison.startDate)} – {formatIsoDate(data.comparison.endDate)}
            </span>
          </span>
          {data.yearAgo ? (
            <span style={{ color: chartSlate }}>
              vs {formatMonthLabel(data.yearAgo.startDate)}
              <span className="tabular-nums" style={{ color: chartInk }}>
                {" "}
                {formatChange(
                  data.yearAgo.totalDelta,
                  data.yearAgo.totalPercentChange,
                  data.yearAgo.totalDirection,
                  currency,
                )}
              </span>
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className={chartScrolls ? "max-h-[420px] overflow-y-auto" : undefined}>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto w-full"
              style={{ height: chartHeight }}
            >
              <BarChart
                key={breakdown}
                accessibilityLayer
                data={chartData}
                layout="vertical"
                margin={{ top: 8, right: 12, left: 12, bottom: 0 }}
                barCategoryGap="20%"
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => formatCurrency(value, currency)}
                  domain={[0, "dataMax"]}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={yAxisWidth}
                  interval={0}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="dashed"
                      labelFormatter={(label) => label}
                      formatter={(value, _, item) => {
                        const numericValue = typeof value === "number" ? value : Number(value);
                        const payload = item?.payload as (typeof chartData)[number] | undefined;
                        const percentage = payload?.percentage ?? 0;
                        const change =
                          payload?.status === "new" || !payload
                            ? "New"
                            : `Previous ${formatCurrency(payload.previousAmount, currency)} · ${formatChange(payload.delta, payload.percentChange, payload.direction, currency)}`;
                        return (
                          <div className="flex flex-col gap-1">
                            <span className="font-mono tabular-nums">{formatCurrency(numericValue, currency)}</span>
                            <span className="text-xs" style={{ color: chartSlate }}>
                              {percentage.toFixed(1)}% of this period
                            </span>
                            <span className="text-xs tabular-nums" style={{ color: chartInk }}>
                              {change}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar dataKey="spending" radius={4} minPointSize={2}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        ) : null}
       
      </CardContent>
    </Card>
  );
};

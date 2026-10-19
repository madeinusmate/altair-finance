"use client";

import { useId } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BalancePoint, formatCurrencySmart } from "@/lib/chart-data-aggregation";
import { currencyFractionDigits } from "@/lib/currencies";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface BalanceChartProps {
  series: BalancePoint[];
  currency: string;
}

const chartConfig = {
  balance: {
    label: "Balance",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const formatMoney = (amount: number, currency: string, sign: "auto" | "exceptZero" = "auto"): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: currencyFractionDigits(currency),
    maximumFractionDigits: currencyFractionDigits(currency),
    signDisplay: sign,
  }).format(amount);
};

const formatAxisTick = (amount: number, currency: string, span: number): string => {
  if (span >= 10_000) {
    return formatCurrencySmart(amount, currency);
  }
  const digits = span < 50 ? currencyFractionDigits(currency) : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
};

const formatPercent = (change: number, opening: number): string | null => {
  if (opening === 0) {
    return null;
  }
  const percent = Math.abs((change / Math.abs(opening)) * 100);
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: percent >= 10 ? 0 : 1,
    minimumFractionDigits: percent >= 10 ? 0 : 1,
  }).format(percent)}%`;
};

const plotDomain = (values: number[]): [number, number] => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.12, 1) : span * 0.18;
  return [min - pad, max + pad];
};

export const BalanceChart = ({ series, currency }: BalanceChartProps) => {
  const fillId = useId().replace(/:/g, "");

  if (series.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  const opening = series[0];
  const closing = series[series.length - 1];
  const change = closing.balance - opening.balance;
  const unchanged = Math.abs(change) < 0.005;
  const percent = unchanged ? null : formatPercent(change, opening.balance);
  const since = format(new Date(opening.time), "MMM d, yyyy");
  const values = series.map((point) => point.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const [domainLow, domainHigh] = plotDomain(values);
  const crossesZero = min < 0 && max > 0;
  const baseValue = crossesZero ? 0 : min < 0 ? domainHigh : domainLow;
  const fillFromLineUpward = min < 0 && !crossesZero;
  const crossesYear = new Date(opening.time).getFullYear() !== new Date(closing.time).getFullYear();

  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <CardDescription>Balance</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-[-0.03em] tabular-nums">
          {formatMoney(closing.balance, currency)}
        </CardTitle>
        <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted-foreground tabular-nums">
          {unchanged ? (
            <span>Unchanged since {since}</span>
          ) : (
            <>
              {change > 0 ? (
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="size-3.5" aria-hidden="true" />
              )}
              <span>{formatMoney(change, currency, "exceptZero")}</span>
              {percent ? <span>({percent})</span> : null}
              <span>since {since}</span>
            </>
          )}
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
          <AreaChart
            accessibilityLayer
            data={series}
            margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id={fillId}
                x1="0"
                y1={fillFromLineUpward ? "1" : "0"}
                x2="0"
                y2={fillFromLineUpward ? "0" : "1"}
              >
                <stop offset="0%" stopColor="var(--color-balance)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--color-balance)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              padding={{ left: 4, right: 12 }}
              tickFormatter={(value) =>
                format(new Date(value), crossesYear ? "MMM yyyy" : "MMM d")
              }
            />
            <YAxis
              domain={[domainLow, domainHigh]}
              allowDataOverflow
              tickFormatter={(value) => formatAxisTick(Number(value), currency, span)}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={84}
            />
            {crossesZero ? <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" /> : null}
            <ChartTooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) => {
                    const time = payload?.[0]?.payload?.time;
                    if (typeof time !== "number") {
                      return "";
                    }
                    return format(new Date(time), "EEEE, MMMM d, yyyy");
                  }}
                  formatter={(value) => {
                    const numericValue = typeof value === "number" ? value : Number(value);
                    return (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">Balance</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatMoney(numericValue, currency)}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Area
              type="stepAfter"
              dataKey="balance"
              baseValue={baseValue}
              fill={`url(#${fillId})`}
              stroke="var(--color-balance)"
              strokeWidth={2}
              activeDot={{ r: 4 }}
              dot={(props) => {
                const { cx, cy, index } = props as { cx?: number; cy?: number; index?: number };
                if (index !== series.length - 1 || cx == null || cy == null) {
                  return <g key={index} />;
                }
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill="var(--color-balance)"
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                );
              }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { PNLDataPoint, formatCurrencySmart } from "@/lib/chart-data-aggregation";
import { Card, CardContent } from "@/components/ui/card";

interface PNLChartProps {
  data: PNLDataPoint[];
  currency: string;
}

const chartConfig = {
  pnl: {
    label: "Profit / Loss",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export const PNLChart = ({ data, currency }: PNLChartProps) => {
  const fillId = useId().replace(/:/g, "");

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((item) => ({
    date: item.dateLabel,
    pnl: item.pnl,
    balance: item.balance,
    netContributions: item.netContributions,
  }));

  return (
    <Card>
      <CardContent className="pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
          <AreaChart accessibilityLayer data={chartData} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-pnl)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-pnl)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={72}
              tickFormatter={(value) => formatCurrencySmart(value, currency)}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.date ? payload[0].payload.date : ""
                  }
                  formatter={(value, name, item) => {
                    const numericValue = typeof value === "number" ? value : Number(value);
                    if (name !== "pnl") {
                      return null;
                    }
                    const payload = item?.payload as {
                      balance?: number;
                      netContributions?: number;
                    };
                    return (
                      <div className="grid gap-1">
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">PNL</span>
                          <span className="font-mono font-medium text-foreground">
                            {formatCurrencySmart(numericValue, currency)}
                          </span>
                        </div>
                        <div className="flex w-full items-center justify-between gap-4 text-xs text-muted-foreground">
                          <span>Balance</span>
                          <span className="font-mono">
                            {formatCurrencySmart(payload?.balance ?? 0, currency)}
                          </span>
                        </div>
                        <div className="flex w-full items-center justify-between gap-4 text-xs text-muted-foreground">
                          <span>Net Contributions</span>
                          <span className="font-mono">
                            {formatCurrencySmart(payload?.netContributions ?? 0, currency)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="var(--color-pnl)"
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

"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { MonthlyBalance, formatCurrencySmart } from "@/lib/chart-data-aggregation";
import { BalanceHistory } from "@/lib/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

interface BalanceChartProps {
  data?: MonthlyBalance[];
  balanceHistory?: BalanceHistory[];
  currency: string;
  accountId?: string;
}

const chartConfig = {
  balance: {
    label: "Balance",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig;

export const BalanceChart = ({ data, balanceHistory, currency, accountId }: BalanceChartProps) => {
  // Use monthly data if provided, otherwise use balance history
  let chartData: Array<{ date: string; dateLabel: string; balance: number }> = [];
  
  if (data && data.length > 0) {
    // Monthly balance data
    chartData = data.map((item) => ({
      date: item.month,
      dateLabel: item.monthLabel,
      balance: item.balance,
    }));
  } else if (balanceHistory && balanceHistory.length > 0) {
    // Balance history entries (for balance accounts)
    chartData = balanceHistory
      .map((entry) => ({
        date: new Date(entry.date).toISOString(),
        dateLabel: format(new Date(entry.date), "MMM d, yyyy"),
        balance: entry.balance,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  // Determine if we should show zero reference line
  const hasNegativeValues = chartData.some((d) => d.balance < 0);
  const hasPositiveValues = chartData.some((d) => d.balance > 0);
  const showZeroLine = hasNegativeValues && hasPositiveValues;

  return (
    <Card>
      <CardContent className="pt-6">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            width={undefined}
            height={undefined}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              angle={-45}
              textAnchor="end"
              height={80}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) => formatCurrencySmart(value, currency)}
              tickLine={false}
              axisLine={false}
            />
            {showZeroLine && (
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
            )}
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.dateLabel ? payload[0].payload.dateLabel : ""
                  }
                  formatter={(value) => {
                    const numericValue = typeof value === "number" ? value : Number(value);
                    return [
                      formatCurrencySmart(numericValue, currency),
                      "Balance"
                    ];
                  }}
                />
              }
            />
            <Area
              type="natural"
              dataKey="balance"
              fill="var(--color-balance)"
              fillOpacity={0.4}
              stroke="var(--color-balance)"
              strokeWidth={2}
              dot={{ fill: "var(--color-balance)", stroke: "var(--color-balance)", strokeWidth: 1, r: 2 }}
              activeDot={{ r: 4, stroke: "var(--color-balance)", strokeWidth: 1 }}
              connectNulls={true}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

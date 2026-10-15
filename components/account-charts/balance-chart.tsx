"use client";

import { useId } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { MonthlyBalance, formatCurrencySmart } from "@/lib/chart-data-aggregation";
import { BalanceHistory } from "@/lib/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { format, parseISO } from "date-fns";

interface BalanceChartProps {
  data?: MonthlyBalance[];
  balanceHistory?: BalanceHistory[];
  currency: string;
  accountId?: string;
}

const chartConfig = {
  balance: {
    label: "Balance",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export const BalanceChart = ({ data, balanceHistory, currency }: BalanceChartProps) => {
  const fillId = useId().replace(/:/g, "");
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
        <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 8, right: 12, left: 12, bottom: 0 }}
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickFormatter={(value) => formatCurrencySmart(value, currency)}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={72}
            />
            {showZeroLine && (
              <ReferenceLine y={0} stroke="var(--border)" />
            )}
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) => {
                    const payloadData = payload?.[0]?.payload;
                    if (!payloadData) return "";
                    
                    const dateValue = payloadData.date;
                    const dateLabel = payloadData.dateLabel || "";
                    
                    if (dateValue) {
                      try {
                        let date: Date;
                        let isMonthlyData = false;
                        
                        // Handle monthly data format (YYYY-MM) for transaction accounts
                        if (typeof dateValue === "string" && /^\d{4}-\d{2}$/.test(dateValue)) {
                          // Parse YYYY-MM format as first day of month
                          date = parseISO(`${dateValue}-01`);
                          isMonthlyData = true;
                        } else {
                          // Handle ISO date strings for balance accounts
                          date = typeof dateValue === "string" ? parseISO(dateValue) : new Date(dateValue);
                        }
                        
                        // For monthly data, show "Month Year" format
                        // For daily data, show full date with day of week
                        const formattedDate = isMonthlyData
                          ? format(date, "MMMM yyyy")
                          : format(date, "EEEE, MMMM d, yyyy");
                        return formattedDate;
                      } catch {
                        return dateLabel || "";
                      }
                    }
                    
                    return dateLabel || "";
                  }}
                  formatter={(value, name, item) => {
                    const numericValue = typeof value === "number" ? value : Number(value);
                    const payload = item?.payload as {
                      date?: string;
                      dateLabel?: string;
                    };
                    
                    // Format the date
                    let formattedDate = "";
                    if (payload?.date) {
                      try {
                        let date: Date;
                        let isMonthlyData = false;
                        
                        // Handle monthly data format (YYYY-MM) for transaction accounts
                        if (typeof payload.date === "string" && /^\d{4}-\d{2}$/.test(payload.date)) {
                          date = parseISO(`${payload.date}-01`);
                          isMonthlyData = true;
                        } else {
                          date = typeof payload.date === "string" ? parseISO(payload.date) : new Date(payload.date);
                        }
                        
                        formattedDate = isMonthlyData
                          ? format(date, "MMMM yyyy")
                          : format(date, "EEEE, MMMM d, yyyy");
                      } catch {
                        formattedDate = payload.dateLabel || "";
                      }
                    } else {
                      formattedDate = payload?.dateLabel || "";
                    }
                    
                    return (
                      <div className="grid gap-1">
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">Date</span>
                          <span className="font-medium text-foreground">{formattedDate}</span>
                        </div>
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">Balance</span>
                          <span className="font-mono text-foreground">
                            {formatCurrencySmart(numericValue, currency)}
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
              dataKey="balance"
              fill={`url(#${fillId})`}
              fillOpacity={0.4}
              stroke="var(--color-balance)"
              strokeWidth={2}
              dot={false}
              connectNulls={true}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PNLDataPoint, formatCurrencySmart } from "@/lib/chart-data-aggregation";
import { Card, CardContent } from "@/components/ui/card";

interface PNLChartProps {
  data: PNLDataPoint[];
  currency: string;
}

const chartConfig = {
  pnl: {
    label: "Profit / Loss",
    color: "#1227fd",
  },
};

export const PNLChart = ({ data, currency }: PNLChartProps) => {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  // Format data for chart
  const chartData = data.map((item) => ({
    date: item.dateLabel,
    pnl: item.pnl,
    balance: item.balance,
    netContributions: item.netContributions,
  }));

  return (
    <Card>
      <CardContent className="pt-6">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }} width={undefined} height={undefined}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) => formatCurrencySmart(value, currency)}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" label="Net Contribution" />
            <ChartTooltip
              content={
                <ChartTooltipContent
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
                          <span className="font-mono text-foreground">
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
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="#1227fd"
              strokeWidth={2}
              dot={{ fill: "#1227fd", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

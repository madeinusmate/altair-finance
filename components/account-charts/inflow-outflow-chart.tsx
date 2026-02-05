"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { MonthlyInflowOutflow, formatCurrencySmart } from "@/lib/chart-data-aggregation";
import { Card, CardContent } from "@/components/ui/card";

interface InflowOutflowChartProps {
  data: MonthlyInflowOutflow[];
  currency: string;
}

const chartConfig = {
  inflow: {
    label: "Inflow",
    color: "hsl(142, 76%, 36%)", // green-600
  },
  outflow: {
    label: "Outflow",
    color: "hsl(0, 84%, 60%)", // red-500
  },
};

export const InflowOutflowChart = ({ data, currency }: InflowOutflowChartProps) => {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }} width={undefined} height={undefined}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) => {
                return formatCurrencySmart(value, currency);
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.monthLabel ? payload[0].payload.monthLabel : ""
                  }
                  formatter={(value, name) => {
                    const numericValue = typeof value === "number" ? value : Number(value);
                    const displayValue = formatCurrencySmart(numericValue, currency);
                    const label = name === "outflow" ? "Outflow" : "Inflow";
                    return (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono text-foreground">{label === "Outflow" ? "-" + displayValue : displayValue}</span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar
              dataKey="inflow"
              fill="hsl(142, 76%, 36%)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="outflow"
              fill="hsl(0, 84%, 60%)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

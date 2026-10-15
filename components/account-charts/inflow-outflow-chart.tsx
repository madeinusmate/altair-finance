"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { MonthlyInflowOutflow, formatCurrencySmart } from "@/lib/chart-data-aggregation";
import { Card, CardContent } from "@/components/ui/card";

interface InflowOutflowChartProps {
  data: MonthlyInflowOutflow[];
  currency: string;
}

const chartConfig = {
  inflow: {
    label: "Inflow",
    color: "var(--chart-1)",
  },
  outflow: {
    label: "Outflow",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

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
        <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
          <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={72}
              tickFormatter={(value) => formatCurrencySmart(value, currency)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dashed"
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
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {label === "Outflow" ? "-" + displayValue : displayValue}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar dataKey="inflow" fill="var(--color-inflow)" radius={4} />
            <Bar dataKey="outflow" fill="var(--color-outflow)" radius={4} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

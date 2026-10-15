"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { MonthlyInflowOutflow, formatCurrencySmart } from "@/lib/chart-data-aggregation";
import { Card, CardContent } from "@/components/ui/card";
import { axisTick, chartCobalt, chartGrid, chartInk } from "@/components/charts/palette";

interface InflowOutflowChartProps {
  data: MonthlyInflowOutflow[];
  currency: string;
}

const chartConfig = {
  inflow: {
    label: "Inflow",
    color: chartCobalt,
  },
  outflow: {
    label: "Outflow",
    color: chartInk,
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
            <CartesianGrid vertical={false} stroke={chartGrid} />
            <XAxis
              dataKey="monthLabel"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
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
              fill={chartCobalt}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="outflow"
              fill={chartInk}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

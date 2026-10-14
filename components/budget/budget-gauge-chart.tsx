"use client";

import { RadialBarChart, RadialBar, PolarRadiusAxis, Label } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { chartCobalt } from "@/components/charts/palette";

interface BudgetGaugeChartProps {
  overallPercentageUsed: number;
  overallBudget: number;
  overallSpent: number;
  currency: string;
  isLoading?: boolean;
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const getSpentColor = (): string => chartCobalt;

const chartConfig = {
  spent: {
    label: "Spent",
    color: chartCobalt,
  },
  remaining: {
    label: "Remaining",
    color: "hsl(var(--muted))",
  },
} satisfies ChartConfig;

export const BudgetGaugeChart = ({
  overallPercentageUsed,
  overallBudget,
  overallSpent,
  currency,
  isLoading,
}: BudgetGaugeChartProps) => {
  if (isLoading) {
    return (
      <Card className="flex flex-col">
      <CardHeader className="items-center pb-2">
        <CardTitle className="text-base">Budget Utilization</CardTitle>
        <CardDescription className="text-xs">Overall budget overview</CardDescription>
      </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // Calculate values for the radial chart
  const displayPercentage = Math.min(overallPercentageUsed, 100);
  const remainingPercentage = Math.max(0, 100 - displayPercentage);
  const spentColor = getSpentColor();

  const chartData = [
    {
      spent: displayPercentage,
      remaining: remainingPercentage,
    },
  ];

  const getStatusText = () => {
    if (overallPercentageUsed > 100) {
      return `${Math.abs(overallPercentageUsed - 100).toFixed(1)}% over budget`;
    } else if (overallPercentageUsed >= 75) {
      return "Approaching budget limit";
    }
    return "Within budget";
  };

  const getStatusColor = () => "fill-[#1f1f1f]";

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Budget Utilization</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[180px]"
        >
          <RadialBarChart
            data={chartData}
            startAngle={180}
            endAngle={0}
            innerRadius={80}
            outerRadius={130}
          >
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 16}
                          className={cn(
                            "text-2xl font-medium",
                            getStatusColor()
                          )}
                        >
                          {overallPercentageUsed.toFixed(0)}%
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 4}
                          className="fill-muted-foreground"
                        >
                          Used
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
            
            <RadialBar
              dataKey="remaining"
              fill="var(--muted)"
              stackId="a"
              cornerRadius={5}
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="spent"
              stackId="a"
              cornerRadius={5}
              fill={spentColor}
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      {/* <CardFooter className="flex-col gap-2 text-sm">
        <div className={cn("flex items-center gap-2 leading-none font-medium", getStatusColor())}>
          {getStatusText()}
        </div>
        <div className="text-muted-foreground leading-none">
          {formatCurrency(overallSpent, currency)} of {formatCurrency(overallBudget, currency)} spent
        </div>
      </CardFooter> */}
    </Card>
  );
};

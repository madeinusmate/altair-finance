"use client";

import { useMemo } from "react";
import { ResponsiveSankey } from "@nivo/sankey";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { type DashboardDateRange } from "./dashboard-date-selector";

interface CashFlowSankeyData {
  income: number;
  investment: number;
  savings: number;
  expenses: number;
  currency: string;
}

interface CashFlowSankeyChartProps {
  dateRange: DashboardDateRange;
  isLoading: boolean;
  data: CashFlowSankeyData | null;
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const CashFlowSankeyChart = ({
  dateRange,
  isLoading,
  data,
}: CashFlowSankeyChartProps) => {
  const sankeyData = useMemo(() => {
    if (!data) {
      return {
        nodes: [
          { id: "Income" },
          { id: "Investment" },
          { id: "Savings" },
          { id: "Expenses" },
        ],
        links: [],
      };
    }

    const { income, investment, savings, expenses } = data;

    // Ensure we have valid flows (non-negative values for flows)
    const investmentFlow = Math.max(0, investment);
    const expensesFlow = Math.max(0, expenses);
    // Savings can be negative, but Sankey flows must be positive
    // If savings is negative, we won't show it as a flow (it means expenses + investment > income)
    const savingsFlow = Math.max(0, savings);

    const nodes = [
      { id: "Income" },
      { id: "Investment" },
      { id: "Savings" },
      { id: "Expenses" },
    ];

    const links = [];

    // Only add links if there's a positive flow
    if (investmentFlow > 0) {
      links.push({
        source: "Income",
        target: "Investment",
        value: investmentFlow,
      });
    }

    if (savingsFlow > 0) {
      links.push({
        source: "Income",
        target: "Savings",
        value: savingsFlow,
      });
    }

    if (expensesFlow > 0) {
      links.push({
        source: "Income",
        target: "Expenses",
        value: expensesFlow,
      });
    }

    return { nodes, links };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || (data.income === 0 && data.investment === 0 && data.expenses === 0 && data.savings === 0)) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle>Cash Flow Visualization</CardTitle>
            <CardDescription>Income sources and expense categories</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No cash flow data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Neutral color scheme
  const getNodeColor = (node: { id: string }) => {
    switch (node.id) {
      case "Income":
        return "hsl(220, 13%, 18%)"; // dark gray (slate-800)
      case "Investment":
        return "hsl(215, 16%, 47%)"; // medium gray (slate-500)
      case "Savings":
        // Neutral gray, slightly darker if negative
        return data && data.savings < 0 
          ? "hsl(215, 16%, 35%)" // darker gray if negative
          : "hsl(215, 16%, 55%)"; // lighter gray if positive
      case "Expenses":
        return "hsl(215, 16%, 40%)"; // medium-dark gray
      default:
        return "hsl(215, 16%, 50%)";
    }
  };


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Cash Flow Visualization</CardTitle>
          <CardDescription>Income allocation to Investment, Savings, and Expenses</CardDescription>
        </div>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveSankey
            data={sankeyData}
            margin={{ top: 60, right: 180, bottom: 60, left: 180 }}
            align="justify"
            colors={getNodeColor}
            nodeThickness={20}
            nodeSpacing={50}
            nodeInnerPadding={3}
            nodeBorderWidth={0}
            nodeBorderColor={{ from: "color", modifiers: [["darker", 0.8]] }}
            linkOpacity={0.6}
            linkHoverOpacity={0.85}
            linkHoverOthersOpacity={0.15}
            linkContract={2}
            enableLinkGradient={false}
            labelPosition="outside"
            labelOrientation="vertical"
            labelPadding={16}
            labelTextColor="hsl(215, 16%, 30%)"
            nodeTooltip={({ node }) => {
              const value = node.value !== undefined ? node.value : 0;
              return (
                <div className="rounded-lg border bg-background p-2 shadow-md">
                  <div className="font-semibold">{node.id}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatCurrency(value, data?.currency || "USD")}
                  </div>
                </div>
              );
            }}
            linkTooltip={({ link }) => {
              const value = link.value !== undefined ? link.value : 0;
              return (
                <div className="rounded-lg border bg-background p-2 shadow-md">
                  <div className="font-semibold">
                    {link.source.id} → {link.target.id}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatCurrency(value, data?.currency || "USD")}
                  </div>
                </div>
              );
            }}
            legends={[
              {
                anchor: "bottom-right",
                direction: "column",
                translateX: 100,
                itemWidth: 80,
                itemHeight: 14,
                itemDirection: "right-to-left",
                itemsSpacing: 2,
                itemTextColor: "#999",
                symbolSize: 14,
                effects: [
                  {
                    on: "hover",
                    style: {
                      itemTextColor: "#000",
                    },
                  },
                ],
              },
            ]}
          />
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between border-t pt-4 mt-4 text-sm">
          <div>
            <span className="text-muted-foreground">Total Income: </span>
            <span className="font-medium text-foreground">
              {data ? formatCurrency(data.income, data.currency) : "$0.00"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-muted-foreground">Investment: </span>
              <span className="font-medium text-foreground">
                {data ? formatCurrency(data.investment, data.currency) : "$0.00"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Savings: </span>
              <span className="font-medium text-foreground">
                {data ? formatCurrency(data.savings, data.currency) : "$0.00"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Expenses: </span>
              <span className="font-medium text-foreground">
                {data ? formatCurrency(data.expenses, data.currency) : "$0.00"}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

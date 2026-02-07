"use client";

import { useMemo } from "react";
import { ResponsiveSankey } from "@nivo/sankey";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
      { id: "Income", value: income },
      { id: "Investment", value: investmentFlow },
      { id: "Savings", value: savingsFlow },
      { id: "Expenses", value: expensesFlow },
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No cash flow data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Color scheme: income green, expenses red, saving gold, investment blue
  const getNodeColor = (node: { id: string }) => {
    switch (node.id) {
      case "Income":
        return "#22c55e"; // green
      case "Investment":
        return "#3b82f6"; // blue
      case "Savings":
        return "#eab308"; // gold
      case "Expenses":
        return "#ef4444"; // red
      default:
        return "#6b7280"; // gray fallback
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Cash Flow Visualization</CardTitle>
        </div>

      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveSankey
            data={sankeyData}
            margin={{ top: 60, right: 180, bottom: 100, left: 180 }}
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
            enableLinkGradient={true}
            labelPosition="outside"
            labelOrientation="horizontal"
            labelPadding={16}
            labelTextColor="hsl(215, 16%, 30%)"
            label={(node) => {
              // For horizontal labels, return the text directly and let Nivo handle positioning
              if (!data) return node.id;
              let value = node.value !== undefined ? node.value : 0;
              
              if (node.id === "Income") {
                value = data.income;
              } else if (node.id === "Investment") {
                value = data.investment;
              } else if (node.id === "Savings") {
                value = data.savings;
              } else if (node.id === "Expenses") {
                value = data.expenses;
              }
              
              return `${node.id}: ${formatCurrency(value, data.currency)}`;
            }}
            theme={{
              labels: {
                text: {
                  fontWeight: 700,
                  fontSize: 14,
                },
              },
            }}
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
          />
        </div>
        {/* Custom Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#22c55e" }} />
            <span className="text-sm text-muted-foreground">Income</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#3b82f6" }} />
            <span className="text-sm text-muted-foreground">Investment</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#eab308" }} />
            <span className="text-sm text-muted-foreground">Savings</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#ef4444" }} />
            <span className="text-sm text-muted-foreground">Expenses</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

"use client";

import { useMemo } from "react";
import { ResponsiveSankey } from "@nivo/sankey";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type DashboardDateRange } from "./dashboard-date-selector";
import { chartCobalt, chartCobaltSoft, chartInk, chartSlate } from "@/components/charts/palette";

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
    // Use absolute value so negative savings still shows as a flow
    const savingsFlow = Math.abs(savings);

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

    // Always show savings flow if there's any savings (positive or negative)
    // The absolute value is used for flow width, color will indicate sign
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

  // Helper to get the real value for a node
  const getNodeValue = (nodeId: string): number => {
    if (!data) return 0;
    switch (nodeId) {
      case "Income":
        return data.income;
      case "Investment":
        return data.investment;
      case "Savings":
        return data.savings;
      case "Expenses":
        return data.expenses;
      default:
        return 0;
    }
  };

  // Custom labels layer that renders two-line labels (name + value)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomLabelsLayer = ({ nodes }: { nodes: readonly any[] }) => {
    return (
      <>
        {nodes.map((node) => {
          const value = getNodeValue(node.id);
          const formatted = data ? formatCurrency(value, data.currency) : "";

          // Determine x position: left-side nodes get label to the left, right-side nodes to the right
          const isLeftSide = node.x < 100;
          const labelX = isLeftSide ? node.x - 16 : node.x + node.width + 16;
          const textAnchor = isLeftSide ? "end" : "start";
          const labelY = node.y + node.height / 2;

          return (
            <text
              key={node.id}
              x={labelX}
              y={labelY}
              textAnchor={textAnchor}
              dominantBaseline="central"
              style={{
                fontWeight: 500,
                fontSize: 14,
                fill: chartInk,
              }}
            >
              <tspan x={labelX} dy="-0.5em">
                {node.id}
              </tspan>
              <tspan x={labelX} dy="1.2em" style={{ fontSize: 12, fontWeight: 500 }}>
                {formatted}
              </tspan>
            </text>
          );
        })}
      </>
    );
  };

  const getNodeColor = (node: { id: string }) => {
    switch (node.id) {
      case "Income":
        return chartCobalt;
      case "Investment":
        return chartCobaltSoft;
      case "Savings":
        return chartInk;
      case "Expenses":
        return chartSlate;
      default:
        return chartSlate;
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
            enableLabels={false}
            layers={["links", "nodes", CustomLabelsLayer, "legends"]}
            nodeTooltip={({ node }) => {
              if (!data) return null;
              const value = getNodeValue(node.id);
              return (
                <div className="rounded-2xl border border-[#e4e4e7] bg-white p-2 shadow-none">
                  <div className="font-semibold">{node.id}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatCurrency(value, data.currency)}
                  </div>
                </div>
              );
            }}
            linkTooltip={({ link }) => {
              if (!data) return null;
              let value = link.value !== undefined ? link.value : 0;
              
              // For savings link, show the actual savings value (can be negative)
              if (link.target.id === "Savings") {
                value = data.savings;
              }
              
              return (
                <div className="rounded-2xl border border-[#e4e4e7] bg-white p-2 shadow-none">
                  <div className="font-semibold">
                    {link.source.id} → {link.target.id}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatCurrency(value, data.currency)}
                  </div>
                </div>
              );
            }}
          />
        </div>
        {/* Custom Legend */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-[#e4e4e7] pt-4">
          {[
            ["Income", chartCobalt],
            ["Investment", chartCobaltSoft],
            ["Savings", chartInk],
            ["Expenses", chartSlate],
          ].map(([label, color]) => (
            <div key={label} className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-sm text-[#717173]">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

"use client";

import { useMemo, useState, useEffect } from "react";
import { Account, Transaction, Transfer, BalanceHistory, InvestmentHistory } from "@/lib/db/schema";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DateRangeSelector, DateRange } from "./date-range-selector";
import { InflowOutflowChart } from "./inflow-outflow-chart";
import { BalanceChart } from "./balance-chart";
import { PNLChart } from "./pnl-chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  aggregateMonthlyInflowOutflow,
  reconstructMonthlyBalance,
  calculatePNLData,
} from "@/lib/chart-data-aggregation";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

type ChartType = "inflow-outflow" | "balance" | "pnl";

interface AccountChartsContainerProps {
  account: Account;
  transactions: Transaction[];
  transfers: Transfer[];
  balanceHistory: BalanceHistory[];
  investmentHistory: InvestmentHistory[];
  isLoading?: boolean;
}

export const AccountChartsContainer = ({
  account,
  transactions,
  transfers,
  balanceHistory,
  investmentHistory,
  isLoading = false,
}: AccountChartsContainerProps) => {
  // Determine available chart types and default
  const getAvailableCharts = (): { charts: ChartType[]; default: ChartType } => {
    if (account.type === "transaction") {
      return { charts: ["inflow-outflow", "balance"], default: "inflow-outflow" };
    } else if (account.type === "investment") {
      return { charts: ["inflow-outflow", "pnl"], default: "pnl" };
    } else {
      return { charts: ["balance"], default: "balance" };
    }
  };

  const { charts: availableCharts, default: defaultChart } = getAvailableCharts();
  const [selectedChart, setSelectedChart] = useState<ChartType>(defaultChart);

  // Date range state - default to last 12 months
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const endDate = new Date();
    const startDate = startOfMonth(subMonths(endDate, 11));
    return { startDate, endDate };
  });

  // Calculate chart data based on selected chart type
  const chartData = useMemo(() => {
    if (isLoading) return null;

    if (account.type === "transaction") {
      if (selectedChart === "inflow-outflow") {
        return {
          type: "inflow-outflow" as const,
          data: aggregateMonthlyInflowOutflow(
            transactions,
            transfers,
            account.id,
            dateRange.startDate,
            dateRange.endDate
          ),
        };
      } else if (selectedChart === "balance") {
        return {
          type: "balance" as const,
          data: reconstructMonthlyBalance(
            transactions,
            transfers,
            account.id,
            account.initialBalance,
            account.nature as "asset" | "liability",
            dateRange.startDate,
            dateRange.endDate
          ),
        };
      }
    } else if (account.type === "investment") {
      if (selectedChart === "inflow-outflow") {
        return {
          type: "inflow-outflow" as const,
          data: aggregateMonthlyInflowOutflow(
            transactions,
            transfers,
            account.id,
            dateRange.startDate,
            dateRange.endDate
          ),
        };
      } else if (selectedChart === "pnl") {
        return {
          type: "pnl" as const,
          data: calculatePNLData(
            investmentHistory,
            transfers,
            account.id,
            dateRange.startDate,
            dateRange.endDate
          ),
        };
      }
    } else if (account.type === "balance") {
      // Filter balance history to date range
      const filteredHistory = balanceHistory.filter((entry) => {
        const entryDate = new Date(entry.date);
        return entryDate >= dateRange.startDate && entryDate <= dateRange.endDate;
      });
      
      return {
        type: "balance" as const,
        balanceHistory: filteredHistory,
      };
    }

    return null;
  }, [
    account,
    transactions,
    transfers,
    balanceHistory,
    investmentHistory,
    selectedChart,
    dateRange,
    isLoading,
  ]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-label="Account charts">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {availableCharts.length > 1 && (
          <ToggleGroup
            type="single"
            value={selectedChart}
            onValueChange={(value) => {
              if (value) setSelectedChart(value as ChartType);
            }}
            variant="outline"
            className="w-fit"
          >
            {availableCharts.includes("inflow-outflow") && (
              <ToggleGroupItem value="inflow-outflow" aria-label="Inflow/Outflow chart">
                Inflow/Outflow
              </ToggleGroupItem>
            )}
            {availableCharts.includes("balance") && (
              <ToggleGroupItem value="balance" aria-label="Balance chart">
                Balance
              </ToggleGroupItem>
            )}
            {availableCharts.includes("pnl") && (
              <ToggleGroupItem value="pnl" aria-label="Profit/Loss chart">
                Profit/Loss
              </ToggleGroupItem>
            )}
          </ToggleGroup>
        )}
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </div>

      {chartData?.type === "inflow-outflow" && (
        <InflowOutflowChart data={chartData.data} currency={account.currency} />
      )}

      {chartData?.type === "balance" && (
        <BalanceChart
          data={chartData.data}
          balanceHistory={chartData.balanceHistory}
          currency={account.currency}
          accountId={account.id}
        />
      )}

      {chartData?.type === "pnl" && (
        <PNLChart data={chartData.data} currency={account.currency} />
      )}

      {!chartData && (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">No chart data available</p>
        </div>
      )}
    </div>
  );
};

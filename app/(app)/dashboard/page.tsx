"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, AlertTriangle, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type SupportedCurrency } from "@/lib/currencies";
import { useDisplayCurrencies } from "@/hooks/use-display-currencies";
import { startOfMonth, endOfDay, subMonths, startOfDay, format } from "date-fns";
import { DashboardDateSelector, type DashboardDateRange } from "@/components/dashboard/dashboard-date-selector";
import { MonthlyIncomeExpensesChart } from "@/components/dashboard/monthly-income-expenses-chart";
import { CashFlowSankeyChart } from "@/components/dashboard/cash-flow-sankey-chart";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { InvestmentPerformanceChart } from "@/components/dashboard/investment-performance-chart";
import { NetCashChart } from "@/components/dashboard/net-cash-chart";
import { BudgetTile } from "@/components/dashboard/budget-tile";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { NetWorthCard } from "@/components/dashboard/net-worth-card";
import { AccountCreateDialog } from "@/components/account-create-dialog";
import type { Transaction, Transfer } from "@/lib/db/schema";

interface AccountBalance {
  id: string;
  name: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
  currency: string;
  balance: number;
  netContributions?: number;
  profitLoss?: number;
}

interface CurrencyNetWorth {
  currency: SupportedCurrency;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  totalProfitLoss: number;
}

interface NetWorthData {
  netWorthByCurrency: Record<SupportedCurrency, CurrencyNetWorth>;
  accounts: AccountBalance[];
  totalAccounts: number;
  lastRatesUpdatedAt: string;
  isRatesStale: boolean;
  usedFallbackRates: boolean;
  hasUnsupportedCurrencies: boolean;
  unsupportedCurrencies: string[];
}

interface CashFlowData {
  income: Array<{ category: string; amount: number }>;
  expenses: Array<{ category: string; amount: number }>;
  currency: string;
}

interface CashFlowSankeyData {
  income: number;
  investment: number;
  savings: number;
  expenses: number;
  currency: string;
}

interface SpendingData {
  categories: Array<{ category: string; amount: number; percentage: number }>;
  total: number;
  currency: string;
}

interface InvestmentDataPoint {
  date: string;
  dateLabel: string;
  value: number;
  netContributions: number;
  pnl: number;
  pnlPercentage: number;
}

interface InvestmentPerformanceData {
  data: InvestmentDataPoint[];
  currentValue: number;
  previousValue: number;
  percentageChange: number;
  currency: string;
}

interface MonthlyIncomeExpenses {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  currency: string;
}

const formatCurrency = (amount: number, currency: string, decimals: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
};

const formatNetWorthCurrency = (amount: number, currency: string): string => {
  const decimals = Math.abs(amount) >= 1_000_000 ? 0 : 2;
  return formatCurrency(amount, currency, decimals);
};

const formatRateTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Rates updated recently";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const DashboardPage = () => {
  const [data, setData] = useState<NetWorthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { enabledCurrencies, selectedCurrency, selectCurrency, profileName, isReady } = useDisplayCurrencies();
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activity, setActivity] = useState<{ transactions: Transaction[]; transfers: Transfer[] } | null>(null);

  // Date range state - default to last 3 months
  const [dateRange, setDateRange] = useState<DashboardDateRange>(() => {
    const now = new Date();
    const endDate = endOfDay(now);
    // For "Last 3 months": current month + 2 previous months
    // Get start of current month, then subtract 2 months
    const currentMonthStart = startOfMonth(now);
    const startDate = startOfDay(subMonths(currentMonthStart, 2));
    return {
      startDate,
      endDate,
    };
  });

  // Dashboard data states
  const [cashFlowSankeyData, setCashFlowSankeyData] = useState<CashFlowSankeyData | null>(null);
  const [spendingData, setSpendingData] = useState<SpendingData | null>(null);
  const [investmentData, setInvestmentData] = useState<InvestmentPerformanceData | null>(null);
  const [monthlyIncomeExpenses, setMonthlyIncomeExpenses] = useState<MonthlyIncomeExpenses[] | null>(null);
  const [investmentAccounts, setInvestmentAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedInvestmentAccount, setSelectedInvestmentAccount] = useState<string | undefined>(undefined);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const result = await apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>(
          "/api/transactions-unified"
        );
        setActivity(result);
      } catch (error) {
        console.error("Failed to fetch recent activity:", error);
      }
    };

    void fetchActivity();
  }, [refreshKey]);

  // Fetch net worth data
  useEffect(() => {
    const fetchNetWorth = async () => {
      try {
        const result = await apiClient.get<NetWorthData>("/api/net-worth");
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch net worth");
      } finally {
        setIsLoading(false);
      }
    };

    fetchNetWorth();
  }, [refreshKey]);

  // Fetch dashboard insights data
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!data || !isReady) return;

      setIsLoadingDashboard(true);
      try {
        // Use format() instead of toISOString() to preserve local timezone
        // toISOString() converts to UTC which can shift the date backward
        const startDateStr = format(dateRange.startDate, "yyyy-MM-dd");
        const endDateStr = format(dateRange.endDate, "yyyy-MM-dd");

        // Fetch all dashboard data in parallel
        const [cashFlowSankeyRes, spendingRes, investmentRes, monthlyIncomeExpensesRes] = await Promise.all([
          apiClient.get<CashFlowSankeyData>(
            `/api/dashboard/cash-flow-sankey?startDate=${startDateStr}&endDate=${endDateStr}&currency=${selectedCurrency}`
          ).catch(() => null),
          apiClient.get<SpendingData>(
            `/api/dashboard/spending?startDate=${startDateStr}&endDate=${endDateStr}&currency=${selectedCurrency}`
          ).catch(() => null),
          apiClient.get<InvestmentPerformanceData>(
            `/api/dashboard/investment-performance?startDate=${startDateStr}&endDate=${endDateStr}&currency=${selectedCurrency}${selectedInvestmentAccount ? `&accountId=${selectedInvestmentAccount}` : ""}`
          ).catch(() => null) as Promise<InvestmentPerformanceData | null>,
          apiClient.get<MonthlyIncomeExpenses[]>(
            `/api/dashboard/monthly-income-expenses?startDate=${startDateStr}&endDate=${endDateStr}&currency=${selectedCurrency}`
          ).catch(() => null),
        ]);

        if (cashFlowSankeyRes) {
          setCashFlowSankeyData(cashFlowSankeyRes);
        }

        if (spendingRes) {
          setSpendingData(spendingRes);
        }

        if (investmentRes) {
          setInvestmentData(investmentRes);
        }

        if (monthlyIncomeExpensesRes) {
          setMonthlyIncomeExpenses(monthlyIncomeExpensesRes);
        }

        // Get investment accounts
        const investmentAccs = data.accounts
          .filter((acc) => acc.type === "investment")
          .map((acc) => ({ id: acc.id, name: acc.name }));
        setInvestmentAccounts(investmentAccs);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setIsLoadingDashboard(false);
      }
    };

    fetchDashboardData();
  }, [data, dateRange, selectedCurrency, selectedInvestmentAccount, isReady]);



  const hasData = data && data.accounts.length > 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const greetingLine = profileName ? `${greeting}, ${profileName}` : greeting;
  const netWorthSummary = data?.netWorthByCurrency[selectedCurrency];
  const ratesLabel = data ? formatRateTimestamp(data.lastRatesUpdatedAt) : "";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[32px] font-medium leading-[38px] tracking-[-0.02em]">Home</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[32px] font-medium leading-[38px] tracking-[-0.02em]">Home</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <div className="space-y-2">
        {isReady || hasData ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {isReady ? (
              <div className="flex h-8 items-center rounded-full bg-muted p-0.5" role="group" aria-label="Currency">
                {enabledCurrencies.map((currency) => (
                  <button
                    key={currency}
                    type="button"
                    onClick={() => selectCurrency(currency)}
                    className={
                      currency === selectedCurrency
                        ? "h-7 rounded-full bg-background px-3 text-sm font-semibold text-foreground shadow-sm"
                        : "h-7 rounded-full px-3 text-sm text-muted-foreground"
                    }
                  >
                    {currency}
                  </button>
                ))}
              </div>
            ) : null}
            {hasData ? (
              <div className="ml-auto flex h-8 items-center rounded-full bg-muted p-0.5">
                <DashboardDateSelector
                  value={dateRange}
                  onChange={setDateRange}
                  className="h-7 rounded-full border-0 bg-background px-3 font-semibold text-foreground shadow-sm hover:bg-background"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      <NetWorthCard
        greeting={greetingLine}
        amount={
          hasData && netWorthSummary && !data?.hasUnsupportedCurrencies
            ? formatNetWorthCurrency(netWorthSummary.netWorth, netWorthSummary.currency)
            : null
        }
        assets={
          hasData && netWorthSummary && !data?.hasUnsupportedCurrencies
            ? formatNetWorthCurrency(netWorthSummary.totalAssets, netWorthSummary.currency)
            : null
        }
        liabilities={
          hasData && netWorthSummary && !data?.hasUnsupportedCurrencies
            ? formatNetWorthCurrency(netWorthSummary.totalLiabilities, netWorthSummary.currency)
            : null
        }
      />
      </div>

      {!hasData ? (
        <Card className="netly-fade-in">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No accounts yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Start tracking your net worth by adding your first account.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {data?.hasUnsupportedCurrencies && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Net worth is disabled until all accounts use a supported currency. Unsupported:{" "}
                {data.unsupportedCurrencies.join(", ")}. Update account currencies in Accounts.
              </AlertDescription>
            </Alert>
          )}

          {data?.hasUnsupportedCurrencies || !netWorthSummary ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  Set a supported currency for every account to view net worth totals.
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BudgetTile currency={selectedCurrency} />
              <Card className="h-full border-transparent shadow-none">
                <CardContent className="px-4 py-4">
                  <p className="text-[13px] text-muted-foreground">Investment P/L</p>
                  <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                    {netWorthSummary.totalProfitLoss >= 0 ? "+" : ""}
                    {formatNetWorthCurrency(netWorthSummary.totalProfitLoss, netWorthSummary.currency)}
                  </p>
                  <p className="mt-2 text-[13px] text-muted-foreground">Across investment accounts</p>
                </CardContent>
              </Card>
            </div>
            <RecentActivity
              transactions={activity?.transactions ?? []}
              transfers={activity?.transfers ?? []}
              accounts={data.accounts}
              isLoading={activity === null}
            />
            </>
          )}
          <section className="space-y-4">
            <div>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">Cash flow</h2>
              <p className="text-sm text-muted-foreground">Where income went in this period</p>
            </div>
            <CashFlowSankeyChart
              dateRange={dateRange}
              isLoading={isLoadingDashboard}
              data={cashFlowSankeyData}
            />
          </section>
          <section className="space-y-4">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">Over time</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <MonthlyIncomeExpensesChart
                dateRange={dateRange}
                currency={selectedCurrency}
                isLoading={isLoadingDashboard}
                data={monthlyIncomeExpenses || undefined}
              />
              <NetCashChart
                currency={selectedCurrency}
                isLoading={isLoadingDashboard}
                data={monthlyIncomeExpenses || undefined}
              />
              <SpendingChart
                dateRange={dateRange}
                currency={selectedCurrency}
                isLoading={isLoadingDashboard}
                data={spendingData || undefined}
              />
              <InvestmentPerformanceChart
                dateRange={dateRange}
                currency={selectedCurrency}
                isLoading={isLoadingDashboard}
                data={investmentData || undefined}
                accounts={investmentAccounts}
                selectedAccountId={selectedInvestmentAccount}
                onAccountChange={(accountId) =>
                  setSelectedInvestmentAccount(accountId === "all" ? undefined : accountId)
                }
              />
            </div>
          </section>
        </>
      )}

      <AccountCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => setRefreshKey((current) => current + 1)}
      />
    </div>
  );
};

export default DashboardPage;

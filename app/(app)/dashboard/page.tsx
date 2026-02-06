"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TARGET_NET_WORTH_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { formatCategoryDisplay } from "@/lib/account-categories";
import { startOfMonth, endOfDay } from "date-fns";
import { DashboardDateSelector, type DashboardDateRange } from "@/components/dashboard/dashboard-date-selector";
import { FinancialHealthScore } from "@/components/dashboard/financial-health-score";
import { CashFlowSankeyChart } from "@/components/dashboard/cash-flow-sankey-chart";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { UpcomingBills } from "@/components/dashboard/upcoming-bills";
import { InvestmentPerformanceChart } from "@/components/dashboard/investment-performance-chart";

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

interface ExpensesIncomesData {
  expenses: number;
  incomes: number;
  expensesChange: number;
  incomesChange: number;
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

interface UpcomingBill {
  id: string;
  merchant: string;
  category: string;
  amount: number;
  dueDate: Date;
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
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>("USD");
  
  // Date range state - default to current month
  const [dateRange, setDateRange] = useState<DashboardDateRange>(() => {
    const now = new Date();
    return {
      startDate: startOfMonth(now),
      endDate: endOfDay(now),
    };
  });

  // Dashboard data states
  const [expensesIncomes, setExpensesIncomes] = useState<ExpensesIncomesData | null>(null);
  const [cashFlowSankeyData, setCashFlowSankeyData] = useState<CashFlowSankeyData | null>(null);
  const [spendingData, setSpendingData] = useState<SpendingData | null>(null);
  const [investmentData, setInvestmentData] = useState<InvestmentPerformanceData | null>(null);
  const [upcomingBills, setUpcomingBills] = useState<UpcomingBill[]>([]);
  const [investmentAccounts, setInvestmentAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedInvestmentAccount, setSelectedInvestmentAccount] = useState<string | undefined>(undefined);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);

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
  }, []);

  // Fetch dashboard insights data
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!data) return;

      setIsLoadingDashboard(true);
      try {
        const startDateStr = dateRange.startDate.toISOString().split("T")[0];
        const endDateStr = dateRange.endDate.toISOString().split("T")[0];

        // Fetch all dashboard data in parallel
        const [cashFlowSankeyRes, spendingRes, investmentRes, transactionsRes] = await Promise.all([
          apiClient.get<CashFlowSankeyData>(
            `/api/dashboard/cash-flow-sankey?startDate=${startDateStr}&endDate=${endDateStr}&currency=${selectedCurrency}`
          ).catch(() => null),
          apiClient.get<SpendingData>(
            `/api/dashboard/spending?startDate=${startDateStr}&endDate=${endDateStr}&currency=${selectedCurrency}`
          ).catch(() => null),
          apiClient.get<InvestmentPerformanceData>(
            `/api/dashboard/investment-performance?startDate=${startDateStr}&endDate=${endDateStr}&currency=${selectedCurrency}${selectedInvestmentAccount ? `&accountId=${selectedInvestmentAccount}` : ""}`
          ).catch(() => null) as Promise<InvestmentPerformanceData | null>,
          apiClient.get<Array<{ id: string; type: string; category: string; amount: number; description: string | null; date: string; accountId: string }>>(
            `/api/transactions`
          ).catch(() => null),
        ]);

        if (cashFlowSankeyRes) {
          setCashFlowSankeyData(cashFlowSankeyRes);
          // Calculate expenses and incomes for the net worth card
          setExpensesIncomes({
            expenses: cashFlowSankeyRes.expenses,
            incomes: cashFlowSankeyRes.income,
            expensesChange: 4.8, // Placeholder
            incomesChange: 3.2, // Placeholder
          });
        }

        if (spendingRes) {
          setSpendingData(spendingRes);
        }

        if (investmentRes) {
          setInvestmentData(investmentRes);
        }

        // Calculate upcoming bills from transactions
        if (transactionsRes) {
          const subscriptionCategories = ["Subscriptions", "Rent & Utilities"];
          const subscriptionTransactions = transactionsRes
            .filter((tx) => tx.type === "debit" && subscriptionCategories.includes(tx.category))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          // Group by merchant/description and calculate next due date
          const billsMap = new Map<string, UpcomingBill>();
          subscriptionTransactions.forEach((tx) => {
            const merchant = tx.description || tx.category;
            const key = `${merchant}-${tx.category}`;
            
            if (!billsMap.has(key)) {
              const lastDate = new Date(tx.date);
              // Assume monthly recurring - calculate next occurrence
              const nextDate = new Date(lastDate);
              nextDate.setMonth(nextDate.getMonth() + 1);
              
              // Get account currency
              const account = data.accounts.find((acc) => acc.id === tx.accountId);
              const currency = account?.currency || selectedCurrency;

              billsMap.set(key, {
                id: tx.id,
                merchant,
                category: tx.category,
                amount: tx.amount,
                dueDate: nextDate,
                currency,
              });
            }
          });

          const bills = Array.from(billsMap.values())
            .filter((bill) => bill.dueDate >= new Date())
            .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
            .slice(0, 7);

          setUpcomingBills(bills);
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
  }, [data, dateRange, selectedCurrency, selectedInvestmentAccount]);

  

  const hasData = data && data.accounts.length > 0;
  const netWorthSummary = data?.netWorthByCurrency[selectedCurrency];
  const ratesLabel = data ? formatRateTimestamp(data.lastRatesUpdatedAt) : "";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your financial insights at a glance</p>
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
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your financial insights at a glance</p>
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your financial insights at a glance</p>
        </div>
        <DashboardDateSelector value={dateRange} onChange={setDateRange} />
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No accounts yet</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Start tracking your net worth by adding your first account.
            </p>
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

          {/* Responsive Grid Layout */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Net Worth Card - Enhanced */}
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    {ratesLabel}
                    {data?.isRatesStale && (
                      <span className="text-xs text-amber-600">(stale)</span>
                    )}
                  </CardDescription>
                </div>
                <ToggleGroup
                  type="single"
                  value={selectedCurrency}
                  onValueChange={(value) => {
                    if (value) {
                      setSelectedCurrency(value as SupportedCurrency);
                    }
                  }}
                  variant="outline"
                  size="sm"
                  spacing={0}
                >
                  {TARGET_NET_WORTH_CURRENCIES.map((currency) => (
                    <ToggleGroupItem key={currency} value={currency}>
                      {currency}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </CardHeader>
              <CardContent>
                {data?.hasUnsupportedCurrencies || !netWorthSummary ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    Set a supported currency for every account to view net worth totals.
                  </div>
                ) : (
                  <>
                    <div
                      className={`text-3xl font-bold ${
                        netWorthSummary.netWorth >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatNetWorthCurrency(netWorthSummary.netWorth, netWorthSummary.currency)}
                    </div>
                    
                    {/* Expenses and Incomes Breakdown */}
                    {expensesIncomes && (() => {
                      // Calculate percentages relative to the maximum value
                      const maxValue = Math.max(expensesIncomes.expenses, expensesIncomes.incomes);
                      const expensesPercentage = maxValue > 0 
                        ? (expensesIncomes.expenses / maxValue) * 100 
                        : 0;
                      const incomesPercentage = maxValue > 0 
                        ? (expensesIncomes.incomes / maxValue) * 100 
                        : 0;
                      
                      return (
                        <div className="mt-6 space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Expenses</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {formatCurrency(expensesIncomes.expenses, selectedCurrency, 2)}
                                </span>
                                <span className="text-xs text-green-600">
                                  +{expensesIncomes.expensesChange.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            {/* Mini bar chart */}
                            <div className="h-2 w-full rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-red-500 transition-all duration-300"
                                style={{ width: `${Math.min(expensesPercentage, 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Incomes</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {formatCurrency(expensesIncomes.incomes, selectedCurrency, 2)}
                                </span>
                                <span className="text-xs text-green-600">
                                  +{expensesIncomes.incomesChange.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            {/* Mini bar chart */}
                            <div className="h-2 w-full rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-green-500 transition-all duration-300"
                                style={{ width: `${Math.min(incomesPercentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Assets, Liabilities, and P/L as separate sub-cards */}
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {/* Assets Card */}
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex flex-col items-center gap-2">
                            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <ArrowUpRight className="h-4 w-4 text-green-500" />
                              Assets
                            </span>
                            <span className="text-xl font-bold text-green-600">
                              {formatNetWorthCurrency(netWorthSummary.totalAssets, netWorthSummary.currency)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Liabilities Card */}
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex flex-col items-center gap-2">
                            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <ArrowDownRight className="h-4 w-4 text-red-500" />
                              Liabilities
                            </span>
                            <span className="text-xl font-bold text-red-600">
                              {formatNetWorthCurrency(netWorthSummary.totalLiabilities, netWorthSummary.currency)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Investment P/L Card */}
                      {netWorthSummary.totalProfitLoss !== 0 && (
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex flex-col items-center gap-2">
                              <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                {netWorthSummary.totalProfitLoss >= 0 ? (
                                  <TrendingUp className="h-4 w-4 text-green-500" />
                                ) : (
                                  <TrendingDown className="h-4 w-4 text-red-500" />
                                )}
                                Investment P/L
                              </span>
                              <span
                                className={`text-xl font-bold ${
                                  netWorthSummary.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {netWorthSummary.totalProfitLoss >= 0 ? "+" : ""}
                                {formatNetWorthCurrency(netWorthSummary.totalProfitLoss, netWorthSummary.currency)}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Financial Health Score Card */}
            <FinancialHealthScore dateRange={dateRange} />

            {/* Cash Flow Sankey Visualization */}
            <CashFlowSankeyChart
              dateRange={dateRange}
              isLoading={isLoadingDashboard}
              data={cashFlowSankeyData}
            />

            {/* Net Spending Card */}
            <SpendingChart
              dateRange={dateRange}
              currency={selectedCurrency}
              isLoading={isLoadingDashboard}
              data={spendingData || undefined}
            />

            {/* Upcoming Bills */}
            <UpcomingBills isLoading={isLoadingDashboard} bills={upcomingBills} />

            {/* Investment Performance */}
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
        </>
      )}
    </div>
  );
};

export default DashboardPage;

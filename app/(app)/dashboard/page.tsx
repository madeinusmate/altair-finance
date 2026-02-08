"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TARGET_NET_WORTH_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { startOfMonth, endOfDay, subMonths, startOfDay, format } from "date-fns";
import { DashboardDateSelector, type DashboardDateRange } from "@/components/dashboard/dashboard-date-selector";
import { MonthlyIncomeExpensesChart } from "@/components/dashboard/monthly-income-expenses-chart";
import { CashFlowSankeyChart } from "@/components/dashboard/cash-flow-sankey-chart";
import { SpendingChart } from "@/components/dashboard/spending-chart";
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
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>("USD");
  const [username, setUsername] = useState<string | null>(null);

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
  const [expensesIncomes, setExpensesIncomes] = useState<ExpensesIncomesData | null>(null);
  const [cashFlowSankeyData, setCashFlowSankeyData] = useState<CashFlowSankeyData | null>(null);
  const [spendingData, setSpendingData] = useState<SpendingData | null>(null);
  const [investmentData, setInvestmentData] = useState<InvestmentPerformanceData | null>(null);
  const [monthlyIncomeExpenses, setMonthlyIncomeExpenses] = useState<MonthlyIncomeExpenses[] | null>(null);
  const [investmentAccounts, setInvestmentAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedInvestmentAccount, setSelectedInvestmentAccount] = useState<string | undefined>(undefined);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);

  // Fetch username
  useEffect(() => {
    const fetchUsername = async () => {
      try {
        const data = await apiClient.get<{ username: string | null }>("/api/user/username");
        setUsername(data.username);
      } catch (error) {
        console.error("Failed to fetch username:", error);
      }
    };
    void fetchUsername();
  }, []);

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
          <h1 className="text-3xl font-bold tracking-tight">
            {username ? `Hello ${username} 👋` : "Hello 👋"}
          </h1>
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
          <h1 className="text-3xl font-bold tracking-tight">
            {username ? `Hello ${username} 👋` : "Hello 👋"}
          </h1>
          <p className="text-muted-foreground">Your financial insights at a glance</p>
        </div>
        <div className="flex items-center gap-2">
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
          <DashboardDateSelector value={dateRange} onChange={setDateRange} />
        </div>
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


          <div className="grid grid-cols-4 gap-4">
            {/* Net Worth Tiles */}
            {data?.hasUnsupportedCurrencies || !netWorthSummary ? (
              <Card className="col-span-2 md:col-span-3">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    Set a supported currency for every account to view net worth totals.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Net Worth Tile */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold ${netWorthSummary.netWorth >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                    >
                      {formatNetWorthCurrency(netWorthSummary.netWorth, netWorthSummary.currency)}
                    </div>
                  </CardContent>
                </Card>
                {/* Assets Tile */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4 text-green-500" />
                      Assets
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatNetWorthCurrency(netWorthSummary.totalAssets, netWorthSummary.currency)}
                    </div>
                  </CardContent>
                </Card>
                {/* Liabilities Tile */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <ArrowDownRight className="h-4 w-4 text-red-500" />
                      Liabilities
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {formatNetWorthCurrency(netWorthSummary.totalLiabilities, netWorthSummary.currency)}
                    </div>
                  </CardContent>
                </Card>
                {/* P/L Tile */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {netWorthSummary.totalProfitLoss >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      Investment P/L
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold ${netWorthSummary.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                    >
                      {netWorthSummary.totalProfitLoss >= 0 ? "+" : ""}
                      {formatNetWorthCurrency(netWorthSummary.totalProfitLoss, netWorthSummary.currency)}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Monthly Income & Expenses Chart - First Row */}
            <MonthlyIncomeExpensesChart
              dateRange={dateRange}
              currency={selectedCurrency}
              isLoading={isLoadingDashboard}
              data={monthlyIncomeExpenses || undefined}
            />


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

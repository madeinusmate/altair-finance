"use client";

import { useMemo, useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TARGET_NET_WORTH_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { formatCategoryDisplay } from "@/lib/account-categories";

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

  const groupedAccounts = useMemo(() => {
    if (!data) {
      return [];
    }
    const map = new Map<string, AccountBalance[]>();
    data.accounts.forEach((account) => {
      if (!map.has(account.currency)) {
        map.set(account.currency, []);
      }
      map.get(account.currency)!.push(account);
    });
    return Array.from(map.entries());
  }, [data]);

  const hasData = data && data.accounts.length > 0;
  const netWorthSummary = data?.netWorthByCurrency[selectedCurrency];
  const ratesLabel = data ? formatRateTimestamp(data.lastRatesUpdatedAt) : "";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your net worth at a glance</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
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
          <p className="text-muted-foreground">Your net worth at a glance</p>
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Your net worth at a glance</p>
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
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <ArrowUpRight className="h-3 w-3 text-green-500" />
                        Assets
                      </span>
                      <span className="font-medium text-green-600">
                        {formatNetWorthCurrency(netWorthSummary.totalAssets, netWorthSummary.currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <ArrowDownRight className="h-3 w-3 text-red-500" />
                        Liabilities
                      </span>
                      <span className="font-medium text-red-600">
                        {formatNetWorthCurrency(netWorthSummary.totalLiabilities, netWorthSummary.currency)}
                      </span>
                    </div>
                    {netWorthSummary.totalProfitLoss !== 0 && (
                      <div className="flex items-center justify-between text-sm border-t pt-2 mt-2">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {netWorthSummary.totalProfitLoss >= 0 ? (
                            <TrendingUp className="h-3 w-3 text-green-500" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-red-500" />
                          )}
                          Investment P/L
                        </span>
                        <span
                          className={`font-medium ${
                            netWorthSummary.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {netWorthSummary.totalProfitLoss >= 0 ? "+" : ""}
                          {formatNetWorthCurrency(netWorthSummary.totalProfitLoss, netWorthSummary.currency)}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accounts Summary</CardTitle>
              <CardDescription>
                You have {data.totalAccounts} account{data.totalAccounts !== 1 ? "s" : ""} across{" "}
                {groupedAccounts.length} currenc{groupedAccounts.length !== 1 ? "ies" : "y"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {groupedAccounts.map(([currency, accounts]) => (
                  <div key={currency}>
                    <h4 className="text-sm font-medium mb-3">{currency} Accounts</h4>
                    <div className="space-y-2">
                      {accounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                account.nature === "asset"
                                  ? "bg-green-100 text-green-600"
                                  : "bg-red-100 text-red-600"
                              }`}
                            >
                              {account.nature === "asset" ? (
                                <ArrowUpRight className="h-4 w-4" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{account.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {account.type} account • {formatCategoryDisplay(account.category)} • {account.nature}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className={`text-sm font-medium ${
                                account.nature === "asset" ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {formatCurrency(account.balance, account.currency, 2)}
                            </div>
                            {account.type === "investment" && account.profitLoss !== undefined && (
                              <div className={`text-xs ${account.profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                                P/L: {account.profitLoss >= 0 ? "+" : ""}
                                {formatCurrency(account.profitLoss, account.currency, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default DashboardPage;

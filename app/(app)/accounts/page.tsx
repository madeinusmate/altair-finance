"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { Account } from "@/lib/db/schema";
import { formatCategoryDisplay } from "@/lib/account-categories";
import { AccountCreateDialog } from "@/components/account-create-dialog";
import { AccountMark } from "@/components/accounts/account-mark";
import { CurrencySelector } from "@/components/currency-selector";
import { useDisplayCurrencies } from "@/hooks/use-display-currencies";
import { type SupportedCurrency } from "@/lib/currencies";

interface AccountWithBalance {
  id: string;
  name: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
  currency: string;
  icon?: string | null;
  iconImage?: string | null;
  balance: number;
  netContributions?: number;
  profitLoss?: number;
  updatedAt?: string;
}

interface CurrencyNetWorth {
  currency: SupportedCurrency;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  totalProfitLoss: number;
}

interface NetWorthData {
  netWorthByCurrency?: Record<SupportedCurrency, CurrencyNetWorth>;
  accounts: AccountWithBalance[];
  totalAccounts: number;
  hasUnsupportedCurrencies?: boolean;
  unsupportedCurrencies?: string[];
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatNetWorth = (amount: number, currency: string): string => {
  const decimals = Math.abs(amount) >= 1_000_000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
};

const typeLabels: Record<AccountWithBalance["type"], string> = {
  balance: "Balance",
  transaction: "Transactions",
  investment: "Investment",
};

const toUpdatedLabel = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return format(date, "MMM d");
};

const withUpdatedAt = (account: Account, balance: number, extra?: Pick<AccountWithBalance, "netContributions" | "profitLoss">): AccountWithBalance => {
  const updated = new Date(account.updatedAt);
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    nature: account.nature,
    category: account.category,
    currency: account.currency,
    icon: account.icon,
    iconImage: account.iconImage,
    balance,
    updatedAt: Number.isNaN(updated.getTime()) ? undefined : updated.toISOString(),
    ...extra,
  };
};

const AccountsPage = () => {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [netWorthByCurrency, setNetWorthByCurrency] = useState<Record<SupportedCurrency, CurrencyNetWorth> | null>(null);
  const [hasUnsupportedCurrencies, setHasUnsupportedCurrencies] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { enabledCurrencies, selectedCurrency, selectCurrency, isReady } = useDisplayCurrencies();
  const previousIdsRef = useRef<Set<string> | null>(null);
  const expectEnterRef = useRef(false);
  const [enteredId, setEnteredId] = useState<string | null>(null);

  const applyNetWorth = async (result: NetWorthData) => {
    const allAccounts = result.accounts ?? [];
    if (allAccounts.length === 0 && result.totalAccounts > 0) {
      console.warn("Net-worth API returned no accounts but totalAccounts > 0, fetching directly from accounts API");
      const directAccounts = await apiClient.get<Account[]>("/api/accounts");
      setAccounts(
        directAccounts.map((acc) =>
          withUpdatedAt(
            acc,
            acc.initialBalance,
            acc.type === "investment" ? { netContributions: 0, profitLoss: 0 } : undefined
          )
        )
      );
      setNetWorthByCurrency(null);
      setHasUnsupportedCurrencies(false);
      return;
    }

    setAccounts(allAccounts);
    setNetWorthByCurrency(result.netWorthByCurrency ?? null);
    setHasUnsupportedCurrencies(Boolean(result.hasUnsupportedCurrencies));
  };

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const result = await apiClient.get<NetWorthData>("/api/net-worth");
        await applyNetWorth(result);
      } catch (err) {
        console.error("Error fetching accounts:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch accounts");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  const handleAccountCreated = () => {
    expectEnterRef.current = true;
    const fetchAccounts = async () => {
      try {
        const result = await apiClient.get<NetWorthData>("/api/net-worth");
        await applyNetWorth(result);
      } catch (err) {
        console.error("Error fetching accounts:", err);
      }
    };
    fetchAccounts();
  };

  useEffect(() => {
    const ids = new Set(accounts.map((account) => account.id));
    if (expectEnterRef.current && previousIdsRef.current) {
      const added = accounts.find((account) => !previousIdsRef.current?.has(account.id));
      setEnteredId(added?.id ?? null);
      expectEnterRef.current = false;
    }
    previousIdsRef.current = ids;
  }, [accounts]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Accounts</h1>
            <p className="text-muted-foreground">Manage your financial accounts</p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Accounts</h1>
            <p className="text-muted-foreground">Manage your financial accounts</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group accounts by Asset, Liability, and Investment
  const groupedAccounts = accounts.reduce((acc, account) => {
    if (account.type === "investment") {
      if (!acc.investment) {
        acc.investment = [];
      }
      acc.investment.push(account);
    } else if (account.nature === "asset") {
      if (!acc.asset) {
        acc.asset = [];
      }
      acc.asset.push(account);
    } else if (account.nature === "liability") {
      if (!acc.liability) {
        acc.liability = [];
      }
      acc.liability.push(account);
    }
    return acc;
  }, {} as Record<"asset" | "liability" | "investment", AccountWithBalance[]>);

  const groupLabels: Record<"asset" | "liability" | "investment", string> = {
    asset: "Assets",
    liability: "Liabilities",
    investment: "Investments",
  };

  const groupOrder: ("asset" | "liability" | "investment")[] = ["asset", "liability", "investment"];

  const renderAccountRow = (account: AccountWithBalance) => {
    const updatedLabel = toUpdatedLabel(account.updatedAt);
    const balanceLabel =
      account.nature === "liability" && account.balance < 0
        ? `${formatCurrency(Math.abs(account.balance), account.currency)} credit`
        : formatCurrency(account.balance, account.currency);

    return (
      <li key={account.id} className={account.id === enteredId ? "altair-account-enter" : undefined}>
        <Link
          href={`/accounts/${account.id}`}
          className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted"
        >
          <div className="flex min-w-0 items-center gap-3">
            <AccountMark name={account.name} icon={account.icon} iconImage={account.iconImage} />
            <div className="min-w-0">
            <p className="truncate font-semibold">{account.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {formatCategoryDisplay(account.category)} · {typeLabels[account.type]}
              {updatedLabel ? ` · Updated ${updatedLabel}` : ""}
            </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-normal tabular-nums tracking-[-0.02em]">{balanceLabel}</p>
            {account.type === "investment" && account.profitLoss !== undefined && (
              <p className="flex items-center justify-end gap-1 text-sm tabular-nums text-muted-foreground">
                {account.profitLoss >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {account.profitLoss >= 0 ? "+" : ""}
                {formatCurrency(account.profitLoss, account.currency)}
              </p>
            )}
          </div>
        </Link>
      </li>
    );
  };

  const summary = netWorthByCurrency?.[selectedCurrency] ?? null;
  const totalLabel =
    summary && !hasUnsupportedCurrencies ? formatNetWorth(summary.netWorth, summary.currency) : null;

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Accounts</h1>
            <p className="text-muted-foreground">Manage your financial accounts</p>
          </div>
          <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1 sm:justify-end">
            {isReady && totalLabel ? (
              <CurrencySelector
                currencies={enabledCurrencies}
                value={selectedCurrency}
                onChange={selectCurrency}
              />
            ) : null}
            <Button className="h-10 shrink-0" onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </div>
        </div>
        {accounts.length > 0 && (totalLabel || hasUnsupportedCurrencies) ? (
          totalLabel ? (
            <div>
              <p className="text-sm text-muted-foreground">Net worth</p>
              <p className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{totalLabel}</p>
            </div>
          ) : (
            <p className="max-w-md text-sm text-muted-foreground">
              Set a supported currency for every account to view the total.
            </p>
          )
        ) : null}
      </div>

      {accounts.length === 0 ? (
        <Card className="altair-fade-in">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No accounts yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Add your first account to start tracking your net worth.
            </p>
            <div className="flex flex-col gap-2 items-center">
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Account
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {groupOrder.map((group) => {
            const accountsInGroup = groupedAccounts[group] || [];
            if (accountsInGroup.length === 0) return null;
            const filledGroupCount = groupOrder.filter(
              (name) => (groupedAccounts[name] || []).length > 0
            ).length;

            return (
              <div
                key={group}
                className={`space-y-3 ${filledGroupCount === 1 ? "xl:col-span-2" : ""}`}
              >
                <h2 className="px-1 text-[22px] font-semibold tracking-[-0.02em]">{groupLabels[group]}</h2>
                <div className="overflow-hidden rounded-[20px] bg-card">
                  <ul className="divide-y divide-border">
                    {accountsInGroup.map((account) => renderAccountRow(account))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AccountCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleAccountCreated}
      />
    </div>
  );
};

export default AccountsPage;

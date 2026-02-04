"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Wallet, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Link2 } from "lucide-react";
import { Account } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { formatCategoryDisplay } from "@/lib/account-categories";
import { ConnectionIndicator } from "@/components/open-banking/connection-indicator";

interface AccountWithBalance {
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

interface NetWorthData {
  accounts: AccountWithBalance[];
  totalAccounts: number;
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const AccountsPage = () => {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        // Fetch from net-worth API to get calculated balances and profit/loss
        const result = await apiClient.get<NetWorthData>("/api/net-worth");
        const allAccounts = result.accounts ?? [];
        
        // Ensure we have accounts - if net-worth returns empty but we have totalAccounts > 0,
        // there might be an issue with the calculation
        if (allAccounts.length === 0 && result.totalAccounts > 0) {
          console.warn("Net-worth API returned no accounts but totalAccounts > 0, fetching directly from accounts API");
          // Fallback to direct accounts API
          const directAccounts = await apiClient.get<Account[]>("/api/accounts");
          // Convert to AccountWithBalance format with default values
          const accountsWithDefaults: AccountWithBalance[] = directAccounts.map((acc) => ({
            id: acc.id,
            name: acc.name,
            type: acc.type as "balance" | "transaction" | "investment",
            nature: acc.nature as "asset" | "liability",
            category: acc.category,
            currency: acc.currency,
            balance: acc.initialBalance,
            ...(acc.type === "investment" && { netContributions: 0, profitLoss: 0 }),
          }));
          setAccounts(accountsWithDefaults);
        } else {
          setAccounts(allAccounts);
        }
      } catch (err) {
        console.error("Error fetching accounts:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch accounts");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
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
            <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
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

  const isOpenBankingEnabled = process.env.NEXT_PUBLIC_OPEN_BANKING_ENABLED === "true";
  const hasTransactionAccounts = accounts.some(acc => acc.type === "transaction");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">Manage your financial accounts</p>
        </div>
        <div className="flex gap-2">
          {isOpenBankingEnabled && hasTransactionAccounts && (
            <Button asChild variant="outline">
              <Link href="/accounts/connect">
                <Link2 className="mr-2 h-4 w-4" />
                Connect Bank
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/accounts/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Link>
          </Button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No accounts yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Add your first account to start tracking your net worth.
            </p>
            <div className="flex flex-col gap-2 items-center">
              <Button asChild>
                <Link href="/accounts/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Account
                </Link>
              </Button>
              {isOpenBankingEnabled && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/accounts/connect">
                    <Link2 className="mr-2 h-4 w-4" />
                    Connect Bank
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Accounts</CardTitle>
            <CardDescription>
              {accounts.length} account{accounts.length !== 1 ? "s" : ""} total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Nature</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link
                        href={`/accounts/${account.id}`}
                        className="flex items-center gap-3 font-medium hover:underline"
                      >
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
                        {account.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {account.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {formatCategoryDisplay(account.category)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={account.nature === "asset" ? "default" : "destructive"}
                        className="capitalize"
                      >
                        {account.nature}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{account.currency}</Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${
                      account.nature === "asset" 
                        ? "text-green-600" 
                        : account.balance < 0 
                          ? "text-green-600" 
                          : "text-red-600"
                    }`}>
                      {account.nature === "liability" && account.balance < 0 
                        ? `${formatCurrency(Math.abs(account.balance), account.currency)} credit`
                        : formatCurrency(account.balance, account.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {account.type === "investment" && account.profitLoss !== undefined ? (
                        <div className={`flex items-center justify-end gap-1 font-medium ${
                          account.profitLoss >= 0 ? "text-green-600" : "text-red-600"
                        }`}>
                          {account.profitLoss >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {account.profitLoss >= 0 ? "+" : ""}
                          {formatCurrency(account.profitLoss, account.currency)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AccountsPage;

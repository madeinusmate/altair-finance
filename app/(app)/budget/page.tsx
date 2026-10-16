"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Wallet } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencySelector } from "@/components/currency-selector";
import { useDisplayCurrencies } from "@/hooks/use-display-currencies";
import { BudgetCategoryList } from "@/components/budget/budget-category-list";
import { BudgetGaugeChart } from "@/components/budget/budget-gauge-chart";
import { MonthSelector } from "@/components/budget/month-selector";
import { segmentedTrackClassName } from "@/lib/ui/segmented";
import { cn } from "@/lib/utils";
import type { BudgetPace } from "@/lib/budget/resolve-month";

interface BudgetWithSpending {
  id: string | null;
  categoryId: number;
  categoryName: string;
  amount: number;
  currency: string;
  spent: number;
  remaining: number;
  overAmount: number;
  percentageUsed: number;
  isOverBudget: boolean;
  inherited: boolean;
  inheritedFrom: string | null;
  pace: BudgetPace | null;
}

interface BudgetsResponse {
  budgets: BudgetWithSpending[];
  unbudgeted: Array<{ categoryId: number; categoryName: string; spent: number }>;
  unbudgetedSpent: number;
  overallBudget: number;
  overallSpent: number;
  overallRemaining: number;
  overallPercentageUsed: number;
  currency: string;
  month: string;
  pace: BudgetPace | null;
}

interface DebitCategory {
  id: number;
  name: string;
  transactionType: "debit" | "credit" | null;
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const BudgetPage = () => {
  const { enabledCurrencies, selectedCurrency, selectCurrency, isReady } = useDisplayCurrencies();
  const [selectedMonth, setSelectedMonth] = useState<string>(() => format(new Date(), "yyyy-MM"));
  const [budgetsData, setBudgetsData] = useState<BudgetsResponse | null>(null);
  const [categories, setCategories] = useState<DebitCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isCurrentMonth = selectedMonth === format(new Date(), "yyyy-MM");

  const fetchBudgets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [budgetsRes, categoriesRes] = await Promise.all([
        apiClient.get<BudgetsResponse>(
          `/api/budgets?currency=${selectedCurrency}&month=${selectedMonth}`,
        ),
        apiClient.get<{ categories: DebitCategory[] }>("/api/transaction-categories?type=debit"),
      ]);

      setBudgetsData(budgetsRes);
      setCategories(categoriesRes.categories.filter((category) => category.transactionType === "debit"));
    } catch (err: unknown) {
      console.error("Error fetching budgets:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to load budgets";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void fetchBudgets();
  }, [selectedCurrency, selectedMonth, isReady]);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Budget</h1>
          <p className="text-muted-foreground">Manage your monthly budgets</p>
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
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Budget</h1>
            <p className="text-muted-foreground">Manage your monthly budgets</p>
          </div>
          <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1 sm:justify-end">
            {isReady ? (
              <CurrencySelector
                currencies={enabledCurrencies}
                value={selectedCurrency}
                onChange={selectCurrency}
              />
            ) : null}
            <div className={cn(segmentedTrackClassName, "ml-auto shrink-0 sm:ml-0")}>
              <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="mx-auto w-full max-w-[320px]">
            <Skeleton className="aspect-square w-full rounded-full" />
            <Skeleton className="mx-auto mt-4 h-4 w-48" />
          </div>
        ) : budgetsData && budgetsData.overallBudget > 0 ? (
          <BudgetGaugeChart
            remaining={budgetsData.overallRemaining}
            budget={budgetsData.overallBudget}
            spent={budgetsData.overallSpent}
            unbudgetedSpent={budgetsData.unbudgetedSpent}
            percentageUsed={budgetsData.overallPercentageUsed}
            currency={budgetsData.currency}
            pace={isCurrentMonth ? budgetsData.pace : null}
          />
        ) : budgetsData ? (
          <div>
            <p className="text-sm text-muted-foreground">Left to spend</p>
            <p className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.04em] text-muted-foreground sm:text-[40px]">
              Set a budget
            </p>
            {budgetsData.unbudgetedSpent !== 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Unbudgeted {formatCurrency(budgetsData.unbudgetedSpent, budgetsData.currency)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-7 w-48" />
          <div className="overflow-hidden rounded-[20px] bg-card">
            {[1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-16 w-full rounded-none" />
            ))}
          </div>
        </div>
      ) : budgetsData ? (
        <BudgetCategoryList
          budgets={budgetsData.budgets}
          debitCategories={categories}
          unbudgeted={budgetsData.unbudgeted}
          yearMonth={selectedMonth}
          currency={budgetsData.currency}
          onRefresh={fetchBudgets}
          enabledCurrencies={enabledCurrencies}
        />
      ) : (
        <Card className="altair-fade-in">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
            <h3 className="mb-2 text-lg font-semibold">No budgets yet</h3>
            <p className="max-w-sm text-center text-muted-foreground">
              Start tracking your spending by creating your first budget for a category.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BudgetPage;

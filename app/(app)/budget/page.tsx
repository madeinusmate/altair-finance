"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDisplayCurrencies } from "@/hooks/use-display-currencies";
import { format, startOfMonth, endOfDay } from "date-fns";
import { BudgetSummaryCard } from "@/components/budget/budget-summary-card";
import { BudgetCategoryList } from "@/components/budget/budget-category-list";
import { BudgetCharts } from "@/components/budget/budget-charts";
import { MonthSelector } from "@/components/budget/month-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet } from "lucide-react";

interface BudgetWithSpending {
  id: string;
  categoryName: string;
  amount: number;
  currency: string;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
}

interface BudgetsResponse {
  budgets: BudgetWithSpending[];
  overallBudget: number;
  overallSpent: number;
  overallRemaining: number;
  overallPercentageUsed: number;
  currency: string;
  month: string;
}

const BudgetPage = () => {
  const { enabledCurrencies, selectedCurrency, selectCurrency, isReady } = useDisplayCurrencies();
  const [selectedMonth, setSelectedMonth] = useState<string>(() => format(new Date(), "yyyy-MM"));
  const [budgetsData, setBudgetsData] = useState<BudgetsResponse | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isCurrentMonth = selectedMonth === format(new Date(), "yyyy-MM");
  const isPastMonth = selectedMonth < format(new Date(), "yyyy-MM");

  // Fetch budgets data
  const fetchBudgets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [budgetsRes, categoriesRes] = await Promise.all([
        apiClient.get<BudgetsResponse>(
          `/api/budgets?currency=${selectedCurrency}&month=${selectedMonth}`
        ),
        apiClient.get<{ categories: Array<{ name: string }> }>("/api/transaction-categories"),
      ]);

      setBudgetsData(budgetsRes);
      setCategories(categoriesRes.categories.map((c) => c.name));
    } catch (err: unknown) {
      console.error("Error fetching budgets:", err);
      const errorMessage = err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object" && "data" in err.response && err.response.data && typeof err.response.data === "object" && "error" in err.response.data && typeof err.response.data.error === "string" ? err.response.data.error : "Failed to load budgets";
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Budget</h1>
          <p className="text-muted-foreground">Manage your monthly budgets</p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={selectedCurrency}
            onValueChange={(value) => {
              if (value) {
                selectCurrency(value);
              }
            }}
            variant="outline"
            size="sm"
            spacing={0}
          >
            {isReady
              ? enabledCurrencies.map((currency) => (
                  <ToggleGroupItem key={currency} value={currency}>
                    {currency}
                  </ToggleGroupItem>
                ))
              : null}
          </ToggleGroup>
          <MonthSelector value={selectedMonth} onChange={setSelectedMonth} disabled={false} />
        </div>
      </div>



      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : budgetsData ? (
        <>
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <BudgetSummaryCard
              overallBudget={budgetsData.overallBudget}
              overallSpent={budgetsData.overallSpent}
              overallRemaining={budgetsData.overallRemaining}
              overallPercentageUsed={budgetsData.overallPercentageUsed}
              currency={budgetsData.currency}
              isLoading={isLoading}
            />


            <BudgetCharts
              budgets={budgetsData.budgets}
              overallBudget={budgetsData.overallBudget}
              overallSpent={budgetsData.overallSpent}
              overallPercentageUsed={budgetsData.overallPercentageUsed}
              month={budgetsData.month}
              currency={budgetsData.currency}
              isLoading={isLoading}
            />

          </div>

          <BudgetCategoryList
            budgets={budgetsData.budgets}
            allCategories={categories}
            currency={budgetsData.currency}
            overallBudget={budgetsData.overallBudget}
            isLoading={isLoading}
            onRefresh={fetchBudgets}
            enabledCurrencies={enabledCurrencies}
          />
        </>
      ) : (
        <Card className="netly-fade-in">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No budgets yet</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Start tracking your spending by creating your first budget for a category.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BudgetPage;

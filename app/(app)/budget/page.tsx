"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TARGET_NET_WORTH_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
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
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>("USD");
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
    } catch (err: any) {
      console.error("Error fetching budgets:", err);
      setError(err?.response?.data?.error || "Failed to load budgets");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, [selectedCurrency, selectedMonth]);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budget</h1>
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budget</h1>
          <p className="text-muted-foreground">Manage your monthly budgets</p>
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
          <div className="grid gap-4 grid-cols-2">
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
          />
        </>
      ) : (
        <Card>
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

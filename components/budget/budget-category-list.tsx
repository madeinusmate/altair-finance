"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { BudgetEditDialog } from "./budget-edit-dialog";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { budgetMonthLabel, type BudgetPace } from "@/lib/budget/resolve-month";

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

interface DebitCategory {
  id: number;
  name: string;
}

interface UnbudgetedSpend {
  categoryId: number;
  categoryName: string;
  spent: number;
}

interface BudgetCategoryListProps {
  budgets: BudgetWithSpending[];
  debitCategories: DebitCategory[];
  unbudgeted: UnbudgetedSpend[];
  yearMonth: string;
  currency: string;
  isLoading?: boolean;
  onRefresh: () => void;
  enabledCurrencies?: readonly SupportedCurrency[];
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const paceLabel = (pace: BudgetPace): string => (pace === "ahead" ? "Ahead" : "On track");

export const BudgetCategoryList = ({
  budgets,
  debitCategories,
  unbudgeted,
  yearMonth,
  currency,
  isLoading,
  onRefresh,
  enabledCurrencies = SUPPORTED_CURRENCIES,
}: BudgetCategoryListProps) => {
  const [editingBudget, setEditingBudget] = useState<BudgetWithSpending | null>(null);
  const [creatingCategory, setCreatingCategory] = useState<DebitCategory | null>(null);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [deletingBudget, setDeletingBudget] = useState<BudgetWithSpending | null>(null);
  const monthName = budgetMonthLabel(yearMonth, "MMMM");

  const handleDelete = async () => {
    if (!deletingBudget?.id) return;

    try {
      await apiClient.delete(`/api/budgets/${deletingBudget.id}`);
      toast.success("Budget deleted successfully");
      onRefresh();
      setDeletingBudget(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete budget";
      toast.error(errorMessage);
    }
  };

  const budgetedIds = new Set(budgets.map((budget) => budget.categoryId));
  const unbudgetedSpend = new Map(unbudgeted.map((row) => [row.categoryId, row.spent]));
  const categoriesWithoutBudgets = debitCategories.filter((category) => !budgetedIds.has(category.id));

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <div className="overflow-hidden rounded-[20px] bg-card">
          {[1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-16 w-full rounded-none" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 text-[22px] font-semibold tracking-[-0.02em]">Category budgets</h2>
          {debitCategories.length > 0 ? (
            <Button onClick={() => setPickingCategory(true)}>
              <Plus aria-hidden="true" />
              Set budget
            </Button>
          ) : null}
        </div>

        {debitCategories.length === 0 ? (
          <div className="overflow-hidden rounded-[20px] bg-card px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">No categories available</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create transaction categories in Settings to set budgets
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] bg-card">
            <ul className="divide-y divide-border">
              {budgets.map((budget) => {
                const detail = [`${formatCurrency(budget.spent, currency)} of ${formatCurrency(budget.amount, currency)}`];
                if (budget.pace) {
                  detail.push(paceLabel(budget.pace));
                }

                return (
                  <li key={budget.categoryId} className="flex items-center pr-2 transition-colors hover:bg-muted">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start gap-1 py-3 pl-4 pr-3 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pr-2"
                      onClick={() => setEditingBudget(budget)}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{budget.categoryName}</p>
                        <p className="text-pretty text-xs text-muted-foreground">{detail.join(" · ")}</p>
                        {budget.inherited && budget.inheritedFrom ? (
                          <p className="text-pretty text-xs text-muted-foreground">
                            Carried forward from {budgetMonthLabel(budget.inheritedFrom, "MMM yyyy")}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 sm:text-right">
                        <p className="font-normal tabular-nums tracking-[-0.02em]">
                          {formatCurrency(budget.remaining, currency)}
                        </p>
                        {budget.overAmount > 0 ? (
                          <p className="text-xs tabular-nums text-muted-foreground">
                            Over {formatCurrency(budget.overAmount, currency)}
                          </p>
                        ) : null}
                      </div>
                    </button>
                    {budget.id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={`Delete ${budget.categoryName} budget`}
                        onClick={() => setDeletingBudget(budget)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
              {categoriesWithoutBudgets.map((category) => {
                const spent = unbudgetedSpend.get(category.id) ?? 0;
                return (
                  <li key={category.id} className="flex items-center pr-2 transition-colors hover:bg-muted">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start gap-1 py-3 pl-4 pr-3 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pr-2"
                      onClick={() => setCreatingCategory(category)}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{category.name}</p>
                        <p className="truncate text-xs text-muted-foreground">No budget</p>
                      </div>
                      <p className="shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                        {formatCurrency(spent, currency)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <BudgetEditDialog
        open={editingBudget !== null || creatingCategory !== null || pickingCategory}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBudget(null);
            setCreatingCategory(null);
            setPickingCategory(false);
          }
        }}
        budget={editingBudget || undefined}
        categoryId={creatingCategory?.id}
        categoryName={creatingCategory?.name}
        yearMonth={yearMonth}
        currencies={enabledCurrencies}
        defaultCurrency={currency}
        onSuccess={onRefresh}
      />

      <AlertDialog open={deletingBudget !== null} onOpenChange={(open) => !open && setDeletingBudget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the {monthName} budget for {deletingBudget?.categoryName}? This month will show the
              earlier cap again when one exists. Other months stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

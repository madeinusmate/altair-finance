"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { BudgetEditDialog } from "./budget-edit-dialog";
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
import { cn } from "@/lib/utils";
import { BudgetBar } from "@/components/budget/budget-bar";
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
  overallBudget: number;
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
  overallBudget,
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
      <Card>
        <CardHeader>
          <CardTitle>Category Budgets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 w-full bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Category Budgets</CardTitle>
            {debitCategories.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setPickingCategory(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Set budget
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {debitCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground mb-4">No categories available</p>
              <p className="text-xs text-muted-foreground text-center">
                Create transaction categories in Settings to set budgets
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Allocation</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((budget) => {
                  const allocationPercentage = overallBudget > 0 ? (budget.amount / overallBudget) * 100 : 0;

                  return (
                    <TableRow key={budget.categoryId}>
                      <TableCell className="font-medium">
                        <div>{budget.categoryName}</div>
                        {budget.inherited && budget.inheritedFrom ? (
                          <p className="text-xs font-normal text-muted-foreground">
                            Carried forward from {budgetMonthLabel(budget.inheritedFrom, "MMM yyyy")}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(budget.amount, currency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {allocationPercentage.toFixed(1)}%
                      </TableCell>
                      <TableCell className={cn("text-right", budget.isOverBudget ? "text-foreground" : "text-muted-foreground")}>
                        {formatCurrency(budget.spent, currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div>{formatCurrency(budget.remaining, currency)}</div>
                        {budget.overAmount > 0 ? (
                          <p className="text-xs text-muted-foreground">Over {formatCurrency(budget.overAmount, currency)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <BudgetBar percentage={budget.percentageUsed} />
                          <span className="text-xs text-muted-foreground">
                            {budget.percentageUsed.toFixed(1)}%
                            {budget.pace ? ` · ${paceLabel(budget.pace)}` : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingBudget(budget)}
                            aria-label={`Set ${monthName} budget`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {budget.id ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingBudget(budget)}
                              aria-label="Delete budget"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {categoriesWithoutBudgets.map((category) => {
                  const spent = unbudgetedSpend.get(category.id) ?? 0;
                  return (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">No budget</TableCell>
                      <TableCell className="text-right text-muted-foreground">-</TableCell>
                      <TableCell className="text-right">{formatCurrency(spent, currency)}</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCreatingCategory(category)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Set budget
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

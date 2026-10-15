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

interface BudgetWithSpending {
  id: string;
  categoryId: number;
  categoryName: string;
  amount: number;
  currency: string;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
}

interface BudgetCategoryOption {
  id: number;
  name: string;
}

interface BudgetCategoryListProps {
  budgets: BudgetWithSpending[];
  allCategories: BudgetCategoryOption[];
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

const getStatusColor = (percentage: number): string => {
  if (percentage > 100) {
    return "text-foreground";
  }
  return "text-muted-foreground";
};

export const BudgetCategoryList = ({
  budgets,
  allCategories,
  currency,
  overallBudget,
  isLoading,
  onRefresh,
  enabledCurrencies = SUPPORTED_CURRENCIES,
}: BudgetCategoryListProps) => {
  const [editingBudget, setEditingBudget] = useState<BudgetWithSpending | null>(null);
  const [creatingCategory, setCreatingCategory] = useState<BudgetCategoryOption | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingBudget, setDeletingBudget] = useState<BudgetWithSpending | null>(null);

  const handleDelete = async () => {
    if (!deletingBudget) return;

    try {
      await apiClient.delete(`/api/budgets/${deletingBudget.id}`);
      toast.success("Budget deleted successfully");
      onRefresh();
      setDeletingBudget(null);
    } catch (error: unknown) {
      const errorMessage = error && typeof error === "object" && "response" in error && error.response && typeof error.response === "object" && "data" in error.response && error.response.data && typeof error.response.data === "object" && "error" in error.response.data && typeof error.response.data.error === "string" ? error.response.data.error : "Failed to delete budget";
      toast.error(errorMessage);
    }
  };

  const budgetMap = new Map(budgets.map((budget) => [budget.categoryId, budget]));
  const categoriesWithoutBudgets = allCategories.filter((category) => !budgetMap.has(category.id));

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
          </div>
        </CardHeader>
        <CardContent>
          {budgets.length === 0 && categoriesWithoutBudgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground mb-4">No categories available</p>
              <p className="text-xs text-muted-foreground text-center">
                Create transaction categories in Settings to set budgets
              </p>
            </div>
          ) : budgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground mb-4">No budgets set yet</p>
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Budget
              </Button>
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
                  const statusColor = getStatusColor(budget.percentageUsed);
                  const allocationPercentage = overallBudget > 0 ? (budget.amount / overallBudget) * 100 : 0;

                  return (
                    <TableRow key={budget.id}>
                      <TableCell className="font-medium">{budget.categoryName}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(budget.amount, currency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {allocationPercentage.toFixed(1)}%
                      </TableCell>
                      <TableCell className={cn("text-right", statusColor)}>
                        {formatCurrency(budget.spent, currency)}
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums"
                      >
                        {formatCurrency(budget.remaining, currency)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <BudgetBar percentage={budget.percentageUsed} />
                          <span className={cn("text-xs", statusColor)}>
                            {budget.percentageUsed.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingBudget(budget)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingBudget(budget)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {categoriesWithoutBudgets.map((category) => (
                  <TableRow key={category.id} className="opacity-60">
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">Unlimited</TableCell>
                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCreatingCategory(category)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Set Budget
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <BudgetEditDialog
        open={editingBudget !== null || creatingCategory !== null || isCreating}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBudget(null);
            setCreatingCategory(null);
            setIsCreating(false);
          }
        }}
        budget={editingBudget || undefined}
        categoryId={creatingCategory?.id}
        categoryName={creatingCategory?.name}
        currencies={enabledCurrencies}
        defaultCurrency={currency}
        onSuccess={onRefresh}
      />

      <AlertDialog open={deletingBudget !== null} onOpenChange={(open) => !open && setDeletingBudget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the budget for {deletingBudget?.categoryName}? This
              action cannot be undone.
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

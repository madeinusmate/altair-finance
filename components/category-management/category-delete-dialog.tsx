"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, AlertTriangle } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface CategoryUsage {
  transactions: number;
  transfers: number;
  budgets: number;
  debitTransactions: number;
  creditTransactions: number;
}

interface CatalogCategory {
  id: number;
  name: string;
  transactionType?: "debit" | "credit" | null;
}

interface BudgetRow {
  categoryId: number;
}

interface CategoryDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: {
    id: number;
    name: string;
  };
  type: "transaction" | "account";
  onSuccess: () => void;
}

const emptyUsage: CategoryUsage = {
  transactions: 0,
  transfers: 0,
  budgets: 0,
  debitTransactions: 0,
  creditTransactions: 0,
};

export const CategoryDeleteDialog = ({
  open,
  onOpenChange,
  category,
  type,
  onSuccess,
}: CategoryDeleteDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<CategoryUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [destinations, setDestinations] = useState<CatalogCategory[]>([]);
  const [budgetCategoryIds, setBudgetCategoryIds] = useState<Set<number>>(new Set());
  const [destinationId, setDestinationId] = useState("");

  useEffect(() => {
    if (!open || type !== "transaction" || !category?.id) {
      return;
    }

    let cancelled = false;
    setUsageLoading(true);
    setError(null);
    setDestinationId("");

    Promise.all([
      apiClient.get<{ category: CatalogCategory } & CategoryUsage>(
        `/api/transaction-categories?usageId=${category.id}`
      ),
      apiClient.get<{ categories: CatalogCategory[] }>("/api/transaction-categories"),
      apiClient.get<{ budgets: BudgetRow[] }>("/api/budgets?currency=USD"),
    ])
      .then(([usageData, categoryData, budgetData]) => {
        if (cancelled) {
          return;
        }
        setUsage({
          transactions: usageData.transactions,
          transfers: usageData.transfers,
          budgets: usageData.budgets,
          debitTransactions: usageData.debitTransactions,
          creditTransactions: usageData.creditTransactions,
        });
        setDestinations(categoryData.categories.filter((item) => item.id !== category.id));
        setBudgetCategoryIds(new Set(budgetData.budgets.map((budget) => budget.categoryId)));
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to load category usage";
        setError(message);
        setUsage(emptyUsage);
      })
      .finally(() => {
        if (!cancelled) {
          setUsageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, type, category?.id]);

  const legalDestinations = useMemo(() => {
    if (!usage) {
      return [];
    }
    return destinations.filter((destination) => {
      if (usage.debitTransactions > 0 && destination.transactionType !== null && destination.transactionType !== "debit") {
        return false;
      }
      if (usage.creditTransactions > 0 && destination.transactionType !== null && destination.transactionType !== "credit") {
        return false;
      }
      if (usage.transfers > 0 && destination.transactionType !== null) {
        return false;
      }
      if (usage.budgets > 0) {
        if (destination.transactionType !== "debit") {
          return false;
        }
        if (budgetCategoryIds.has(destination.id)) {
          return false;
        }
      }
      return true;
    });
  }, [destinations, usage, budgetCategoryIds]);

  const inUse = !!usage && usage.transactions + usage.transfers + usage.budgets > 0;
  const needsLedger = inUse && legalDestinations.length === 0;

  const handleDelete = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const endpoint = type === "transaction" ? "/api/transaction-categories" : "/api/account-categories";
      const reassign =
        type === "transaction" && inUse && destinationId
          ? `&reassignToCategoryId=${destinationId}`
          : "";
      const data = await apiClient.delete<{ success: boolean; reassigned?: boolean; reassignedTo?: string }>(
        `${endpoint}?id=${category.id}${reassign}`
      );

      if (data.reassigned) {
        toast.success(`Category deleted. Existing items now use "${data.reassignedTo}".`);
      } else {
        toast.success("Category deleted successfully");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete category";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Category</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <span className="font-bold">{category?.name}</span>?
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {type === "account" ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              If this category is currently in use, existing items will be
              automatically reassigned to a default category.
            </AlertDescription>
          </Alert>
        ) : usageLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking transactions, transfers, and budgets
          </div>
        ) : usage && !inUse ? (
          <Alert>
            <AlertDescription>Nothing uses this category. Deleting it leaves the ledger unchanged.</AlertDescription>
          </Alert>
        ) : usage ? (
          <div className="space-y-3">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {usage.transactions} transaction{usage.transactions === 1 ? "" : "s"}, {usage.transfers} transfer
                {usage.transfers === 1 ? "" : "s"}, and {usage.budgets} budget{usage.budgets === 1 ? "" : "s"} still
                use this category.
              </AlertDescription>
            </Alert>
            {needsLedger ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No single category can take every row. Recategorize them on the ledger first, then delete this
                  category.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="reassign-category">Move everything to</Label>
                <Select value={destinationId} onValueChange={setDestinationId}>
                  <SelectTrigger id="reassign-category">
                    <SelectValue placeholder="Choose a destination category" />
                  </SelectTrigger>
                  <SelectContent>
                    {legalDestinations.map((destination) => (
                      <SelectItem key={destination.id} value={String(destination.id)}>
                        {destination.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={
              isLoading ||
              (type === "transaction" && (usageLoading || !usage || (inUse && (!destinationId || needsLedger))))
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

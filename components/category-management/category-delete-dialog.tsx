"use client";

import { useEffect, useState } from "react";
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
  transactionType: "debit" | "credit" | null;
}

interface CategoryDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: {
    id: number;
    name: string;
  } | null;
  type: "transaction" | "account";
  onSuccess: () => void;
}

const destinationFits = (usage: CategoryUsage, destination: CatalogCategory): boolean => {
  if (usage.debitTransactions > 0 && destination.transactionType !== null && destination.transactionType !== "debit") {
    return false;
  }
  if (usage.creditTransactions > 0 && destination.transactionType !== null && destination.transactionType !== "credit") {
    return false;
  }
  if (usage.transfers > 0 && destination.transactionType !== null) {
    return false;
  }
  if (usage.budgets > 0 && destination.transactionType !== "debit") {
    return false;
  }
  return true;
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
  const [destinations, setDestinations] = useState<CatalogCategory[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [usageLoading, setUsageLoading] = useState(false);

  useEffect(() => {
    if (!open || type !== "transaction" || !category) {
      return;
    }

    let cancelled = false;
    setUsageLoading(true);
    setError(null);
    setDestinationId("");

    Promise.all([
      apiClient.get<{ usage: CategoryUsage }>(`/api/transaction-categories?id=${category.id}`),
      apiClient.get<{ categories: CatalogCategory[] }>("/api/transaction-categories"),
    ])
      .then(([usageResponse, categoriesResponse]) => {
        if (cancelled) {
          return;
        }
        setUsage(usageResponse.usage);
        setDestinations(categoriesResponse.categories.filter((item) => item.id !== category.id));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load category usage");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUsageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, type, category]);

  const totalReferences = usage ? usage.transactions + usage.transfers + usage.budgets : 0;
  const legalDestinations = usage ? destinations.filter((item) => destinationFits(usage, item)) : [];
  const needsDestination = type === "transaction" && totalReferences > 0;
  const noLegalDestination = needsDestination && !usageLoading && legalDestinations.length === 0;

  const handleDelete = async () => {
    if (!category) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const endpoint = type === "transaction" ? "/api/transaction-categories" : "/api/account-categories";
      const reassign =
        type === "transaction" && destinationId ? `&reassignToCategoryId=${destinationId}` : "";
      await apiClient.delete<{ success: boolean }>(`${endpoint}?id=${category.id}${reassign}`);
      toast.success(reassign ? "Category deleted and rows moved" : "Category deleted successfully");
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
              If this category is currently in use, existing items will be automatically reassigned to a default category.
            </AlertDescription>
          </Alert>
        ) : usageLoading ? (
          <p className="text-sm text-muted-foreground">Checking transactions, transfers, and budgets…</p>
        ) : usage ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {usage.transactions} transactions, {usage.transfers} transfers, {usage.budgets} budgets
            </p>
            {needsDestination && noLegalDestination ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  These rows cannot move to a single category. Recategorize them on the ledger first.
                </AlertDescription>
              </Alert>
            ) : null}
            {needsDestination && !noLegalDestination ? (
              <div className="space-y-2">
                <Label htmlFor="reassign-category">Move existing rows to</Label>
                <Select value={destinationId} onValueChange={setDestinationId}>
                  <SelectTrigger id="reassign-category">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {legalDestinations.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
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
            disabled={isLoading || usageLoading || noLegalDestination || (needsDestination && !destinationId)}
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

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, AlertTriangle } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { legalReassignCategoryIds } from "@/lib/db/category-identity";

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

type CategoryChoice = {
  id: number;
  name: string;
  transactionType: "debit" | "credit" | null;
};

type CategoryReferences = {
  transactions: number;
  transfers: number;
  budgets: number;
  debitTransactions: number;
  creditTransactions: number;
  budgetCategoryIds: number[];
};

export const CategoryDeleteDialog = ({
  open,
  onOpenChange,
  category,
  type,
  onSuccess,
}: CategoryDeleteDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<CategoryReferences | null>(null);
  const [choices, setChoices] = useState<CategoryChoice[]>([]);
  const [destinationId, setDestinationId] = useState("");

  useEffect(() => {
    if (!open || !category || type !== "transaction") {
      setReferences(null);
      setChoices([]);
      setDestinationId("");
      setError(null);
      return;
    }

    let cancelled = false;
    setIsPreparing(true);
    setError(null);
    Promise.all([
      apiClient.get<CategoryReferences>(`/api/transaction-categories?references=${category.id}`),
      apiClient.get<{ categories: CategoryChoice[] }>("/api/transaction-categories"),
    ])
      .then(([usage, catalog]) => {
        if (cancelled) {
          return;
        }
        setReferences(usage);
        setChoices(catalog.categories);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load category usage");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreparing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, category, type]);

  const budgetIds = new Set(references?.budgetCategoryIds ?? []);
  const legalIds = references
    ? new Set(
        legalReassignCategoryIds(
          references,
          choices.map((choice) => ({
            id: choice.id,
            transactionType: choice.transactionType,
            hasBudget: budgetIds.has(choice.id),
          })),
          category?.id ?? -1
        )
      )
    : new Set<number>();
  const legalChoices = choices.filter((choice) => legalIds.has(choice.id));
  const inUse =
    (references?.transactions ?? 0) + (references?.transfers ?? 0) + (references?.budgets ?? 0) > 0;
  const needsDestination = type === "transaction" && inUse;
  const noLegalDestination = needsDestination && !isPreparing && legalChoices.length === 0;

  const handleDelete = async () => {
    if (!category) {
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      const endpoint = type === "transaction" ? "/api/transaction-categories" : "/api/account-categories";
      const destination = destinationId ? `&reassignToCategoryId=${destinationId}` : "";
      await apiClient.delete<{ success: boolean }>(`${endpoint}?id=${category.id}${destination}`);
      const destinationName = legalChoices.find((choice) => String(choice.id) === destinationId)?.name;
      toast.success(
        destinationName
          ? `Category deleted. Existing items now use "${destinationName}".`
          : "Category deleted successfully"
      );
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

        {type === "account" && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              If this category is currently in use, existing items will be automatically reassigned to a default category.
            </AlertDescription>
          </Alert>
        )}

        {type === "transaction" && isPreparing && (
          <p className="text-sm text-muted-foreground">Checking transactions, transfers, and budgets…</p>
        )}

        {type === "transaction" && references && inUse && (
          <div className="space-y-3">
            <p className="text-sm">
              This category is used by {references.transactions}{" "}
              {references.transactions === 1 ? "transaction" : "transactions"}, {references.transfers}{" "}
              {references.transfers === 1 ? "transfer" : "transfers"}, and {references.budgets}{" "}
              {references.budgets === 1 ? "budget" : "budgets"}.
            </p>
            {noLegalDestination ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No single category can accept every referenced row. Recategorize them on the ledger first.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="reassign-category">Move everything to</Label>
                <Select value={destinationId || undefined} onValueChange={setDestinationId}>
                  <SelectTrigger id="reassign-category">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {legalChoices.map((choice) => (
                      <SelectItem key={choice.id} value={String(choice.id)}>
                        {choice.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading || isPreparing || noLegalDestination || (needsDestination && !destinationId)}
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

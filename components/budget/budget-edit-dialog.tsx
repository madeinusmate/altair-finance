"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { isSupportedCurrency, SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { budgetMonthLabel } from "@/lib/budget/resolve-month";

interface Budget {
  id: string | null;
  categoryId: number;
  categoryName: string;
  amount: number;
  currency: string;
}

interface BudgetEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: Budget | null;
  categoryId?: number;
  categoryName?: string;
  yearMonth: string;
  currencies?: readonly SupportedCurrency[];
  defaultCurrency?: string;
  onSuccess: () => void;
}

export const BudgetEditDialog = ({
  open,
  onOpenChange,
  budget,
  categoryId,
  categoryName,
  yearMonth,
  currencies = SUPPORTED_CURRENCIES,
  defaultCurrency = "USD",
  onSuccess,
}: BudgetEditDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const monthName = budgetMonthLabel(yearMonth, "MMMM");
  const knownCategory = Boolean(budget || categoryId);

  useEffect(() => {
    if (open && !knownCategory) {
      setCategoriesLoading(true);
      apiClient
        .get<{ categories: Array<{ id: number; name: string; transactionType: "debit" | "credit" | null }> }>(
          "/api/transaction-categories?type=debit"
        )
        .then((data) => {
          const debitCategories = data.categories.filter((category) => category.transactionType === "debit");
          setCategories(debitCategories);
          setSelectedCategoryId((current) => current || (debitCategories[0] ? String(debitCategories[0].id) : ""));
        })
        .catch((err) => {
          console.error("Error fetching categories:", err);
          toast.error("Failed to load categories");
        })
        .finally(() => {
          setCategoriesLoading(false);
        });
    }
  }, [open, knownCategory]);

  const startingCurrency =
    isSupportedCurrency(defaultCurrency) && currencies.includes(defaultCurrency)
      ? defaultCurrency
      : (currencies[0] ?? "USD");

  useEffect(() => {
    if (budget) {
      setAmount(budget.amount.toString());
      setCurrency(budget.currency);
      setSelectedCategoryId(String(budget.categoryId));
    } else if (categoryId) {
      setAmount("");
      setCurrency(startingCurrency);
      setSelectedCategoryId(String(categoryId));
    } else {
      setAmount("");
      setCurrency(startingCurrency);
      setSelectedCategoryId("");
    }
    setError(null);
  }, [budget, categoryId, open, startingCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0) {
      setError("Amount must be a non-negative number");
      return;
    }

    const targetCategoryId = budget?.categoryId ?? categoryId ?? Number(selectedCategoryId);
    if (!Number.isInteger(targetCategoryId)) {
      setError("Please select a category");
      return;
    }

    setIsLoading(true);

    try {
      await apiClient.post("/api/budgets", {
        categoryId: targetCategoryId,
        yearMonth,
        amount: amountNum,
        currency,
      });

      toast.success(budget?.id ? "Budget updated successfully" : "Budget saved successfully");
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save budget";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const displayName = budget?.categoryName || categoryName;
  const saveLabel = budget?.id ? `Update ${monthName} budget` : `Set ${monthName} budget`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{budget?.id ? "Edit Budget" : "Set Budget"}</DialogTitle>
          <DialogDescription>
            {displayName
              ? `${saveLabel} for ${displayName}`
              : `Set a ${monthName} budget for a category`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive" aria-live="polite">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!knownCategory && (
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={selectedCategoryId}
                  onValueChange={setSelectedCategoryId}
                  disabled={isLoading || categoriesLoading}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category">
                      {categoriesLoading
                        ? "Loading…"
                        : categories.find((category) => String(category.id) === selectedCategoryId)?.name ||
                          "Select a category"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                inputMode="decimal"
                autoComplete="off"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={isLoading}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isSupportedCurrency(currency) && !currencies.includes(currency)
                    ? [currency, ...currencies]
                    : currencies
                  ).map((curr) => (
                    <SelectItem key={curr} value={curr}>
                      {curr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

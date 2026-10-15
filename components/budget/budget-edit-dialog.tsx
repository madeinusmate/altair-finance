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

interface Budget {
  id: string;
  categoryId: number;
  categoryName: string;
  amount: number;
  currency: string;
}

interface BudgetCategoryOption {
  id: number;
  name: string;
}

interface BudgetEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: Budget | null;
  categoryId?: number;
  categoryName?: string;
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
  currencies = SUPPORTED_CURRENCIES,
  defaultCurrency = "USD",
  onSuccess,
}: BudgetEditDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [categories, setCategories] = useState<BudgetCategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Fetch debit categories when dialog opens for creating a new budget (budgets only track expenses)
  useEffect(() => {
    if (open && !budget && categoryId == null) {
      setCategoriesLoading(true);
      apiClient
        .get<{ categories: Array<{ id: number; name: string; transactionType?: "debit" | "credit" | null }> }>("/api/transaction-categories?type=debit")
        .then((data) => {
          const debitCategories = data.categories
            .filter((category) => category.transactionType === "debit")
            .map((category) => ({ id: category.id, name: category.name }));
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
  }, [open, budget, categoryId]);

  const startingCurrency =
    isSupportedCurrency(defaultCurrency) && currencies.includes(defaultCurrency)
      ? defaultCurrency
      : (currencies[0] ?? "USD");

  useEffect(() => {
    if (budget) {
      setAmount(budget.amount.toString());
      setCurrency(budget.currency);
      setSelectedCategoryId(String(budget.categoryId));
    } else if (categoryId != null) {
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

    const targetCategoryId = budget?.categoryId ?? categoryId ?? (selectedCategoryId ? Number(selectedCategoryId) : null);
    if (targetCategoryId == null) {
      setError("Please select a category");
      return;
    }

    setIsLoading(true);

    try {
      await apiClient.post("/api/budgets", {
        categoryId: targetCategoryId,
        amount: amountNum,
        currency,
      });

      toast.success(budget ? "Budget updated successfully" : "Budget created successfully");
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const errorMessage = err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object" && "data" in err.response && err.response.data && typeof err.response.data === "object" && "error" in err.response.data && typeof err.response.data.error === "string" ? err.response.data.error : "Failed to save budget";
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
          <DialogTitle>{budget ? "Edit Budget" : "Create Budget"}</DialogTitle>
          <DialogDescription>
            {budget
              ? `Update budget for ${budget.categoryName}`
              : categoryName
                ? `Set budget for ${categoryName}`
                : "Set a monthly budget for this category"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!budget && categoryId == null && (
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
                        ? "Loading..."
                        : categories.find((category) => String(category.id) === selectedCategoryId)?.name || "Select a category"}
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
                type="number"
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
            <Button type="submit" disabled={isLoading || categoriesLoading || (!budget && categoryId == null && !selectedCategoryId)}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {budget ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

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
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

interface Budget {
  id: string;
  categoryName: string;
  amount: number;
  currency: string;
}

interface BudgetEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: Budget | null;
  categoryName?: string;
  onSuccess: () => void;
}

export const BudgetEditDialog = ({
  open,
  onOpenChange,
  budget,
  categoryName,
  onSuccess,
}: BudgetEditDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Fetch debit categories when dialog opens for creating a new budget (budgets only track expenses)
  useEffect(() => {
    if (open && !budget && !categoryName) {
      setCategoriesLoading(true);
      apiClient
        .get<{ categories: Array<{ name: string }> }>("/api/transaction-categories?type=debit")
        .then((data) => {
          const categoryNames = data.categories.map((c) => c.name);
          setCategories(categoryNames);
          if (categoryNames.length > 0 && !selectedCategory) {
            setSelectedCategory(categoryNames[0]);
          }
        })
        .catch((err) => {
          console.error("Error fetching categories:", err);
          toast.error("Failed to load categories");
        })
        .finally(() => {
          setCategoriesLoading(false);
        });
    }
  }, [open, budget, categoryName]);

  useEffect(() => {
    if (budget) {
      setAmount(budget.amount.toString());
      setCurrency(budget.currency);
      setSelectedCategory(budget.categoryName);
    } else if (categoryName) {
      setAmount("");
      setCurrency("USD");
      setSelectedCategory(categoryName);
    } else {
      setAmount("");
      setCurrency("USD");
      setSelectedCategory("");
    }
    setError(null);
  }, [budget, categoryName, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0) {
      setError("Amount must be a non-negative number");
      return;
    }

    const targetCategoryName = budget?.categoryName || categoryName || selectedCategory;
    if (!targetCategoryName) {
      setError("Please select a category");
      return;
    }

    setIsLoading(true);

    try {
      await apiClient.post("/api/budgets", {
        categoryName: targetCategoryName,
        amount: amountNum,
        currency,
      });

      toast.success(budget ? "Budget updated successfully" : "Budget created successfully");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || "Failed to save budget";
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

            {!budget && !categoryName && (
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                  disabled={isLoading || categoriesLoading}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category">
                      {categoriesLoading ? "Loading..." : selectedCategory || "Select a category"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
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
                  {SUPPORTED_CURRENCIES.map((curr) => (
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
            <Button type="submit" disabled={isLoading || categoriesLoading || (!budget && !categoryName && !selectedCategory)}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {budget ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

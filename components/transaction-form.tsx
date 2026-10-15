"use client";

import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { Transaction, Account } from "@/lib/db/schema";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import * as LucideIcons from "lucide-react";

interface TransactionFormProps {
  accountId?: string;
  currency?: string;
  accounts?: Account[];
  onSuccess: () => void;
  transaction?: Transaction;
  mode?: "create" | "edit";
}

export const TransactionForm = ({
  accountId: providedAccountId,
  currency: providedCurrency,
  accounts,
  onSuccess,
  transaction,
  mode = "create",
}: TransactionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getKey, usesBooksOwner } = useAuth();
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [categoryMap, setCategoryMap] = useState<Map<string, { name: string; color?: string | null; icon?: string | null }>>(new Map());
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Helper function to get icon component
  const getIconComponent = (iconName: string | null | undefined) => {
    if (!iconName) return null;
    let IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
    if (!IconComponent && iconName.includes("-")) {
      const pascalCase = iconName
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
      IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[pascalCase];
    }
    return IconComponent ? <IconComponent className="h-4 w-4" /> : null;
  };

  // Account selection state (only used when accountId is not provided)
  const transactionAccounts = accounts?.filter(a => a.type === "transaction") || [];
  const defaultAccountId = transactionAccounts.length > 0 ? transactionAccounts[0].id : "";
  const [selectedAccountId, setSelectedAccountId] = useState<string>(defaultAccountId);

  // State declarations - must be before useEffects that use them
  const [type, setType] = useState<"debit" | "credit">(
    transaction?.type || "debit"
  );
  const [categoryId, setCategoryId] = useState<string>(
    transaction?.categoryId != null ? String(transaction.categoryId) : ""
  );
  const [amount, setAmount] = useState(
    transaction?.amount.toString() || ""
  );
  const [description, setDescription] = useState(transaction?.description || "");
  const [date, setDate] = useState(
    transaction ? new Date(transaction.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
  );

  // Fetch categories from API filtered by transaction type
  useEffect(() => {
    const fetchCategories = async () => {
      const key = getKey();
      if (!key && !usesBooksOwner) {
        setCategoriesLoading(false);
        return;
      }

      try {
        const data = await apiClient.get<{ categories: Array<{ id: number; name: string; transactionType?: "debit" | "credit" | null; color?: string | null; icon?: string | null }> }>(
          `/api/transaction-categories?type=${type}`
        );
        const options = data.categories
          .filter((category) => category.transactionType === type || category.transactionType == null)
          .map((category) => ({ id: category.id, name: category.name }));
        setCategories(options);

        const catMap = new Map<string, { name: string; color?: string | null; icon?: string | null }>();
        data.categories.forEach((cat) => {
          catMap.set(String(cat.id), { name: cat.name, color: cat.color, icon: cat.icon });
        });
        setCategoryMap(catMap);

        setCategoryId((currentCategoryId) => {
          if (currentCategoryId && options.some((category) => String(category.id) === currentCategoryId)) {
            return currentCategoryId;
          }
          return options[0] ? String(options[0].id) : "";
        });
      } catch (error) {
        console.error("Error fetching categories:", error);
        toast.error("Failed to load categories");
      } finally {
        setCategoriesLoading(false);
      }
    };

    fetchCategories();
  }, [getKey, type, transaction]);

  // Update selected account when accounts change
  useEffect(() => {
    if (!providedAccountId && transactionAccounts.length > 0 && !transactionAccounts.find(a => a.id === selectedAccountId)) {
      setSelectedAccountId(transactionAccounts[0].id);
    }
  }, [accounts, providedAccountId, selectedAccountId, transactionAccounts]);

  // Determine current account and currency
  const currentAccountId = providedAccountId || selectedAccountId;
  const currentAccount = accounts?.find(a => a.id === currentAccountId);
  const currency = providedCurrency || currentAccount?.currency || "USD";

  // Handle type change - refetch categories and clear invalid selection
  const handleTypeChange = (newType: "debit" | "credit") => {
    setType(newType);
    // Category will be cleared/updated by the useEffect that watches type
  };

  // Pre-populate form when transaction is provided
  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setCategoryId(transaction.categoryId != null ? String(transaction.categoryId) : "");
      setAmount(transaction.amount.toString());
      setDescription(transaction.description || "");
      setDate(new Date(transaction.date).toISOString().split("T")[0]);
    }
  }, [transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === "edit" && transaction) {
        await apiClient.put("/api/transactions", {
          id: transaction.id,
          type,
          categoryId: Number(categoryId),
          amount: parseFloat(amount),
          description: description || null,
          date,
        });
        toast.success("Transaction updated successfully");
      } else {
        if (!currentAccountId) {
          throw new Error("Please select an account");
        }
        await apiClient.post("/api/transactions", {
          accountId: currentAccountId,
          type,
          categoryId: Number(categoryId),
          amount: parseFloat(amount),
          description: description || null,
          date,
        });
        toast.success("Transaction added");
      }

      onSuccess();
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : mode === "edit"
            ? "Failed to update transaction"
            : "Failed to add transaction";
      setError(errorMessage);
      toast.error(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Account selector - only show when accountId is not provided and not editing */}
      {!providedAccountId && mode === "create" && accounts && transactionAccounts.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="account">Account</Label>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger id="account">
              <SelectValue placeholder="Select an account" />
            </SelectTrigger>
            <SelectContent>
              {transactionAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Select value={type} onValueChange={(v) => handleTypeChange(v as "debit" | "credit")}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          {categoriesLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={categoryId} onValueChange={setCategoryId} disabled={categoriesLoading || categories.length === 0}>
              <SelectTrigger id="category">
                {categoryId && getIconComponent(categoryMap.get(categoryId)?.icon) && (
                  <span className="mr-2">{getIconComponent(categoryMap.get(categoryId)?.icon)}</span>
                )}
                <SelectValue placeholder={categories.length === 0 ? "No categories available" : "Select category"} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => {
                  const catData = categoryMap.get(String(cat.id));
                  const iconComponent = getIconComponent(catData?.icon);
                  return (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {iconComponent}
                      <span>{cat.name}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount ({currency})</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          placeholder="What was this transaction for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isLoading}
          rows={2}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading || !amount || !currentAccountId || !categoryId}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {mode === "edit" ? "Updating..." : "Adding..."}
          </>
        ) : (
          mode === "edit" ? "Update Transaction" : "Add Transaction"
        )}
      </Button>
    </form>
  );
};

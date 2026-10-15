"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import { Account, Transfer } from "@/lib/db/schema";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import * as LucideIcons from "lucide-react";

interface TransferFormProps {
  fromAccountId?: string;
  accounts: Account[];
  onSuccess: () => void;
  transfer?: Transfer;
  mode?: "create" | "edit";
}

export const TransferForm = ({ fromAccountId, accounts, onSuccess, transfer, mode = "create" }: TransferFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getKey, usesBooksOwner } = useAuth();
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryMap, setCategoryMap] = useState<Map<string, { color?: string | null; icon?: string | null }>>(new Map());
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

  const [selectedFromAccountId, setSelectedFromAccountId] = useState<string>(
    transfer?.fromAccountId || ""
  );
  const [toAccountId, setToAccountId] = useState(transfer?.toAccountId || "");
  const [fromAmount, setFromAmount] = useState(
    transfer ? (transfer.fromAmount ?? transfer.amount).toString() : ""
  );
  const [toAmount, setToAmount] = useState(
    transfer ? (transfer.toAmount ?? transfer.amount).toString() : ""
  );
  const [exchangeRate, setExchangeRate] = useState(
    transfer?.exchangeRate ? transfer.exchangeRate.toString() : ""
  );
  const [category, setCategory] = useState<string>(
    transfer?.category || ""
  );

  // Fetch categories from API - only show Transfer category (transactionType = null)
  useEffect(() => {
    const fetchCategories = async () => {
      const key = getKey();
      if (!key && !usesBooksOwner) {
        setCategoriesLoading(false);
        return;
      }

      try {
        const data = await apiClient.get<{ categories: Array<{ name: string; transactionType: "debit" | "credit" | null; color?: string | null; icon?: string | null }> }>("/api/transaction-categories");
        // Filter to only show Transfer category (transactionType = null)
        const transferCategories = data.categories.filter((c) => c.transactionType === null);
        const categoryNames = transferCategories.map((c) => c.name);
        
        // If no Transfer category exists, use "Transfer" as default
        if (categoryNames.length === 0) {
          categoryNames.push("Transfer");
        }
        
        setCategories(categoryNames);
        
        // Create a map of category name to category metadata
        const catMap = new Map<string, { color?: string | null; icon?: string | null }>();
        transferCategories.forEach((cat) => {
          catMap.set(cat.name, { color: cat.color, icon: cat.icon });
        });
        // Also add "Transfer" if it doesn't exist in the data
        if (!catMap.has("Transfer")) {
          catMap.set("Transfer", { color: null, icon: null });
        }
        setCategoryMap(catMap);
        
        // Set default category to Transfer if not set
        if (!transfer?.category && categoryNames.length > 0) {
          setCategory(categoryNames[0]);
        } else if (!transfer?.category) {
          setCategory("Transfer");
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
        toast.error("Failed to load categories");
        // Fallback to Transfer category
        setCategories(["Transfer"]);
        if (!transfer?.category) {
          setCategory("Transfer");
        }
      } finally {
        setCategoriesLoading(false);
      }
    };

    fetchCategories();
  }, [getKey, transfer]);
  const [description, setDescription] = useState(transfer?.description || "");
  const [date, setDate] = useState(
    transfer ? new Date(transfer.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
  );

  // Pre-populate form when transfer is provided
  useEffect(() => {
    if (transfer) {
      setSelectedFromAccountId(transfer.fromAccountId);
      setToAccountId(transfer.toAccountId);
      setFromAmount((transfer.fromAmount ?? transfer.amount).toString());
      setToAmount((transfer.toAmount ?? transfer.amount).toString());
      setExchangeRate(transfer.exchangeRate ? transfer.exchangeRate.toString() : "");
      setCategory(transfer.category || "");
      setDescription(transfer.description || "");
      setDate(new Date(transfer.date).toISOString().split("T")[0]);
    }
  }, [transfer]);

  // Filter eligible accounts: transaction and investment only (exclude balance)
  const allEligibleAccounts = accounts.filter((a) => a.type !== "balance");

  // Determine current fromAccountId
  const currentFromAccountId = fromAccountId || selectedFromAccountId;

  // Default to first eligible account when fromAccountId not provided
  useEffect(() => {
    if (!fromAccountId && allEligibleAccounts.length > 0 && !selectedFromAccountId) {
      setSelectedFromAccountId(allEligibleAccounts[0].id);
    }
  }, [fromAccountId, allEligibleAccounts, selectedFromAccountId]);

  const fromAccount = accounts.find((a) => a.id === currentFromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  
  // Filter eligible accounts for "To Account": exclude the source account and all balance accounts
  // Only transaction and investment accounts can participate in transfers
  const eligibleToAccounts = accounts.filter(
    (a) => a.id !== currentFromAccountId && a.type !== "balance"
  );

  const isCrossCurrency = useMemo(() => {
    return fromAccount && toAccount && fromAccount.currency !== toAccount.currency;
  }, [fromAccount, toAccount]);

  // Auto-calculate toAmount when fromAmount or exchangeRate changes (for cross-currency)
  useEffect(() => {
    if (isCrossCurrency && fromAmount && exchangeRate) {
      const calculated = parseFloat(fromAmount) * parseFloat(exchangeRate);
      if (!isNaN(calculated)) {
        setToAmount(calculated.toFixed(2));
      }
    } else if (isCrossCurrency && fromAmount && toAmount && !exchangeRate) {
      // Calculate exchange rate from amounts
      const calculated = parseFloat(toAmount) / parseFloat(fromAmount);
      if (!isNaN(calculated)) {
        setExchangeRate(calculated.toFixed(6));
      }
    } else if (!isCrossCurrency && fromAmount) {
      // Same currency: toAmount must equal fromAmount
      setToAmount(fromAmount);
    }
  }, [fromAmount, exchangeRate, isCrossCurrency, toAmount]);

  // Reset amounts when destination account or source account changes (only in create mode)
  useEffect(() => {
    if (mode === "create") {
      setFromAmount("");
      setToAmount("");
      setExchangeRate("");
    }
  }, [toAccountId, currentFromAccountId, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const fromAmountValue = parseFloat(fromAmount);
      const toAmountValue = parseFloat(toAmount);

      // Validate same-currency transfers
      if (!isCrossCurrency && fromAmountValue !== toAmountValue) {
        setError("For same-currency transfers, amounts must be equal");
        setIsLoading(false);
        return;
      }

      if (mode === "edit" && transfer) {
        await apiClient.put("/api/transfers", {
          id: transfer.id,
          fromAccountId: currentFromAccountId,
          toAccountId,
          fromAmount: fromAmountValue,
          toAmount: toAmountValue,
          exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
          category,
          description: description || null,
          date,
        });
        toast.success("Transfer updated successfully");
      } else {
        await apiClient.post("/api/transfers", {
          fromAccountId: currentFromAccountId,
          toAccountId,
          fromAmount: fromAmountValue,
          toAmount: toAmountValue,
          exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
          category,
          description: description || null,
          date,
        });
        toast.success("Transfer created successfully");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transfer");
      setIsLoading(false);
    }
  };

  // Check if source account is a balance account (shouldn't allow transfers)
  if (currentFromAccountId && fromAccount?.type === "balance") {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Balance accounts cannot participate in transfers. Only transaction and investment accounts support transfers.
        </AlertDescription>
      </Alert>
    );
  }

  if (allEligibleAccounts.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No eligible accounts for transfer. Create a transaction or investment account to transfer funds.
        </AlertDescription>
      </Alert>
    );
  }

  if (allEligibleAccounts.length < 2) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Need at least 2 accounts to create a transfer. Create another transaction or investment account.
        </AlertDescription>
      </Alert>
    );
  }

  if (eligibleToAccounts.length === 0 && currentFromAccountId) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No eligible destination accounts. You need at least 2 accounts to create a transfer.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* From Account selector - show when fromAccountId not provided or in edit mode */}
      {(!fromAccountId || mode === "edit") && (
        <div className="space-y-2">
          <Label htmlFor="fromAccount">From Account</Label>
          <Select 
            value={selectedFromAccountId} 
            onValueChange={setSelectedFromAccountId}
            disabled={mode === "edit"}
          >
            <SelectTrigger id="fromAccount">
              <SelectValue placeholder="Select source account" />
            </SelectTrigger>
            <SelectContent>
              {allEligibleAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* From Account display - only show when fromAccountId is provided and in create mode */}
      {fromAccountId && mode === "create" && (
        <div className="space-y-2">
          <Label>From Account</Label>
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
            {fromAccount?.name} ({fromAccount?.currency})
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="toAccount">To Account</Label>
        <Select value={toAccountId} onValueChange={setToAccountId} disabled={!currentFromAccountId}>
          <SelectTrigger id="toAccount">
            <SelectValue placeholder="Select destination account" />
          </SelectTrigger>
          <SelectContent>
            {eligibleToAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        {categoriesLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Select value={category} onValueChange={setCategory} disabled={categoriesLoading || categories.length === 0}>
            <SelectTrigger id="category">
              {category && getIconComponent(categoryMap.get(category)?.icon) && (
                <span className="mr-2">{getIconComponent(categoryMap.get(category)?.icon)}</span>
              )}
              <SelectValue placeholder={categories.length === 0 ? "No categories available" : "Select category"} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => {
                const catData = categoryMap.get(cat);
                const iconComponent = getIconComponent(catData?.icon);
                return (
                  <SelectItem key={cat} value={cat}>
                    {iconComponent}
                    <span>{cat}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fromAmount">
            From Amount ({fromAccount?.currency})
          </Label>
          <Input
            id="fromAmount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="toAmount">
            To Amount ({toAccount?.currency || "..."})
          </Label>
          <Input
            id="toAmount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={toAmount}
            onChange={(e) => {
              setToAmount(e.target.value);
              // If manually setting toAmount, clear exchange rate to recalculate
              if (isCrossCurrency && fromAmount) {
                setExchangeRate("");
              }
            }}
            disabled={isLoading || (!isCrossCurrency && fromAmount !== "")}
            required
          />
          {!isCrossCurrency && fromAccount && (
            <p className="text-xs text-muted-foreground">
              Same currency: amounts must be equal
            </p>
          )}
        </div>
      </div>

      {isCrossCurrency && (
        <div className="space-y-2">
          <Label htmlFor="exchangeRate">
            Exchange Rate (optional - calculated automatically)
          </Label>
          <Input
            id="exchangeRate"
            type="number"
            step="0.000001"
            min="0"
            placeholder="Auto-calculated"
            value={exchangeRate}
            onChange={(e) => {
              setExchangeRate(e.target.value);
              // If manually setting exchange rate, clear toAmount to recalculate
              if (fromAmount) {
                setToAmount("");
              }
            }}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Rate: 1 {fromAccount?.currency} = {exchangeRate || "?"} {toAccount?.currency}
          </p>
        </div>
      )}

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

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          placeholder="What is this transfer for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isLoading}
          rows={2}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading || !currentFromAccountId || !toAccountId || !fromAmount || !toAmount || !category}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {mode === "edit" ? "Updating..." : "Transferring..."}
          </>
        ) : (
          mode === "edit" ? "Update Transfer" : "Create Transfer"
        )}
      </Button>
    </form>
  );
};

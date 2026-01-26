"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
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
import { Account, Transaction, BalanceHistory } from "@/lib/db/schema";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { toast } from "sonner";
import { ACCOUNT_CATEGORIES, formatCategoryDisplay, type AccountCategory } from "@/lib/account-categories";

interface AccountEditFormProps {
  account: Account;
  transactions?: Transaction[];
  balanceHistory?: BalanceHistory[];
  onSuccess: () => void;
}

export const AccountEditForm = ({
  account,
  transactions = [],
  balanceHistory = [],
  onSuccess,
}: AccountEditFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(account.name);
  const [nature, setNature] = useState<"asset" | "liability">(account.nature);
  const [category, setCategory] = useState<AccountCategory>(account.category);
  const [currency, setCurrency] = useState(account.currency);
  const [initialBalance, setInitialBalance] = useState(account.initialBalance.toString());

  // Show warning if editing initial balance with existing history
  const hasHistory =
    account.type === "balance" ? balanceHistory.length > 0 : transactions.length > 0;
  const showWarning = hasHistory && account.type !== "investment";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await apiClient.put("/api/accounts", {
        id: account.id,
        name,
        currency,
        nature,
        category,
        initialBalance: account.type === "investment" ? 0 : parseFloat(initialBalance) || 0,
      });

      toast.success("Account updated successfully");
      onSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update account";
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

      {showWarning && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This account has existing {account.type === "balance" ? "balance history" : "transactions"}. 
            Changing the initial balance may affect calculated balances.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Account Name</Label>
        <Input
          id="name"
          placeholder="e.g., Savings Account, Credit Card"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {account.type !== "investment" && (
          <div className="space-y-2">
            <Label htmlFor="nature">Account Nature</Label>
            <Select value={nature} onValueChange={(v) => setNature(v as "asset" | "liability")}>
              <SelectTrigger id="nature">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">
                  <div className="flex flex-col items-start">
                    <span>Asset</span>
                    <span className="text-xs text-muted-foreground">Increases your net worth</span>
                  </div>
                </SelectItem>
                <SelectItem value="liability">
                  <div className="flex flex-col items-start">
                    <span>Liability</span>
                    <span className="text-xs text-muted-foreground">Decreases your net worth</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as AccountCategory)}>
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {formatCategoryDisplay(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {account.type !== "investment" && (
        <div className="space-y-2">
          <Label htmlFor="initialBalance">Initial Balance</Label>
          <Input
            id="initialBalance"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            disabled={isLoading}
          />
        </div>
      )}

      {account.type === "investment" && (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          Investment accounts always have zero initial balance.
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading || !name}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating...
          </>
        ) : (
          "Update Account"
        )}
      </Button>
    </form>
  );
};

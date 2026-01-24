"use client";

import { useState, useEffect } from "react";
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
import { CATEGORIES } from "@/lib/categories";
import { Transaction, Account } from "@/lib/db/schema";
import { toast } from "sonner";

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

  // Account selection state (only used when accountId is not provided)
  const transactionAccounts = accounts?.filter(a => a.type === "transaction") || [];
  const defaultAccountId = transactionAccounts.length > 0 ? transactionAccounts[0].id : "";
  const [selectedAccountId, setSelectedAccountId] = useState<string>(defaultAccountId);

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

  const [type, setType] = useState<"debit" | "credit">(
    transaction?.type || "debit"
  );
  const [category, setCategory] = useState<string>(
    transaction?.category || CATEGORIES[0]
  );
  const [amount, setAmount] = useState(
    transaction?.amount.toString() || ""
  );
  const [description, setDescription] = useState(transaction?.description || "");
  const [date, setDate] = useState(
    transaction ? new Date(transaction.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
  );

  // Pre-populate form when transaction is provided
  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setCategory(transaction.category);
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
          category,
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
          category,
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
          <Select value={type} onValueChange={(v) => setType(v as "debit" | "credit")}>
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
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      <Button type="submit" className="w-full" disabled={isLoading || !amount || !currentAccountId}>
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

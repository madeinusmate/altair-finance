"use client";

import { useState } from "react";
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
import { Account } from "@/lib/db/schema";

interface TransferFormProps {
  fromAccountId: string;
  accounts: Account[];
  onSuccess: () => void;
}

export const TransferForm = ({ fromAccountId, accounts, onSuccess }: TransferFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  
  // Filter eligible accounts: exclude the source account and all balance accounts
  // Only transaction and investment accounts can participate in transfers
  const eligibleAccounts = accounts.filter(
    (a) => a.id !== fromAccountId && a.type !== "balance"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await apiClient.post("/api/transfers", {
        fromAccountId,
        toAccountId,
        amount: parseFloat(amount),
        description: description || null,
        date,
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transfer");
      setIsLoading(false);
    }
  };

  // Check if source account is a balance account (shouldn't allow transfers)
  if (fromAccount?.type === "balance") {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Balance accounts cannot participate in transfers. Only transaction and investment accounts support transfers.
        </AlertDescription>
      </Alert>
    );
  }

  if (eligibleAccounts.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No eligible accounts for transfer. Create a transaction or investment account to transfer funds.
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

      <div className="space-y-2">
        <Label>From Account</Label>
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
          {fromAccount?.name} ({fromAccount?.currency})
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="toAccount">To Account</Label>
        <Select value={toAccountId} onValueChange={setToAccountId}>
          <SelectTrigger id="toAccount">
            <SelectValue placeholder="Select destination account" />
          </SelectTrigger>
          <SelectContent>
            {eligibleAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount ({fromAccount?.currency})</Label>
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
          placeholder="What is this transfer for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isLoading}
          rows={2}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading || !toAccountId || !amount}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Transferring...
          </>
        ) : (
          "Create Transfer"
        )}
      </Button>
    </form>
  );
};

"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import type { BalanceHistory } from "@/lib/db/schema";

interface BalanceUpdateFormProps {
  accountId: string;
  currency: string;
  onSuccess: () => void;
  entry?: BalanceHistory;
}

export const BalanceUpdateForm = ({ accountId, currency, onSuccess, entry }: BalanceUpdateFormProps) => {
  const isEditMode = !!entry;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [balance, setBalance] = useState(
    entry ? String(entry.balance) : ""
  );
  const [date, setDate] = useState(
    entry
      ? new Date(entry.date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isEditMode) {
        await apiClient.put("/api/balance-history", {
          id: entry.id,
          balance: parseFloat(balance),
          date,
        });
      } else {
        await apiClient.post("/api/balance-history", {
          accountId,
          balance: parseFloat(balance),
          date,
        });
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update balance");
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

      <div className="space-y-2">
        <Label htmlFor="balance">{isEditMode ? "Balance" : "New Balance"} ({currency})</Label>
        <Input
          id="balance"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          disabled={isLoading}
          required
        />
        <p className="text-xs text-muted-foreground">
          Enter the current balance of this account as of the selected date.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="date">As of Date</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={isLoading}
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading || balance === ""}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isEditMode ? "Saving..." : "Updating..."}
          </>
        ) : (
          isEditMode ? "Save Changes" : "Update Balance"
        )}
      </Button>
    </form>
  );
};

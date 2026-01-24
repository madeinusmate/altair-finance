"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";

interface BalanceUpdateFormProps {
  accountId: string;
  currency: string;
  onSuccess: () => void;
}

export const BalanceUpdateForm = ({ accountId, currency, onSuccess }: BalanceUpdateFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await apiClient.post("/api/balance-history", {
        accountId,
        balance: parseFloat(balance),
        date,
      });

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
        <Label htmlFor="balance">New Balance ({currency})</Label>
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
            Updating...
          </>
        ) : (
          "Update Balance"
        )}
      </Button>
    </form>
  );
};

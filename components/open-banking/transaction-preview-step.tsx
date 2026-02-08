"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import type { FinverseTransaction, FinverseAccount } from "@/lib/finverse-types";

interface AccountSelection {
  account: FinverseAccount;
  name: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
}

interface TransactionPreview {
  account: FinverseAccount;
  selection: AccountSelection;
  transactions: FinverseTransaction[];
  totalTransactions: number;
  isLoading: boolean;
  error?: string;
}

interface TransactionPreviewStepProps {
  accountPreviews: TransactionPreview[];
  onConfirm: (previews: TransactionPreview[]) => void;
  onBack: () => void;
  isLoading: boolean;
}

export const TransactionPreviewStep = ({
  accountPreviews,
  onConfirm,
  onBack,
  isLoading
}: TransactionPreviewStepProps) => {
  // Use prop directly instead of local state - it updates from parent
  const previews = accountPreviews;

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-2">Transaction Preview</h2>
        <p className="text-muted-foreground">
          Review the transactions that will be imported. Duplicates will be automatically filtered.
        </p>
      </div>

      {previews.map((preview, index) => (
        <Card key={index}>
          <CardHeader>
            <CardTitle>{preview.selection.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {preview.totalTransactions} total transactions available
            </p>
          </CardHeader>
          <CardContent>
            {preview.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading transactions...
              </div>
            ) : preview.error ? (
              <div className="text-center py-8 text-destructive">
                Error: {preview.error}
              </div>
            ) : preview.transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {preview.totalTransactions > 0 ? (
                  <div>
                    <p>No transactions to import</p>
                    <p className="text-xs mt-2">
                      {preview.totalTransactions} transaction{preview.totalTransactions !== 1 ? 's' : ''} available, but all are pending.
                      <br />
                      Only posted transactions are imported.
                    </p>
                  </div>
                ) : (
                  <p>No transactions available for this account</p>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {preview.transactions.slice(0, 50).map((tx) => (
                  <div
                    key={tx.transaction_id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{tx.description || "Unknown transaction"}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(tx.transaction_date || tx.posted_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium ${tx.amount.value < 0 ? "text-destructive" : "text-primary"}`}>
                        {formatCurrency(tx.amount.value, tx.amount.currency)}
                      </p>
                    </div>
                  </div>
                ))}
                {preview.transactions.length > 50 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    ... and {preview.transactions.length - 50} more transactions
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={() => onConfirm(previews)} disabled={isLoading || previews.some(p => p.isLoading)}>
          {isLoading ? "Creating Accounts..." : "Confirm & Import"}
        </Button>
      </div>
    </div>
  );
};

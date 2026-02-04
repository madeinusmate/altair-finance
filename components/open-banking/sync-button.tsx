"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface SyncButtonProps {
  accountId: string;
  finverseAccountId: string;
  loginIdentityId: string;
  onSyncComplete?: () => void;
}

export const SyncButton = ({ 
  accountId, 
  finverseAccountId, 
  loginIdentityId,
  onSyncComplete 
}: SyncButtonProps) => {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // Calculate date filter - fetch transactions from last 90 days or since last sync
      // For now, fetch last 90 days - in future could use last_synced from account metadata
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 90);
      const fromBookingDateTime = fromDate.toISOString();

      // Fetch transactions with date filter
      const transactionsResponse = await apiClient.post<{
        transactions: any[];
        total_transactions: number;
      }>("/api/open-banking/fetch-transactions", {
        accountId: finverseAccountId,
        loginIdentityId,
        limit: 1000,
        offset: 0,
        from_booking_date_time: fromBookingDateTime,
      });

      if (transactionsResponse.transactions && transactionsResponse.transactions.length > 0) {
        // Import transactions
        const importResponse = await apiClient.post<{
          imported_count: number;
          skipped_count: number;
        }>("/api/open-banking/import-transactions", {
          accountId,
          transactions: transactionsResponse.transactions,
          loginIdentityId,
        });

        toast.success(
          `Synced ${importResponse.imported_count} new transactions. ${importResponse.skipped_count} duplicates skipped.`
        );
      } else {
        toast.success("No new transactions to sync.");
      }

      onSyncComplete?.();
    } catch (error) {
      console.error("Sync error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to sync transactions");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      onClick={handleSync}
      disabled={isSyncing}
      variant="outline"
      size="sm"
    >
      {isSyncing ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Syncing...
        </>
      ) : (
        <>
          <RefreshCw className="mr-2 h-4 w-4" />
          Sync Now
        </>
      )}
    </Button>
  );
};

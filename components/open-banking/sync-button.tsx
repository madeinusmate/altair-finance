"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import type { FinverseTransaction } from "@/lib/finverse-types";
import type { PlaidTransaction } from "@/lib/plaid-types";

type Provider = "finverse" | "plaid";

interface SyncButtonProps {
  accountId: string;
  provider: Provider;
  /** Finverse: the finverse account_id. Plaid: the plaid account_id */
  providerAccountId: string;
  /** Finverse: login_identity_id. Plaid: item_id */
  providerIdentityId: string;
  onSyncComplete?: () => void;

  // Legacy compat props (mapped to provider props internally)
  /** @deprecated Use providerAccountId */
  finverseAccountId?: string;
  /** @deprecated Use providerIdentityId */
  loginIdentityId?: string;
}

export const SyncButton = ({
  accountId,
  provider = "finverse",
  providerAccountId,
  providerIdentityId,
  onSyncComplete,
  finverseAccountId,
  loginIdentityId,
}: SyncButtonProps) => {
  const [isSyncing, setIsSyncing] = useState(false);

  // Support legacy prop names
  const effectiveAccountId = providerAccountId || finverseAccountId || "";
  const effectiveIdentityId = providerIdentityId || loginIdentityId || "";

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      if (provider === "plaid") {
        await syncPlaid();
      } else {
        await syncFinverse();
      }
      onSyncComplete?.();
    } catch (error) {
      console.error("Sync error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to sync transactions");
    } finally {
      setIsSyncing(false);
    }
  };

  const syncFinverse = async () => {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 90);
    const fromBookingDateTime = fromDate.toISOString();

    const transactionsResponse = await apiClient.post<{
      transactions: FinverseTransaction[];
      total_transactions: number;
    }>("/api/open-banking/fetch-transactions", {
      accountId: effectiveAccountId,
      loginIdentityId: effectiveIdentityId,
      limit: 1000,
      offset: 0,
      from_booking_date_time: fromBookingDateTime,
    });

    if (transactionsResponse.transactions && transactionsResponse.transactions.length > 0) {
      const importResponse = await apiClient.post<{
        imported_count: number;
        skipped_count: number;
      }>("/api/open-banking/import-transactions", {
        accountId,
        transactions: transactionsResponse.transactions,
        loginIdentityId: effectiveIdentityId,
      });

      toast.success(
        `Synced ${importResponse.imported_count} new transactions. ${importResponse.skipped_count} duplicates skipped.`
      );
    } else {
      toast.success("No new transactions to sync.");
    }
  };

  const syncPlaid = async () => {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 90);
    const startDate = fromDate.toISOString().split("T")[0];
    const endDate = new Date().toISOString().split("T")[0];

    const transactionsResponse = await apiClient.post<{
      transactions: PlaidTransaction[];
      total_transactions: number;
    }>("/api/open-banking/plaid/fetch-transactions", {
      itemId: effectiveIdentityId,
      accountId: effectiveAccountId,
      startDate,
      endDate,
      count: 1000,
      offset: 0,
    });

    if (transactionsResponse.transactions && transactionsResponse.transactions.length > 0) {
      const importResponse = await apiClient.post<{
        imported_count: number;
        skipped_count: number;
      }>("/api/open-banking/plaid/import-transactions", {
        accountId,
        transactions: transactionsResponse.transactions,
        itemId: effectiveIdentityId,
      });

      toast.success(
        `Synced ${importResponse.imported_count} new transactions. ${importResponse.skipped_count} duplicates skipped.`
      );
    } else {
      toast.success("No new transactions to sync.");
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

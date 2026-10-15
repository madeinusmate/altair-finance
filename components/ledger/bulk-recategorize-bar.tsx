"use client";

import { useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { legalCategoryIds } from "@/lib/ledger/recategorize";
import type { LedgerSelectionEntry } from "@/lib/ledger/selection";
import { toast } from "sonner";
import { BulkRecategorizeDialog } from "@/components/ledger/bulk-recategorize-dialog";

export type BulkCategory = {
  id: number;
  name: string;
  transactionType: "debit" | "credit" | null;
  color?: string | null;
  icon?: string | null;
};

interface BulkRecategorizeBarProps {
  selectedRows: LedgerSelectionEntry[];
  categories: BulkCategory[];
  onCompleted: () => Promise<void>;
}

export const BulkRecategorizeBar = ({
  selectedRows,
  categories,
  onCompleted,
}: BulkRecategorizeBarProps) => {
  const [categoryId, setCategoryId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const legalIds = useMemo(() => {
    const rows = selectedRows.map((row) =>
      row.kind === "transfer"
        ? { kind: "transfer" as const }
        : { kind: "transaction" as const, type: row.type ?? "debit" }
    );
    return new Set(legalCategoryIds(rows, categories));
  }, [selectedRows, categories]);

  const legalCategories = categories.filter((category) => legalIds.has(category.id));
  const selectedCategoryId = categoryId && legalIds.has(Number(categoryId)) ? categoryId : "";
  const destination = legalCategories.find((category) => String(category.id) === selectedCategoryId);
  const transactionCount = selectedRows.filter((row) => row.kind === "transaction").length;
  const transferCount = selectedRows.filter((row) => row.kind === "transfer").length;

  const handleConfirm = async () => {
    if (!destination) {
      throw new Error("Choose a category");
    }

    await apiClient.post("/api/transactions/recategorize", {
      categoryId: destination.id,
      transactionIds: selectedRows.filter((row) => row.kind === "transaction").map((row) => row.id),
      transferIds: selectedRows.filter((row) => row.kind === "transfer").map((row) => row.id),
    });
    await onCompleted();
    toast.success("Categories updated");
  };

  if (selectedRows.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center">
        <p className="text-sm font-medium">{selectedRows.length} selected</p>
        {legalCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No category applies to every selected row. Narrow the selection.
          </p>
        ) : (
          <Select value={selectedCategoryId || undefined} onValueChange={setCategoryId}>
            <SelectTrigger className="w-full sm:w-[220px]" aria-label="Destination category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {legalCategories.map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={legalCategories.length === 0 || !destination}
        >
          Recategorize
        </Button>
      </div>
      {destination && (
        <BulkRecategorizeDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          transactionCount={transactionCount}
          transferCount={transferCount}
          destinationName={destination.name}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
};

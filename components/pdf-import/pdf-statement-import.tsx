"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Account, Transaction, Transfer } from "@/lib/db/schema";
import { useAuth } from "@/lib/auth-context";
import { PdfUpload } from "./pdf-upload";
import { PdfReviewTable, TransactionRow } from "./pdf-review-table";
import { CsvImportSummary } from "@/components/csv-import/csv-import-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ParsedTransaction } from "@/lib/pdf/openai-client";
import { calculatePdfHash } from "@/lib/pdf/file-hash";
import { validateTransactionRows } from "@/lib/csv/import-validators";
import { buildAccountNameMap } from "@/lib/csv/import-validators";

const normalizeAccountName = (name: string) => name.trim().toLowerCase();

const getDateKey = (value: number | Date | string) => {
  if (typeof value === "string") return value.split("T")[0];
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return new Date(value).toISOString().split("T")[0];
};

const buildTransactionKey = (accountId: string, date: string, amount: number, description: string) =>
  `${accountId}|${date}|${amount}|${description.trim().toLowerCase()}`;

const buildTransferKey = (fromId: string, toId: string, date: string, fromAmount: number, toAmount: number) =>
  `${fromId}|${toId}|${date}|${fromAmount}|${toAmount}`;

const getSummary = (rows: TransactionRow[]) => {
  const total = rows.length;
  const invalid = rows.filter((row) => row.errors.length > 0).length;
  const warnings = rows.filter((row) => row.warnings.length > 0).length;
  const duplicates = rows.filter((row) => row.duplicate).length;
  const excluded = rows.filter((row) => row.excluded).length;
  return {
    total,
    invalid,
    warnings,
    duplicates,
    excluded,
    valid: total - invalid - excluded,
  };
};

interface PdfStatementImportProps {
  accountId?: string; // Pre-selected account (for account detail page)
  onSuccess?: () => void;
}

export const PdfStatementImport = ({ accountId: initialAccountId, onSuccess }: PdfStatementImportProps) => {
  const { getKey } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactionCategories, setTransactionCategories] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(initialAccountId);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | undefined>();
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [existingTransactions, setExistingTransactions] = useState<Transaction[]>([]);
  const [existingTransfers, setExistingTransfers] = useState<Transfer[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const accountMap = useMemo(() => buildAccountNameMap(accounts), [accounts]);

  const applyDuplicateFlag = (row: TransactionRow, accountId: string): TransactionRow => {
    const amountValue = row.isTransfer ? (row.fromAmount || 0) : row.amount;
    const descriptionValue = row.description || "";
    let isDuplicate = false;

    if (row.isTransfer && row.fromAccountId && row.toAccountId) {
      const key = buildTransferKey(
        row.fromAccountId,
        row.toAccountId,
        row.date,
        row.fromAmount || 0,
        row.toAmount || 0
      );
      isDuplicate = existingTransfers.some(
        (transfer) =>
          buildTransferKey(
            transfer.fromAccountId,
            transfer.toAccountId,
            getDateKey(transfer.date),
            transfer.fromAmount ?? transfer.amount,
            transfer.toAmount ?? transfer.amount
          ) === key
      );
    } else {
      const key = buildTransactionKey(accountId, row.date, amountValue, descriptionValue);
      isDuplicate = existingTransactions.some(
        (transaction) =>
          buildTransactionKey(
            transaction.accountId,
            getDateKey(transaction.date),
            transaction.amount,
            transaction.description || ""
          ) === key
      );
    }

    const warningMessage = "Possible duplicate";
    const hasWarning = row.warnings.includes(warningMessage);
    
    if (isDuplicate && !hasWarning) {
      return {
        ...row,
        duplicate: true,
        excluded: true, // Auto-exclude duplicates
        warnings: [...row.warnings, warningMessage],
      };
    }
    if (!isDuplicate && hasWarning) {
      return {
        ...row,
        duplicate: false,
        excluded: false,
        warnings: row.warnings.filter((warning) => warning !== warningMessage),
      };
    }
    return { ...row, duplicate: isDuplicate, excluded: isDuplicate ? (row.excluded ?? true) : false };
  };

  useEffect(() => {
    const loadData = async () => {
      const key = getKey();
      if (!key) return;

      try {
        const [accountsData, categoriesData] = await Promise.all([
          apiClient.get<Account[]>("/api/accounts"),
          apiClient.get<{ categories: Array<{ name: string }> }>("/api/transaction-categories"),
        ]);
        setAccounts(accountsData);
        setTransactionCategories(categoriesData.categories.map((c) => c.name));
      } catch (error) {
        console.error(error);
      }
    };

    loadData();
  }, [getKey]);

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }

    const loadExisting = async () => {
      try {
        const [transactions, transfers] = await Promise.all([
          apiClient.get<Transaction[]>("/api/transactions"),
          apiClient.get<Transfer[]>("/api/transfers"),
        ]);
        setExistingTransactions(transactions);
        setExistingTransfers(transfers);
      } catch (error) {
        console.error(error);
      }
    };

    loadExisting();
  }, [rows.length]);

  useEffect(() => {
    if (rows.length === 0 || (existingTransactions.length === 0 && existingTransfers.length === 0)) {
      return;
    }

    if (!selectedAccountId) return;

    setRows((currentRows) => {
      return currentRows.map((row) => {
        const accountId = row.isTransfer ? row.fromAccountId || selectedAccountId : selectedAccountId;
        if (!accountId) return row;
        return applyDuplicateFlag(row, accountId);
      });
    });
  }, [accountMap, existingTransactions, existingTransfers, rows.length, selectedAccountId]);

  const summary = getSummary(rows);

  const handleClear = () => {
    setRows([]);
    setFile(null);
    setFileName(undefined);
    setProcessingError(null);
    setImportError(null);
  };

  const handleFileSelected = async (selectedFile: File) => {
    if (!selectedAccountId) {
      toast.error("Please select an account first");
      return;
    }

    setProcessingError(null);
    setImportError(null);
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setIsProcessing(true);

    try {
      const key = getKey();
      if (!key) {
        throw new Error("Not authenticated");
      }

      // Convert file to FormData
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("accountId", selectedAccountId);

      // Call parse API using fetch (FormData requires multipart/form-data)
      const response = await fetch("/api/import/pdf-statements/parse", {
        method: "POST",
        headers: {
          "X-Encryption-Key": key,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to parse PDF");
      }

      if (!data.success || !data.transactions) {
        throw new Error(data.error || "Failed to parse PDF");
      }

      if (data.transactions.length === 0) {
        throw new Error("No transactions found in PDF");
      }

      // Convert to TransactionRow format
      const account = accounts.find((a) => a.id === selectedAccountId);
      if (!account) {
        throw new Error("Account not found");
      }

      const rawRows = data.transactions.map((tx, index) => ({
        date: tx.date,
        account: account.name,
        description: tx.description,
        amount: tx.amount.toString(),
        from_amount: "",
        to_amount: "",
        category: tx.category,
        type: tx.type,
        transfer_account: "",
      }));

      const validated = validateTransactionRows(rawRows, accounts, transactionCategories);

      const transactionRows: TransactionRow[] = validated.map((row, index) => ({
        id: `pdf-${index}`,
        date: row.date,
        description: row.description,
        amount: parseFloat(row.amount) || 0,
        category: row.category,
        type: row.type as "debit" | "credit",
        errors: row.errors,
        warnings: row.warnings,
        duplicate: false,
        excluded: false,
        isTransfer: false,
      }));

      setRows(transactionRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse PDF";
      setProcessingError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRowChange = (rowId: string, updates: Partial<TransactionRow>) => {
    setRows((currentRows) => {
      return currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const updatedRow = { ...row, ...updates };

        // Re-validate if needed
        if (updates.date || updates.amount || updates.description || updates.category || updates.type) {
          const accountId = updatedRow.isTransfer
            ? updatedRow.fromAccountId || selectedAccountId
            : selectedAccountId;
          if (accountId) {
            return applyDuplicateFlag(updatedRow, accountId);
          }
        }

        return updatedRow;
      });
    });
  };

  const handleToggleExclude = (rowId: string) => {
    setRows((currentRows) => {
      return currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        return { ...row, excluded: !row.excluded };
      });
    });
  };

  const handleImport = async () => {
    setImportError(null);
    setIsImporting(true);

    try {
      const validRows = rows.filter((row) => row.errors.length === 0 && !row.excluded);
      if (validRows.length === 0) {
        setImportError("No valid rows to import.");
        setIsImporting(false);
        return;
      }

      if (!file || !selectedAccountId) {
        throw new Error("Missing file or account");
      }

      // Calculate file hash
      const fileHash = await calculatePdfHash(file);

      // Prepare payload
      const payload = validRows.map((row) => {
        if (row.isTransfer && row.fromAccountId && row.toAccountId) {
          return {
            type: "transfer",
            fromAccountId: row.fromAccountId,
            toAccountId: row.toAccountId,
            fromAmount: row.fromAmount || 0,
            toAmount: row.toAmount || 0,
            description: row.description || null,
            date: row.date,
          };
        }

        return {
          type: row.type,
          accountId: selectedAccountId,
          category: row.category,
          amount: row.amount,
          description: row.description || null,
          date: row.date,
        };
      });

      // Import transactions
      await apiClient.post("/api/import/transactions", {
        rows: payload,
        filename: fileName,
        fileHash,
      });

      toast.success(`Imported ${validRows.length} transactions`);
      
      if (onSuccess) {
        onSuccess();
      } else {
        handleClear();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import transactions";
      setImportError(message);
      toast.error(message);
    } finally {
      setIsImporting(false);
      setShowConfirmDialog(false);
    }
  };

  return (
    <div className="space-y-6">
        <PdfUpload
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          fileName={fileName}
          disabled={isProcessing || isImporting}
          onAccountChange={setSelectedAccountId}
          onFileSelected={handleFileSelected}
          onClear={handleClear}
        />

        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing PDF...
          </div>
        )}

        {processingError && (
          <Alert variant="destructive">
            <AlertDescription>
              {processingError}
              <Button
                variant="outline"
                size="sm"
                className="ml-2"
                onClick={() => file && handleFileSelected(file)}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {rows.length > 0 && (
          <div className="space-y-4">
            <CsvImportSummary
              total={summary.total}
              valid={summary.valid}
              invalid={summary.invalid}
              warnings={summary.warnings}
              duplicates={summary.duplicates}
            />

            <PdfReviewTable
              rows={rows}
              accounts={accounts}
              transactionCategories={transactionCategories}
              onRowChange={handleRowChange}
              onToggleExclude={handleToggleExclude}
            />

            {importError && (
              <Alert variant="destructive">
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={isImporting || summary.invalid > 0 || summary.valid === 0}
              >
                {isImporting ? "Importing..." : "Import transactions"}
              </Button>
              {summary.invalid > 0 && (
                <p className="text-xs text-muted-foreground">Fix errors before importing.</p>
              )}
              {summary.valid === 0 && (
                <p className="text-xs text-muted-foreground">No valid transactions to import.</p>
              )}
            </div>
          </div>
        )}

        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Import</AlertDialogTitle>
              <AlertDialogDescription>
                Import {summary.valid} transaction{summary.valid !== 1 ? "s" : ""}?
                {summary.excluded > 0 && (
                  <span className="block mt-2">
                    {summary.excluded} duplicate{summary.excluded !== 1 ? "s" : ""} will be excluded.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleImport}>Import</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );
};

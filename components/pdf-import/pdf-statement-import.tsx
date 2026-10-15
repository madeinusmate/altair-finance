"use client";

import { useEffect, useRef, useState } from "react";
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
import { ParsedTransaction } from "@/lib/pdf/types";
import { calculatePdfHash } from "@/lib/pdf/file-hash";
import { validateTransactionRows } from "@/lib/csv/import-validators";
import { learnImportedRows } from "@/lib/categorization/client";
import {
  applyRulesToRows,
  CategoryAllowance,
  CategorizationRule,
  fallbackCategoryName,
  hasDefaultedCategoryWarning,
  reconcileReviewRow,
  shouldBlankCategoryForRematch,
  toCategorizationRules,
  toCategoryAllowances,
} from "@/lib/categorization/rules";
import { transactionFingerprint, transferFingerprint } from "@/lib/import/fingerprint";
import { applyReviewDuplicates } from "@/lib/import/review-duplicates";
import { cleanPayee } from "@/lib/payees/normalize";

const PDF_IDENTITY_FIELDS = [
  "date",
  "amount",
  "description",
  "type",
  "fromAccountId",
  "toAccountId",
  "fromAmount",
  "toAmount",
  "isTransfer",
] as const;

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
  const { getKey, usesBooksOwner } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactionCategories, setTransactionCategories] = useState<CategoryAllowance[]>([]);
  const [categorizationRules, setCategorizationRules] = useState<CategorizationRule[]>([]);
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
  const [payees, setPayees] = useState<Array<{ id: string; name: string }>>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [useCloudParser, setUseCloudParser] = useState(false);

  const rowsRef = useRef<TransactionRow[]>([]);
  const flagVersion = useRef(0);
  rowsRef.current = rows;

  const rememberRows = (nextRows: TransactionRow[]) => {
    rowsRef.current = nextRows;
    setRows(nextRows);
  };

  const fingerprintForRow = async (row: TransactionRow): Promise<string | null> => {
    if (!selectedAccountId) {
      return null;
    }
    if (row.isTransfer) {
      if (!row.fromAccountId || !row.toAccountId) {
        return null;
      }
      return transferFingerprint({
        fromAccountId: row.fromAccountId,
        toAccountId: row.toAccountId,
        date: row.date,
        fromAmount: row.fromAmount || 0,
        toAmount: row.toAmount || 0,
      });
    }
    if (row.type !== "debit" && row.type !== "credit") {
      return null;
    }
    return transactionFingerprint({
      accountId: selectedAccountId,
      date: row.date,
      amount: row.amount,
      description: row.description,
      type: row.type,
    });
  };

  const flagRows = async (currentRows: TransactionRow[]): Promise<TransactionRow[]> => {
    const existing = new Set<string>();
    await Promise.all([
      ...existingTransactions.map(async (transaction) => {
        if (transaction.fingerprint) {
          existing.add(transaction.fingerprint);
        }
        if (transaction.sourceFingerprint) {
          existing.add(transaction.sourceFingerprint);
        }
        if (transaction.type !== "debit" && transaction.type !== "credit") {
          return;
        }
        const hash = await transactionFingerprint({
          accountId: transaction.accountId,
          date: transaction.date,
          amount: transaction.amount,
          description: transaction.description,
          type: transaction.type,
        });
        if (hash) {
          existing.add(hash);
        }
      }),
      ...existingTransfers.map(async (transfer) => {
        if (transfer.fingerprint) {
          existing.add(transfer.fingerprint);
        }
        if (transfer.sourceFingerprint) {
          existing.add(transfer.sourceFingerprint);
        }
        const hash = await transferFingerprint({
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
          date: transfer.date,
          fromAmount: transfer.fromAmount ?? transfer.amount,
          toAmount: transfer.toAmount ?? transfer.amount,
        });
        if (hash) {
          existing.add(hash);
        }
      }),
    ]);
    const withFingerprints = await Promise.all(
      currentRows.map(async (row) => ({
        ...row,
        fingerprint: await fingerprintForRow(row),
      }))
    );
    return applyReviewDuplicates(withFingerprints, existing).map((row) => {
      const { fingerprint, ...rest } = row;
      void fingerprint;
      return rest;
    });
  };

  const scheduleFlags = (currentRows: TransactionRow[]) => {
    const version = ++flagVersion.current;
    void flagRows(currentRows)
      .then((flagged) => {
        if (version !== flagVersion.current) {
          return;
        }
        rememberRows(flagged);
      })
      .catch((error) => {
        console.error(error);
      });
  };

  useEffect(() => {
    const loadData = async () => {
      const key = getKey();
      if (!key && !usesBooksOwner) return;

      try {
        const [accountsData, categoriesData, rulesData, payeesData] = await Promise.all([
          apiClient.get<Account[]>("/api/accounts"),
          apiClient.get<{ categories: Array<{ name: string; transactionType?: string | null }> }>(
            "/api/transaction-categories"
          ),
          apiClient
            .get<{
              rules: Array<{
                id: string;
                pattern: string;
                matchType?: string | null;
                categoryName: string;
                transactionType?: string | null;
              }>;
            }>("/api/categorization-rules")
            .catch(() => ({ rules: [] })),
          apiClient.get<{ payees: Array<{ id: string; name: string }> }>("/api/payees"),
        ]);
        setAccounts(accountsData);
        setTransactionCategories(toCategoryAllowances(categoriesData.categories));
        setCategorizationRules(toCategorizationRules(rulesData.rules));
        setPayees(payeesData.payees || []);
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
    if (rows.length === 0 || !selectedAccountId) {
      return;
    }
    scheduleFlags(rowsRef.current);
    // Edits schedule their own pass. This covers ledger prefetch and a new file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingTransactions, existingTransfers, rows.length, selectedAccountId]);

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
      if (!key && !usesBooksOwner) {
        throw new Error("Not authenticated");
      }

      // Convert file to FormData
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("accountId", selectedAccountId);
      formData.append("parser", useCloudParser ? "openai" : "local");

      // Call parse API using fetch (FormData requires multipart/form-data)
      const response = await fetch("/api/import/pdf-statements/parse", {
        method: "POST",
        headers: {
          ...(key ? { "X-Encryption-Key": key } : {}),
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

      const rawRows = data.transactions.map((tx: ParsedTransaction) => ({
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

      const categoryNames = transactionCategories.map((category) => category.name);
      const validated = validateTransactionRows(rawRows, accounts, categoryNames);
      const categorized = applyRulesToRows(validated, categorizationRules, transactionCategories, {
        replaceValidCategory: true,
      });

      const transactionRows: TransactionRow[] = categorized.map((row, index) => {
        const parserWarnings = data.transactions[index]?.warnings ?? [];
        return {
          id: `pdf-${index}`,
          date: row.date,
          description: row.description,
          payeeName: cleanPayee(row.description)?.displayName ?? "",
          payeeEdited: false,
          amount: parseFloat(row.amount) || 0,
          category: row.category,
          type: row.type === "credit" ? "credit" : "debit",
          errors: row.errors,
          warnings: [...row.warnings, ...parserWarnings],
          duplicate: false,
          excluded: false,
          isTransfer: false,
          ruleMatch: row.ruleMatch,
          ruleHint: row.ruleHint,
        };
      });

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
    const identityChanged = PDF_IDENTITY_FIELDS.some((field) => field in updates);
    const nextRows = rowsRef.current.map((row) => {
      if (row.id !== rowId) {
        return row;
      }
      const updatedRow = { ...row, ...updates };
      const editedKey =
        updates.category !== undefined
          ? "category"
          : updates.description !== undefined
            ? "description"
            : updates.type !== undefined
              ? "type"
              : "other";

      let nextRow = updatedRow;
      if (updatedRow.isTransfer) {
        nextRow = {
          ...updatedRow,
          ruleMatch: undefined,
          ruleHint: undefined,
          categoryTouched: updates.category !== undefined ? true : row.categoryTouched,
        };
      } else {
        const blankCategory = shouldBlankCategoryForRematch(row, editedKey);
        const fallback = fallbackCategoryName(transactionCategories);
        const validatedCategory = blankCategory ? fallback : updatedRow.category;
        const validatedWarnings = blankCategory
          ? [
              ...updatedRow.warnings.filter((warning) => !hasDefaultedCategoryWarning([warning])),
              `Category defaulted to ${fallback}`,
            ]
          : updatedRow.warnings;
        nextRow = {
          ...updatedRow,
          ...reconcileReviewRow(
            row,
            { ...updatedRow, category: validatedCategory, warnings: validatedWarnings },
            editedKey,
            categorizationRules,
            transactionCategories
          ),
        };
      }
      if (updates.description && !row.payeeEdited && !nextRow.isTransfer) {
        nextRow = {
          ...nextRow,
          payeeName: cleanPayee(updates.description)?.displayName ?? "",
        };
      }

      if (!identityChanged) {
        return nextRow;
      }
      return {
        ...nextRow,
        duplicate: false,
        excluded: false,
        overrideDuplicate: false,
      };
    });
    rememberRows(nextRows);
    scheduleFlags(nextRows);
  };

  const handleToggleExclude = (rowId: string) => {
    const nextRows = rowsRef.current.map((row) => {
      if (row.id !== rowId) {
        return row;
      }
      const excluded = !row.excluded;
      return {
        ...row,
        excluded,
        overrideDuplicate: row.duplicate ? !excluded : false,
      };
    });
    rememberRows(nextRows);
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
            type: "transfer" as const,
            fromAccountId: row.fromAccountId,
            toAccountId: row.toAccountId,
            fromAmount: row.fromAmount || 0,
            toAmount: row.toAmount || 0,
            description: row.description || null,
            date: row.date,
            ...(row.duplicate ? { overrideDuplicate: true } : {}),
          };
        }

        return {
          type: row.type,
          accountId: selectedAccountId,
          category: row.category,
          amount: row.amount,
          description: row.description || null,
          payeeName: row.excluded || row.duplicate ? null : row.payeeName || null,
          date: row.date,
          ...(row.duplicate ? { overrideDuplicate: true } : {}),
        };
      });

      const result = await apiClient.post<{
        transactions: number;
        transfers: number;
        skippedDuplicates?: number;
        skippedIndexes?: number[];
        isDuplicate?: boolean;
      }>("/api/import/transactions", {
        rows: payload,
        filename: fileName,
        fileHash,
      });

      const learned = await learnImportedRows(
        validRows.map((row) => ({
          description: row.description,
          category: row.category,
          type: row.isTransfer ? "transfer" : row.type,
          categoryTouched: row.categoryTouched,
          excluded: row.excluded,
        })),
        transactionCategories,
        result
      );
      if (learned.failed > 0) {
        toast.error("Imported, but a description rule could not be saved");
      }

      const imported = result.transactions + result.transfers;
      toast.success(`Imported ${imported} transaction${imported === 1 ? "" : "s"}`);
      if ((result.skippedDuplicates ?? 0) > 0) {
        toast(`Skipped ${result.skippedDuplicates} duplicate ${result.skippedDuplicates === 1 ? "row" : "rows"}`);
      }
      if (result.isDuplicate) {
        toast("This file was imported before");
      }
      
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
          useCloudParser={useCloudParser}
          onUseCloudParserChange={setUseCloudParser}
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
              payees={payees}
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

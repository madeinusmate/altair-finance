import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Account, BalanceHistory, InvestmentHistory, Transaction, Transfer } from "@/lib/db/schema";
import { useAuth } from "@/lib/auth-context";
import {
  buildAccountNameMap,
  getMissingHeaders,
  getRequiredHeaders,
  ParsedAccountRow,
  ParsedBalanceRow,
  ParsedTransactionRow,
  validateAccountRows,
  validateBalanceRows,
  validateTransactionRows,
} from "@/lib/csv/import-validators";
import { parseCsvFile, parseCsvString, countCsvRows } from "@/lib/csv/parse";
import { calculateFileHash } from "@/lib/csv/file-hash";
import { balanceFingerprint, transactionFingerprint, transferFingerprint } from "@/lib/import/fingerprint";
import { applyReviewDuplicates } from "@/lib/import/review-duplicates";

export type ImportType = "transactions" | "balances" | "accounts";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export type TransactionRow = ParsedTransactionRow & {
  duplicate?: boolean;
  excluded?: boolean;
  overrideDuplicate?: boolean;
  categoryTouched?: boolean;
  ruleMatch?: unknown;
};
export type BalanceRow = ParsedBalanceRow & {
  duplicate?: boolean;
  excluded?: boolean;
  overrideDuplicate?: boolean;
};
export type AccountRow = ParsedAccountRow & { duplicate?: boolean };

export type CompletionSummary =
  | {
      type: "transactions";
      transactions: number;
      transfers: number;
      total: number;
      skippedDuplicates: number;
      fileAlreadyImported: boolean;
    }
  | {
      type: "balances";
      balances: number;
      investments: number;
      total: number;
      skippedDuplicates: number;
      fileAlreadyImported: boolean;
    }
  | {
      type: "accounts";
      accounts: number;
    };

const normalizeAccountName = (name: string) => name.trim().toLowerCase();

const TRANSACTION_IDENTITY_KEYS = new Set<string>([
  "date",
  "account",
  "description",
  "amount",
  "fromAmount",
  "toAmount",
  "type",
  "transferAccount",
]);

const BALANCE_IDENTITY_KEYS = new Set<string>(["date", "account", "balance"]);

// Safely convert a date (string, Date, or number) to a timestamp
const safeDateToTimestamp = (date: string | Date | number | null | undefined): number => {
  if (!date) {
    return 0;
  }
  if (typeof date === "number") {
    return date;
  }
  if (date instanceof Date) {
    return date.getTime();
  }
  // It's a string, convert to Date first
  const dateObj = new Date(date);
  if (Number.isNaN(dateObj.getTime())) {
    console.warn("Invalid date value:", date);
    return 0;
  }
  return dateObj.getTime();
};

const summarizeRows = <Row extends { errors: string[]; warnings: string[]; duplicate?: boolean; excluded?: boolean }>(
  rows: Row[]
) => {
  const total = rows.length;
  const invalid = rows.filter((row) => row.errors.length > 0).length;
  const warnings = rows.filter((row) => row.warnings.length > 0).length;
  const duplicates = rows.filter((row) => row.duplicate).length;
  const skipped = rows.filter((row) => row.duplicate && row.excluded && row.errors.length === 0).length;
  const valid = rows.filter((row) => row.errors.length === 0 && !row.excluded).length;
  return {
    total,
    invalid,
    warnings,
    duplicates,
    skipped,
    valid,
  };
};

const reportImportNotices = (skippedDuplicates: number, fileAlreadyImported: boolean) => {
  if (skippedDuplicates > 0) {
    toast(`Skipped ${skippedDuplicates} duplicate ${skippedDuplicates === 1 ? "row" : "rows"}`);
  }
  if (fileAlreadyImported) {
    toast("This file was imported before");
  }
};

export const useImportWizard = () => {
  const { getKey, usesBooksOwner } = useAuth();
  const [step, setStep] = useState<WizardStep>(1);
  const [importType, setImportTypeState] = useState<ImportType>("transactions");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | undefined>();
  const [pasteContent, setPasteContent] = useState<string>("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([]);
  const [balanceRows, setBalanceRows] = useState<BalanceRow[]>([]);
  const [accountRows, setAccountRows] = useState<AccountRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactionCategories, setTransactionCategories] = useState<string[]>([]);
  const [accountCategoryIdentifiers, setAccountCategoryIdentifiers] = useState<string[]>([]);
  const [existingTransactions, setExistingTransactions] = useState<Transaction[]>([]);
  const [existingTransfers, setExistingTransfers] = useState<Transfer[]>([]);
  const [existingBalances, setExistingBalances] = useState<BalanceHistory[]>([]);
  const [existingInvestments, setExistingInvestments] = useState<InvestmentHistory[]>([]);

  const accountMap = useMemo(() => buildAccountNameMap(accounts), [accounts]);
  const transactionRowsRef = useRef<TransactionRow[]>([]);
  const balanceRowsRef = useRef<BalanceRow[]>([]);
  const transactionFlagVersion = useRef(0);
  const balanceFlagVersion = useRef(0);
  transactionRowsRef.current = transactionRows;
  balanceRowsRef.current = balanceRows;

  const rememberTransactionRows = (rows: TransactionRow[]) => {
    transactionRowsRef.current = rows;
    setTransactionRows(rows);
  };

  const rememberBalanceRows = (rows: BalanceRow[]) => {
    balanceRowsRef.current = rows;
    setBalanceRows(rows);
  };

  useEffect(() => {
    const loadData = async () => {
      const key = getKey();
      if (!key && !usesBooksOwner) return;

      try {
        const [accountsData, txCategoriesData, acctCategoriesData] = await Promise.all([
          apiClient.get<Account[]>("/api/accounts"),
          apiClient.get<{ categories: Array<{ name: string }> }>("/api/transaction-categories"),
          apiClient.get<{ categories: Array<{ identifier: string }> }>("/api/account-categories"),
        ]);
        setAccounts(accountsData);
        setTransactionCategories(txCategoriesData.categories.map((c) => c.name));
        setAccountCategoryIdentifiers(acctCategoriesData.categories.map((c) => c.identifier));
      } catch (error) {
        console.error(error);
      }
    };

    loadData();
  }, [getKey]);

  const resetImportState = () => {
    setFile(null);
    setFileName(undefined);
    setPasteContent("");
    setParseErrors([]);
    setHeaderErrors([]);
    setTransactionRows([]);
    setBalanceRows([]);
    setAccountRows([]);
    setImportError(null);
    setCompletion(null);
    setExistingTransactions([]);
    setExistingTransfers([]);
    setExistingBalances([]);
    setExistingInvestments([]);
  };

  const setImportType = (type: ImportType) => {
    setImportTypeState(type);
    resetImportState();
    setStep(1);
  };

  const selectFile = (selectedFile: File) => {
    console.log("selectFile called with:", selectedFile.name);
    setFile(selectedFile);
    setFileName(selectedFile.name);
    console.log("setFileName called with:", selectedFile.name);
    setPasteContent(""); // Clear paste content when file is selected (paste priority)
    setParseErrors([]);
    setHeaderErrors([]);
    setImportError(null);
    setCompletion(null);
    setTransactionRows([]);
    setBalanceRows([]);
    setAccountRows([]);
    setExistingTransactions([]);
    setExistingTransfers([]);
    setExistingBalances([]);
    setExistingInvestments([]);
  };

  const selectPaste = (content: string) => {
    setPasteContent(content);
    // Update fileName to show row count for paste content
    if (content.trim()) {
      const rowCount = countCsvRows(content);
      setFileName(`Pasted CSV (${rowCount} rows)`);
      // Clear file selection when paste is used (paste priority)
      setFile(null);
    } else {
      // Only clear fileName if we're explicitly clearing paste (not when file is selected)
      // Don't clear fileName here - let selectFile handle it
    }
    setParseErrors([]);
    setHeaderErrors([]);
    setImportError(null);
    setCompletion(null);
    setTransactionRows([]);
    setBalanceRows([]);
    setAccountRows([]);
    setExistingTransactions([]);
    setExistingTransfers([]);
    setExistingBalances([]);
    setExistingInvestments([]);
  };

  const fingerprintForTransactionRow = async (row: TransactionRow): Promise<string | null> => {
    const account = accountMap.get(normalizeAccountName(row.account));
    if (!account) {
      return null;
    }
    if (row.type === "transfer") {
      const transferAccount = accountMap.get(normalizeAccountName(row.transferAccount));
      if (!transferAccount) {
        return null;
      }
      return transferFingerprint({
        fromAccountId: account.id,
        toAccountId: transferAccount.id,
        date: row.date,
        fromAmount: Number(row.fromAmount),
        toAmount: Number(row.toAmount),
      });
    }
    return transactionFingerprint({
      accountId: account.id,
      date: row.date,
      amount: Number(row.amount),
      description: row.description,
      type: row.type,
    });
  };

  const fingerprintForBalanceRow = async (row: BalanceRow): Promise<string | null> => {
    const account = accountMap.get(normalizeAccountName(row.account));
    if (!account) {
      return null;
    }
    return balanceFingerprint({
      accountId: account.id,
      date: row.date,
      balance: Number(row.balance),
    });
  };

  const collectExistingTransactionFingerprints = async () => {
    const fingerprints = new Set<string>();
    await Promise.all([
      ...existingTransactions.map(async (transaction) => {
        if (transaction.fingerprint) {
          fingerprints.add(transaction.fingerprint);
        }
        if (transaction.sourceFingerprint) {
          fingerprints.add(transaction.sourceFingerprint);
        }
        const hash = await transactionFingerprint({
          accountId: transaction.accountId,
          date: transaction.date,
          amount: transaction.amount,
          description: transaction.description,
          type: transaction.type,
        });
        if (hash) {
          fingerprints.add(hash);
        }
      }),
      ...existingTransfers.map(async (transfer) => {
        if (transfer.fingerprint) {
          fingerprints.add(transfer.fingerprint);
        }
        if (transfer.sourceFingerprint) {
          fingerprints.add(transfer.sourceFingerprint);
        }
        const hash = await transferFingerprint({
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
          date: transfer.date,
          fromAmount: transfer.fromAmount ?? transfer.amount,
          toAmount: transfer.toAmount ?? transfer.amount,
        });
        if (hash) {
          fingerprints.add(hash);
        }
      }),
    ]);
    return fingerprints;
  };

  const collectExistingBalanceFingerprints = async () => {
    const fingerprints = new Set<string>();
    await Promise.all(
      [...existingBalances, ...existingInvestments].map(async (entry) => {
        if (entry.fingerprint) {
          fingerprints.add(entry.fingerprint);
        }
        if (entry.sourceFingerprint) {
          fingerprints.add(entry.sourceFingerprint);
        }
        const hash = await balanceFingerprint({
          accountId: entry.accountId,
          date: entry.date,
          balance: entry.balance,
        });
        if (hash) {
          fingerprints.add(hash);
        }
      })
    );
    return fingerprints;
  };

  const flagTransactionRows = async (rows: TransactionRow[]): Promise<TransactionRow[]> => {
    const existing = await collectExistingTransactionFingerprints();
    const withFingerprints = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        fingerprint: await fingerprintForTransactionRow(row),
      }))
    );
    return applyReviewDuplicates(withFingerprints, existing).map((row) => {
      const { fingerprint, ...rest } = row;
      void fingerprint;
      return rest;
    });
  };

  const flagBalanceRows = async (rows: BalanceRow[]): Promise<BalanceRow[]> => {
    const existing = await collectExistingBalanceFingerprints();
    const withFingerprints = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        fingerprint: await fingerprintForBalanceRow(row),
      }))
    );
    return applyReviewDuplicates(withFingerprints, existing).map((row) => {
      const { fingerprint, ...rest } = row;
      void fingerprint;
      return rest;
    });
  };

  const scheduleTransactionFlags = (rows: TransactionRow[]) => {
    const version = ++transactionFlagVersion.current;
    void flagTransactionRows(rows)
      .then((flagged) => {
        if (version !== transactionFlagVersion.current) {
          return;
        }
        rememberTransactionRows(flagged);
      })
      .catch((error) => {
        console.error("Error updating transaction duplicate flags:", error);
      });
  };

  const scheduleBalanceFlags = (rows: BalanceRow[]) => {
    const version = ++balanceFlagVersion.current;
    void flagBalanceRows(rows)
      .then((flagged) => {
        if (version !== balanceFlagVersion.current) {
          return;
        }
        rememberBalanceRows(flagged);
      })
      .catch((error) => {
        console.error("Error updating balance duplicate flags:", error);
      });
  };

  const loadTransactionDuplicates = async () => {
    try {
      const [transactions, transfers] = await Promise.all([
        apiClient.get<Transaction[]>("/api/transactions"),
        apiClient.get<Transfer[]>("/api/transfers"),
      ]);
      // Validate and filter out any invalid transactions/transfers
      const validTransactions = transactions.filter((t) => {
        try {
          const date = safeDateToTimestamp(t.date);
          return date !== 0 && !Number.isNaN(t.amount);
        } catch {
          return false;
        }
      });
      const validTransfers = transfers.filter((t) => {
        try {
          const date = safeDateToTimestamp(t.date);
          return date !== 0;
        } catch {
          return false;
        }
      });
      setExistingTransactions(validTransactions);
      setExistingTransfers(validTransfers);
    } catch (error) {
      console.error("Error loading transaction duplicates:", error);
      // Set empty arrays on error to prevent crashes
      setExistingTransactions([]);
      setExistingTransfers([]);
    }
  };

  const loadBalanceDuplicates = async (rows: BalanceRow[]) => {
    const accountIds = rows
      .map((row) => accountMap.get(normalizeAccountName(row.account)))
      .filter((account): account is Account => Boolean(account))
      .map((account) => account.id);
    const uniqueAccountIds = Array.from(new Set(accountIds));

    try {
      const balancePromises = uniqueAccountIds.map((accountId) =>
        apiClient.get<BalanceHistory[]>(`/api/balance-history?accountId=${accountId}`).catch(() => [])
      );
      const investmentPromises = uniqueAccountIds.map((accountId) =>
        apiClient.get<InvestmentHistory[]>(`/api/investment-history?accountId=${accountId}`).catch(() => [])
      );
      const balanceResults = await Promise.all(balancePromises);
      const investmentResults = await Promise.all(investmentPromises);
      
      // Validate and filter out any invalid balance/investment history entries
      const validBalances = balanceResults.flat().filter((h) => {
        try {
          const date = safeDateToTimestamp(h.date);
          return date !== 0 && !Number.isNaN(h.balance);
        } catch {
          return false;
        }
      });
      const validInvestments = investmentResults.flat().filter((h) => {
        try {
          const date = safeDateToTimestamp(h.date);
          return date !== 0 && !Number.isNaN(h.balance);
        } catch {
          return false;
        }
      });
      
      setExistingBalances(validBalances);
      setExistingInvestments(validInvestments);
    } catch (error) {
      console.error("Error loading balance duplicates:", error);
      // Set empty arrays on error to prevent crashes
      setExistingBalances([]);
      setExistingInvestments([]);
    }
  };

  const applyAccountDuplicateFlag = (row: AccountRow) => {
    // Duplicate checking is done during validation, so this is mainly for consistency
    // The duplicate flag is set during validation if account name already exists
    return row;
  };

  useEffect(() => {
    if (importType === "transactions" && transactionRows.length > 0) {
      loadTransactionDuplicates();
    }
    if (importType === "balances" && balanceRows.length > 0) {
      loadBalanceDuplicates(balanceRows);
    }
    // Reload when the import type or row count changes. Edits do not refetch the ledger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importType, transactionRows.length, balanceRows.length, accountMap]);

  useEffect(() => {
    if (importType !== "transactions" || transactionRows.length === 0) {
      return;
    }
    scheduleTransactionFlags(transactionRowsRef.current);
    // Recompute when the ledger preview or the row count changes. Edits schedule their own pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingTransactions, existingTransfers, importType, transactionRows.length, accountMap]);

  useEffect(() => {
    if (importType !== "balances" || balanceRows.length === 0) {
      return;
    }
    scheduleBalanceFlags(balanceRowsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingBalances, existingInvestments, importType, balanceRows.length, accountMap]);

  const processFile = async () => {
    // Check if we have either file or paste content
    if (!file && !pasteContent?.trim()) {
      return false;
    }

    setIsProcessing(true);
    setParseErrors([]);
    setHeaderErrors([]);
    setImportError(null);

    try {
      let result: {
        data: Record<string, string>[];
        headers: string[];
        errors: string[];
      };

      // Use file if available, otherwise use paste content
      if (file) {
        result = await parseCsvFile<Record<string, string>>(file);
      } else if (pasteContent?.trim()) {
        // Enforce 5,000 row limit (already checked in parseCsvString, but double-check)
        const rowCount = countCsvRows(pasteContent);
        if (rowCount > 5000) {
          setParseErrors([`CSV contains too many rows (${rowCount}). Maximum allowed is 5,000 rows.`]);
          setIsProcessing(false);
          return false;
        }
        result = await parseCsvString<Record<string, string>>(pasteContent, importType);
      } else {
        setIsProcessing(false);
        return false;
      }

      if (result.errors.length > 0) {
        setParseErrors(result.errors);
      }
      const missingHeaders = getMissingHeaders(result.headers, getRequiredHeaders(importType));
      if (missingHeaders.length > 0) {
        setHeaderErrors(missingHeaders);
        setIsProcessing(false);
        return false;
      }

      if (importType === "transactions") {
        const validated = validateTransactionRows(result.data, accounts, transactionCategories);
        setTransactionRows(validated);
      } else if (importType === "balances") {
        const validated = validateBalanceRows(result.data, accounts);
        setBalanceRows(validated);
      } else {
        const validated = validateAccountRows(result.data, accounts, accountCategoryIdentifiers);
        setAccountRows(validated);
      }
      setIsProcessing(false);
      return true;
    } catch (error) {
      setParseErrors([error instanceof Error ? error.message : "Failed to parse CSV"]);
      setIsProcessing(false);
      return false;
    }
  };

  const updateTransactionRow = (rowId: string, key: keyof TransactionRow, value: string) => {
    try {
      const identityChanged = TRANSACTION_IDENTITY_KEYS.has(String(key));
      const nextRows = transactionRowsRef.current.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        try {
          const updatedRow = { ...row, [key]: value };
          const rawRow = {
            date: updatedRow.date,
            account: updatedRow.account,
            description: updatedRow.description,
            amount: updatedRow.amount,
            from_amount: updatedRow.fromAmount,
            to_amount: updatedRow.toAmount,
            category: updatedRow.category,
            type: updatedRow.type,
            transfer_account: updatedRow.transferAccount,
          };
          const [validated] = validateTransactionRows([rawRow], accounts, transactionCategories);
          return {
            ...validated,
            id: row.id,
            rowNumber: row.rowNumber,
            excluded: identityChanged ? false : row.excluded,
            overrideDuplicate: identityChanged ? false : row.overrideDuplicate,
            duplicate: identityChanged ? false : row.duplicate,
            categoryTouched: row.categoryTouched,
            ruleMatch: row.ruleMatch,
          };
        } catch (error) {
          console.error("Error updating transaction row:", error, row);
          return row;
        }
      });
      rememberTransactionRows(nextRows);
      scheduleTransactionFlags(nextRows);
    } catch (error) {
      console.error("Error in updateTransactionRow:", error);
    }
  };

  const updateBalanceRow = (rowId: string, key: keyof BalanceRow, value: string) => {
    try {
      const identityChanged = BALANCE_IDENTITY_KEYS.has(String(key));
      const nextRows = balanceRowsRef.current.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        try {
          const updatedRow = { ...row, [key]: value };
          const rawRow = {
            date: updatedRow.date,
            account: updatedRow.account,
            balance: updatedRow.balance,
          };
          const [validated] = validateBalanceRows([rawRow], accounts);
          return {
            ...validated,
            id: row.id,
            rowNumber: row.rowNumber,
            excluded: identityChanged ? false : row.excluded,
            overrideDuplicate: identityChanged ? false : row.overrideDuplicate,
            duplicate: identityChanged ? false : row.duplicate,
          };
        } catch (error) {
          console.error("Error updating balance row:", error, row);
          return row;
        }
      });
      rememberBalanceRows(nextRows);
      scheduleBalanceFlags(nextRows);
    } catch (error) {
      console.error("Error in updateBalanceRow:", error);
    }
  };

  const toggleTransactionExcluded = (rowId: string) => {
    const nextRows = transactionRowsRef.current.map((row) => {
      if (row.id !== rowId || !row.duplicate) {
        return row;
      }
      const excluded = !row.excluded;
      return { ...row, excluded, overrideDuplicate: !excluded };
    });
    rememberTransactionRows(nextRows);
  };

  const toggleBalanceExcluded = (rowId: string) => {
    const nextRows = balanceRowsRef.current.map((row) => {
      if (row.id !== rowId || !row.duplicate) {
        return row;
      }
      const excluded = !row.excluded;
      return { ...row, excluded, overrideDuplicate: !excluded };
    });
    rememberBalanceRows(nextRows);
  };

  const updateAccountRow = (rowId: string, key: keyof AccountRow, value: string) => {
    setAccountRows((currentRows) => {
      const nextRows = currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const updatedRow = { ...row, [key]: value };
        const rawRow = {
          name: updatedRow.name,
          type: updatedRow.type,
          nature: updatedRow.nature,
          category: updatedRow.category,
          currency: updatedRow.currency,
          initial_balance: updatedRow.initialBalance,
        };
        const [validated] = validateAccountRows([rawRow], accounts, accountCategoryIdentifiers);
        const updated = {
          ...validated,
          id: row.id,
          rowNumber: row.rowNumber,
        };
        return applyAccountDuplicateFlag(updated);
      });

      return nextRows;
    });
  };

  const importRows = async () => {
    setImportError(null);
    setIsImporting(true);

    try {
      if (importType === "transactions") {
        const validRows = transactionRows.filter((row) => row.errors.length === 0 && !row.excluded);
        if (validRows.length === 0) {
          throw new Error("No valid rows to import.");
        }

        const payload = validRows.map((row) => {
          const account = accountMap.get(normalizeAccountName(row.account));
          if (!account) {
            throw new Error(`Account not found: ${row.account}`);
          }
          if (row.type === "transfer") {
            const transferAccount = accountMap.get(normalizeAccountName(row.transferAccount));
            if (!transferAccount) {
              throw new Error(`Transfer account not found: ${row.transferAccount}`);
            }
            return {
              type: "transfer" as const,
              fromAccountId: account.id,
              toAccountId: transferAccount.id,
              fromAmount: Number(row.fromAmount),
              toAmount: Number(row.toAmount),
              description: row.description || null,
              date: row.date,
              ...(row.duplicate ? { overrideDuplicate: true } : {}),
            };
          }

          return {
            type: row.type as "debit" | "credit",
            accountId: account.id,
            category: transactionCategories.includes(row.category) ? row.category : (transactionCategories.includes("Other Expenses") ? "Other Expenses" : transactionCategories[0] || "Other Expenses"),
            amount: Number(row.amount),
            description: row.description || null,
            date: row.date,
            ...(row.duplicate ? { overrideDuplicate: true } : {}),
          };
        });

        // Calculate file hash for tracking
        let fileHash: string | undefined;
        const currentFileName = fileName || "Unknown";
        
        if (validRows.length > 0) {
          try {
            const firstRow = validRows[0];
            const lastRow = validRows[validRows.length - 1];
            const firstRowData: Record<string, string> = {
              date: firstRow.date,
              account: firstRow.account,
              description: firstRow.description || "",
              amount: String(firstRow.amount || firstRow.fromAmount || ""),
              type: firstRow.type,
            };
            const lastRowData: Record<string, string> = {
              date: lastRow.date,
              account: lastRow.account,
              description: lastRow.description || "",
              amount: String(lastRow.amount || lastRow.fromAmount || ""),
              type: lastRow.type,
            };
            
            fileHash = await calculateFileHash(
              currentFileName,
              validRows.length,
              firstRowData,
              lastRowData
            );
          } catch (error) {
            console.warn("Failed to calculate file hash:", error);
            // Continue without file hash - import tracking is optional
          }
        }

        const result = await apiClient.post<{
          transactions: number;
          transfers: number;
          skippedDuplicates?: number;
          importId?: string | null;
          isDuplicate?: boolean;
        }>("/api/import/transactions", { 
          rows: payload,
          filename: currentFileName,
          fileHash: fileHash,
        });

        const skippedDuplicates = result.skippedDuplicates ?? 0;
        const fileAlreadyImported = result.isDuplicate === true;
        reportImportNotices(skippedDuplicates, fileAlreadyImported);

        setCompletion({
          type: "transactions",
          transactions: result.transactions,
          transfers: result.transfers,
          total: result.transactions + result.transfers,
          skippedDuplicates,
          fileAlreadyImported,
        });
      } else if (importType === "balances") {
        const validRows = balanceRows.filter((row) => row.errors.length === 0 && !row.excluded);
        if (validRows.length === 0) {
          throw new Error("No valid rows to import.");
        }

        const payload = validRows.map((row) => {
          const account = accountMap.get(normalizeAccountName(row.account));
          if (!account) {
            throw new Error(`Account not found: ${row.account}`);
          }

          return {
            accountId: account.id,
            balance: Number(row.balance),
            date: row.date,
            ...(row.duplicate ? { overrideDuplicate: true } : {}),
          };
        });

        // Calculate file hash for tracking
        let fileHash: string | undefined;
        const currentFileName = fileName || "Unknown";
        
        if (validRows.length > 0) {
          try {
            const firstRow = validRows[0];
            const lastRow = validRows[validRows.length - 1];
            const firstRowData: Record<string, string> = {
              date: firstRow.date,
              account: firstRow.account,
              balance: String(firstRow.balance),
            };
            const lastRowData: Record<string, string> = {
              date: lastRow.date,
              account: lastRow.account,
              balance: String(lastRow.balance),
            };
            
            fileHash = await calculateFileHash(
              currentFileName,
              validRows.length,
              firstRowData,
              lastRowData
            );
          } catch (error) {
            console.warn("Failed to calculate file hash:", error);
            // Continue without file hash - import tracking is optional
          }
        }

        const result = await apiClient.post<{
          balances: number;
          investments: number;
          skippedDuplicates?: number;
          importId?: string | null;
          isDuplicate?: boolean;
        }>("/api/import/balances", { 
          rows: payload,
          filename: currentFileName,
          fileHash: fileHash,
        });

        const skippedDuplicates = result.skippedDuplicates ?? 0;
        const fileAlreadyImported = result.isDuplicate === true;
        reportImportNotices(skippedDuplicates, fileAlreadyImported);

        setCompletion({
          type: "balances",
          balances: result.balances,
          investments: result.investments,
          total: result.balances + result.investments,
          skippedDuplicates,
          fileAlreadyImported,
        });
      } else if (importType === "accounts") {
        const validRows = accountRows.filter((row) => row.errors.length === 0);
        if (validRows.length === 0) {
          throw new Error("No valid rows to import.");
        }

        // Check for duplicates against existing accounts
        const duplicateNames = validRows
          .map((row) => {
            const normalizedName = normalizeAccountName(row.name);
            return accountMap.has(normalizedName) ? row.name : null;
          })
          .filter((name): name is string => name !== null);

        if (duplicateNames.length > 0) {
          throw new Error(`Duplicate accounts found: ${duplicateNames.join(", ")}`);
        }

        const payload = validRows.map((row) => ({
          name: row.name,
          type: row.type as "balance" | "transaction" | "investment",
          nature: row.nature as "asset" | "liability",
          category: row.category,
          currency: row.currency,
          initialBalance: Number(row.initialBalance),
        }));

        const result = await apiClient.post<{
          success: boolean;
          accounts: number;
        }>("/api/import/accounts", { rows: payload });

        setCompletion({
          type: "accounts",
          accounts: result.accounts,
        });

        // Refresh accounts list after successful import
        try {
          const data = await apiClient.get<Account[]>("/api/accounts");
          setAccounts(data);
        } catch (error) {
          console.error("Failed to refresh accounts:", error);
        }
      }

      setIsImporting(false);
      return true;
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed");
      setIsImporting(false);
      return false;
    }
  };

  const summary =
    importType === "transactions"
      ? summarizeRows(transactionRows)
      : importType === "balances"
        ? summarizeRows(balanceRows)
        : summarizeRows(accountRows);

  return {
    step,
    setStep,
    importType,
    setImportType,
    file,
    fileName,
    selectFile,
    pasteContent,
    selectPaste,
    parseErrors,
    headerErrors,
    transactionRows,
    balanceRows,
    accountRows,
    isProcessing,
    isImporting,
    importError,
    completion,
    accounts,
    summary,
    resetImportState,
    processFile,
    updateTransactionRow,
    updateBalanceRow,
    updateAccountRow,
    toggleTransactionExcluded,
    toggleBalanceExcluded,
    importRows,
  };
};

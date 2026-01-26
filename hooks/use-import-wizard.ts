import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { CATEGORIES } from "@/lib/categories";
import { Account, BalanceHistory, InvestmentHistory, Transaction, Transfer } from "@/lib/db/schema";
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
import { parseCsvFile } from "@/lib/csv/parse";

export type ImportType = "transactions" | "balances" | "accounts";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export type TransactionRow = ParsedTransactionRow & { duplicate?: boolean };
export type BalanceRow = ParsedBalanceRow & { duplicate?: boolean };
export type AccountRow = ParsedAccountRow & { duplicate?: boolean };

export type CompletionSummary =
  | {
      type: "transactions";
      transactions: number;
      transfers: number;
      total: number;
    }
  | {
      type: "balances";
      balances: number;
      investments: number;
      total: number;
    }
  | {
      type: "accounts";
      accounts: number;
    };

const normalizeAccountName = (name: string) => name.trim().toLowerCase();

const getDateKey = (value: number) => new Date(value).toISOString().split("T")[0];

const buildTransactionKey = (accountId: string, date: string, amount: number, description: string) =>
  `${accountId}|${date}|${amount}|${description.trim().toLowerCase()}`;

const buildTransferKey = (fromId: string, toId: string, date: string, amount: number) =>
  `${fromId}|${toId}|${date}|${amount}`;

const buildBalanceKey = (accountId: string, date: string, balance: number) =>
  `${accountId}|${date}|${balance}`;

const getTransactionSummary = (rows: TransactionRow[]) => {
  const total = rows.length;
  const invalid = rows.filter((row) => row.errors.length > 0).length;
  const warnings = rows.filter((row) => row.warnings.length > 0).length;
  const duplicates = rows.filter((row) => row.duplicate).length;
  return {
    total,
    invalid,
    warnings,
    duplicates,
    valid: total - invalid,
  };
};

const getBalanceSummary = (rows: BalanceRow[]) => {
  const total = rows.length;
  const invalid = rows.filter((row) => row.errors.length > 0).length;
  const warnings = rows.filter((row) => row.warnings.length > 0).length;
  const duplicates = rows.filter((row) => row.duplicate).length;
  return {
    total,
    invalid,
    warnings,
    duplicates,
    valid: total - invalid,
  };
};

const getAccountSummary = (rows: AccountRow[]) => {
  const total = rows.length;
  const invalid = rows.filter((row) => row.errors.length > 0).length;
  const warnings = rows.filter((row) => row.warnings.length > 0).length;
  const duplicates = rows.filter((row) => row.duplicate).length;
  return {
    total,
    invalid,
    warnings,
    duplicates,
    valid: total - invalid,
  };
};

const updateRowsIfChanged = <Row extends { duplicate?: boolean; warnings: string[] }>(
  rows: Row[],
  updateRow: (row: Row) => Row
) => {
  const nextRows = rows.map(updateRow);
  const changed = nextRows.some((row, index) => {
    const previous = rows[index];
    return (
      row.duplicate !== previous.duplicate ||
      row.warnings.join("|") !== previous.warnings.join("|")
    );
  });
  return changed ? nextRows : rows;
};

export const useImportWizard = () => {
  const [step, setStep] = useState<WizardStep>(1);
  const [importType, setImportTypeState] = useState<ImportType>("transactions");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | undefined>();
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
  const [existingTransactions, setExistingTransactions] = useState<Transaction[]>([]);
  const [existingTransfers, setExistingTransfers] = useState<Transfer[]>([]);
  const [existingBalances, setExistingBalances] = useState<BalanceHistory[]>([]);
  const [existingInvestments, setExistingInvestments] = useState<InvestmentHistory[]>([]);

  const accountMap = useMemo(() => buildAccountNameMap(accounts), [accounts]);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const data = await apiClient.get<Account[]>("/api/accounts");
        setAccounts(data);
      } catch (error) {
        console.error(error);
      }
    };

    loadAccounts();
  }, []);

  const resetImportState = () => {
    setFile(null);
    setFileName(undefined);
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
    setFile(selectedFile);
    setFileName(selectedFile.name);
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

  const applyTransactionDuplicateFlag = (row: TransactionRow) => {
    const account = accountMap.get(normalizeAccountName(row.account));
    if (!account) {
      return row;
    }
    const amountValue = Number(row.amount);
    const descriptionValue = row.description || "";
    let isDuplicate = false;

    if (row.type === "transfer") {
      const transferAccount = accountMap.get(normalizeAccountName(row.transferAccount));
      if (transferAccount) {
        const key = buildTransferKey(account.id, transferAccount.id, row.date, amountValue);
        isDuplicate = existingTransfers.some(
          (transfer) =>
            buildTransferKey(
              transfer.fromAccountId,
              transfer.toAccountId,
              getDateKey(transfer.date.getTime()),
              transfer.amount
            ) === key
        );
      }
    } else {
      const key = buildTransactionKey(account.id, row.date, amountValue, descriptionValue);
      isDuplicate = existingTransactions.some(
        (transaction) =>
          buildTransactionKey(
            transaction.accountId,
            getDateKey(transaction.date.getTime()),
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
        warnings: [...row.warnings, warningMessage],
      };
    }
    if (!isDuplicate && hasWarning) {
      return {
        ...row,
        duplicate: false,
        warnings: row.warnings.filter((warning) => warning !== warningMessage),
      };
    }
    return { ...row, duplicate: isDuplicate };
  };

  const applyBalanceDuplicateFlag = (row: BalanceRow) => {
    const account = accountMap.get(normalizeAccountName(row.account));
    if (!account) {
      return row;
    }
    const balanceValue = Number(row.balance);
    const key = buildBalanceKey(account.id, row.date, balanceValue);

    const matchesHistory = (history: BalanceHistory | InvestmentHistory) =>
      buildBalanceKey(
        history.accountId,
        getDateKey(new Date(history.date).getTime()),
        history.balance
      ) === key;

    const isDuplicate =
      existingBalances.some(matchesHistory) || existingInvestments.some(matchesHistory);

    const warningMessage = "Possible duplicate";
    const hasWarning = row.warnings.includes(warningMessage);
    if (isDuplicate && !hasWarning) {
      return {
        ...row,
        duplicate: true,
        warnings: [...row.warnings, warningMessage],
      };
    }
    if (!isDuplicate && hasWarning) {
      return {
        ...row,
        duplicate: false,
        warnings: row.warnings.filter((warning) => warning !== warningMessage),
      };
    }
    return { ...row, duplicate: isDuplicate };
  };

  const loadTransactionDuplicates = async () => {
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
      setExistingBalances(balanceResults.flat());
      setExistingInvestments(investmentResults.flat());
    } catch (error) {
      console.error(error);
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
  }, [importType, transactionRows.length, balanceRows.length, accountMap]);

  useEffect(() => {
    if (importType !== "transactions") {
      return;
    }
    if (transactionRows.length === 0) {
      return;
    }
    setTransactionRows((currentRows) =>
      updateRowsIfChanged(currentRows, applyTransactionDuplicateFlag)
    );
  }, [existingTransactions, existingTransfers, importType, transactionRows.length]);

  useEffect(() => {
    if (importType !== "balances") {
      return;
    }
    if (balanceRows.length === 0) {
      return;
    }
    setBalanceRows((currentRows) =>
      updateRowsIfChanged(currentRows, applyBalanceDuplicateFlag)
    );
  }, [existingBalances, existingInvestments, importType, balanceRows.length]);

  const processFile = async () => {
    if (!file) {
      return false;
    }

    setIsProcessing(true);
    setParseErrors([]);
    setHeaderErrors([]);
    setImportError(null);

    try {
      const result = await parseCsvFile<Record<string, string>>(file);
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
        const validated = validateTransactionRows(result.data, accounts);
        setTransactionRows(validated);
      } else if (importType === "balances") {
        const validated = validateBalanceRows(result.data, accounts);
        setBalanceRows(validated);
      } else {
        const validated = validateAccountRows(result.data, accounts);
        setAccountRows(validated);
      }
      setIsProcessing(false);
      return true;
    } catch (error) {
      setParseErrors([error instanceof Error ? error.message : "Failed to parse CSV file"]);
      setIsProcessing(false);
      return false;
    }
  };

  const updateTransactionRow = (rowId: string, key: keyof TransactionRow, value: string) => {
    setTransactionRows((currentRows) => {
      const nextRows = currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const updatedRow = { ...row, [key]: value };
        const rawRow = {
          date: updatedRow.date,
          account: updatedRow.account,
          description: updatedRow.description,
          amount: updatedRow.amount,
          category: updatedRow.category,
          type: updatedRow.type,
          transfer_account: updatedRow.transferAccount,
        };
        const [validated] = validateTransactionRows([rawRow], accounts);
        const updated = {
          ...validated,
          id: row.id,
          rowNumber: row.rowNumber,
        };
        return applyTransactionDuplicateFlag(updated);
      });

      return nextRows;
    });
  };

  const updateBalanceRow = (rowId: string, key: keyof BalanceRow, value: string) => {
    setBalanceRows((currentRows) => {
      const nextRows = currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const updatedRow = { ...row, [key]: value };
        const rawRow = {
          date: updatedRow.date,
          account: updatedRow.account,
          balance: updatedRow.balance,
        };
        const [validated] = validateBalanceRows([rawRow], accounts);
        const updated = {
          ...validated,
          id: row.id,
          rowNumber: row.rowNumber,
        };
        return applyBalanceDuplicateFlag(updated);
      });

      return nextRows;
    });
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
        const [validated] = validateAccountRows([rawRow], accounts);
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
        const validRows = transactionRows.filter((row) => row.errors.length === 0);
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
              type: "transfer",
              fromAccountId: account.id,
              toAccountId: transferAccount.id,
              amount: Number(row.amount),
              description: row.description || null,
              date: row.date,
            };
          }

          return {
            type: row.type,
            accountId: account.id,
            category: CATEGORIES.includes(row.category as any) ? row.category as any : "Other Expenses",
            amount: Number(row.amount),
            description: row.description || null,
            date: row.date,
          };
        });

        const result = await apiClient.post<{
          transactions: number;
          transfers: number;
        }>("/api/import/transactions", { rows: payload });

        setCompletion({
          type: "transactions",
          transactions: result.transactions,
          transfers: result.transfers,
          total: result.transactions + result.transfers,
        });
      } else if (importType === "balances") {
        const validRows = balanceRows.filter((row) => row.errors.length === 0);
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
          };
        });

        const result = await apiClient.post<{
          balances: number;
          investments: number;
        }>("/api/import/balances", { rows: payload });

        setCompletion({
          type: "balances",
          balances: result.balances,
          investments: result.investments,
          total: result.balances + result.investments,
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
      ? getTransactionSummary(transactionRows)
      : importType === "balances"
        ? getBalanceSummary(balanceRows)
        : getAccountSummary(accountRows);

  return {
    step,
    setStep,
    importType,
    setImportType,
    file,
    fileName,
    selectFile,
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
    importRows,
  };
};

"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { CATEGORIES } from "@/lib/categories";
import { Account, Transaction, Transfer } from "@/lib/db/schema";
import { CsvUpload } from "@/components/csv-import/csv-upload";
import { CsvReviewTable } from "@/components/csv-import/csv-review-table";
import { CsvImportSummary } from "@/components/csv-import/csv-import-summary";
import {
  buildAccountNameMap,
  getMissingHeaders,
  getRequiredHeaders,
  ParsedTransactionRow,
  validateTransactionRows,
} from "@/lib/csv/import-validators";
import { parseCsvFile } from "@/lib/csv/parse";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type TransactionRow = ParsedTransactionRow & { duplicate?: boolean };

const normalizeAccountName = (name: string) => name.trim().toLowerCase();

const getDateKey = (value: number) => new Date(value).toISOString().split("T")[0];

const buildTransactionKey = (accountId: string, date: string, amount: number, description: string) =>
  `${accountId}|${date}|${amount}|${description.trim().toLowerCase()}`;

const buildTransferKey = (fromId: string, toId: string, date: string, amount: number) =>
  `${fromId}|${toId}|${date}|${amount}`;

const getSummary = (rows: TransactionRow[]) => {
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

export const TransactionsCsvImport = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [existingTransactions, setExistingTransactions] = useState<Transaction[]>([]);
  const [existingTransfers, setExistingTransfers] = useState<Transfer[]>([]);

  const accountMap = useMemo(() => buildAccountNameMap(accounts), [accounts]);

  const applyDuplicateFlag = (row: TransactionRow) => {
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
    if (rows.length === 0 || existingTransactions.length === 0 && existingTransfers.length === 0) {
      return;
    }

    setRows((currentRows) => {
      return currentRows.map((row) => {
        return applyDuplicateFlag(row);
      });
    });
  }, [accountMap, existingTransactions, existingTransfers, rows.length]);

  const summary = getSummary(rows);

  const handleClear = () => {
    setRows([]);
    setParseErrors([]);
    setHeaderErrors([]);
    setFileName(undefined);
    setImportError(null);
  };

  const handleFileSelected = async (file: File) => {
    setParseErrors([]);
    setHeaderErrors([]);
    setImportError(null);
    setFileName(file.name);

    try {
      const result = await parseCsvFile<Record<string, string>>(file);
      if (result.errors.length > 0) {
        setParseErrors(result.errors);
      }
      const missingHeaders = getMissingHeaders(
        result.headers,
        getRequiredHeaders("transactions")
      );
      if (missingHeaders.length > 0) {
        setHeaderErrors(missingHeaders);
        setRows([]);
        return;
      }

      const validated = validateTransactionRows(result.data, accounts);
      setRows(validated);
    } catch (error) {
      setParseErrors([error instanceof Error ? error.message : "Failed to parse CSV file"]);
    }
  };

  const updateRow = (rowId: string, key: keyof TransactionRow, value: string) => {
    setRows((currentRows) => {
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
        return applyDuplicateFlag(updated);
      });

      return nextRows;
    });
  };

  const handleImport = async () => {
    setImportError(null);
    setIsImporting(true);

    try {
      const validRows = rows.filter((row) => row.errors.length === 0);
      if (validRows.length === 0) {
        setImportError("No valid rows to import.");
        setIsImporting(false);
        return;
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
          category: row.category || "Other",
          amount: Number(row.amount),
          description: row.description || null,
          date: row.date,
        };
      });

      await apiClient.post("/api/import/transactions", { rows: payload });
      toast.success(`Imported ${validRows.length} transactions`);
      handleClear();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import transactions";
      setImportError(message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Transactions</CardTitle>
        <CardDescription>
          Upload a Netly CSV to import transactions and transfers across multiple accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CsvUpload
          label="Transactions CSV"
          templateUrl="/templates/transactions.csv"
          fileName={fileName}
          onFileSelected={handleFileSelected}
          onClear={handleClear}
          disabled={isImporting}
        />

        {(parseErrors.length > 0 || headerErrors.length > 0) && (
          <Alert variant="destructive">
            <AlertDescription className="space-y-1">
              {parseErrors.map((error, index) => (
                <p key={`parse-${index}`}>{error}</p>
              ))}
              {headerErrors.length > 0 && (
                <p>Missing required headers: {headerErrors.join(", ")}</p>
              )}
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

            <CsvReviewTable
              rows={rows}
              onRowChange={updateRow}
              columns={[
                { key: "date", label: "Date", inputType: "date" },
                {
                  key: "account",
                  label: "Account",
                  render: (row, onChange) => (
                    <Select value={row.account} onValueChange={onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.name}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ),
                },
                { key: "description", label: "Description" },
                { key: "amount", label: "Amount", inputType: "number" },
                {
                  key: "category",
                  label: "Category",
                  render: (row, onChange) => (
                    <Select value={row.category} onValueChange={onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ),
                },
                {
                  key: "type",
                  label: "Type",
                  render: (row, onChange) => (
                    <Select value={row.type} onValueChange={onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debit">Debit</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  ),
                },
                {
                  key: "transferAccount",
                  label: "Transfer Account",
                  render: (row, onChange) => (
                    <Select
                      value={row.transferAccount || "__none__"}
                      onValueChange={(value) => onChange(value === "__none__" ? "" : value)}
                      disabled={row.type !== "transfer"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.name}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ),
                },
              ]}
            />

            {importError && (
              <Alert variant="destructive">
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={handleImport} disabled={isImporting || summary.invalid > 0}>
                {isImporting ? "Importing..." : "Import transactions"}
              </Button>
              {summary.invalid > 0 && (
                <p className="text-xs text-muted-foreground">
                  Fix errors before importing.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

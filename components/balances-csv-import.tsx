"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Account, BalanceHistory, InvestmentHistory } from "@/lib/db/schema";
import { CsvUpload } from "@/components/csv-import/csv-upload";
import { CsvReviewTable } from "@/components/csv-import/csv-review-table";
import { CsvImportSummary } from "@/components/csv-import/csv-import-summary";
import {
  buildAccountNameMap,
  getMissingHeaders,
  getRequiredHeaders,
  ParsedBalanceRow,
  validateBalanceRows,
} from "@/lib/csv/import-validators";
import { parseCsvFile } from "@/lib/csv/parse";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type BalanceRow = ParsedBalanceRow & { duplicate?: boolean };

const normalizeAccountName = (name: string) => name.trim().toLowerCase();

const getDateKey = (value: number) => new Date(value).toISOString().split("T")[0];

const buildBalanceKey = (accountId: string, date: string, balance: number) =>
  `${accountId}|${date}|${balance}`;

const getSummary = (rows: BalanceRow[]) => {
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

export const BalancesCsvImport = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
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

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }

    const loadExisting = async () => {
      const accountIds = rows
        .map((row) => accountMap.get(normalizeAccountName(row.account)))
        .filter((account): account is Account => Boolean(account))
        .map((account) => account.id);
      const uniqueAccountIds = Array.from(new Set(accountIds));

      try {
        const balancePromises = uniqueAccountIds.map((accountId) =>
          apiClient.get<BalanceHistory[]>(`/api/balance-history?accountId=${accountId}`)
            .catch(() => [])
        );
        const investmentPromises = uniqueAccountIds.map((accountId) =>
          apiClient.get<InvestmentHistory[]>(`/api/investment-history?accountId=${accountId}`)
            .catch(() => [])
        );
        const balanceResults = await Promise.all(balancePromises);
        const investmentResults = await Promise.all(investmentPromises);
        setExistingBalances(balanceResults.flat());
        setExistingInvestments(investmentResults.flat());
      } catch (error) {
        console.error(error);
      }
    };

    loadExisting();
  }, [accountMap, rows.length]);

  const applyDuplicateFlag = (row: BalanceRow) => {
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

  useEffect(() => {
    if (rows.length === 0 || (existingBalances.length === 0 && existingInvestments.length === 0)) {
      return;
    }

    setRows((currentRows) => currentRows.map((row) => applyDuplicateFlag(row)));
  }, [existingBalances, existingInvestments, rows.length]);

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
      const missingHeaders = getMissingHeaders(result.headers, getRequiredHeaders("balances"));
      if (missingHeaders.length > 0) {
        setHeaderErrors(missingHeaders);
        setRows([]);
        return;
      }

      const validated = validateBalanceRows(result.data, accounts);
      setRows(validated);
    } catch (error) {
      setParseErrors([error instanceof Error ? error.message : "Failed to parse CSV file"]);
    }
  };

  const updateRow = (rowId: string, key: keyof BalanceRow, value: string) => {
    setRows((currentRows) => {
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

        return {
          accountId: account.id,
          balance: Number(row.balance),
          date: row.date,
        };
      });

      await apiClient.post("/api/import/balances", { rows: payload });
      toast.success(`Imported ${validRows.length} balance updates`);
      handleClear();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import balances";
      setImportError(message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Balances</CardTitle>
        <CardDescription>
          Upload a Netly CSV to add historical balance or investment updates for multiple accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CsvUpload
          label="Balances CSV"
          templateUrl="/templates/balances.csv"
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
                { key: "balance", label: "Balance", inputType: "number" },
              ]}
            />

            {importError && (
              <Alert variant="destructive">
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={handleImport} disabled={isImporting || summary.invalid > 0}>
                {isImporting ? "Importing..." : "Import balances"}
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

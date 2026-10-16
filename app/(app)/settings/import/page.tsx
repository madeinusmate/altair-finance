"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CsvImportSummary } from "@/components/csv-import/csv-import-summary";
import { CsvReviewTable } from "@/components/csv-import/csv-review-table";
import { CsvUpload } from "@/components/csv-import/csv-upload";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { useImportWizard } from "@/hooks/use-import-wizard";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { PdfStatementImport } from "@/components/pdf-import/pdf-statement-import";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryAllowance, categorySelectOptions, toCategoryAllowances } from "@/lib/categorization/rules";
import { PayeeCombobox } from "@/components/payee-combobox";

const steps = [
  { id: 1, label: "Select type" },
  { id: 2, label: "Select file" },
  { id: 3, label: "Processing" },
  { id: 4, label: "Review" },
  { id: 5, label: "Complete" },
];

const importTypeSummary: Record<"transactions" | "balances" | "accounts", string> = {
  transactions: "transactions and transfers",
  balances: "balances and investments",
  accounts: "accounts",
};

type ReviewFilter = "all" | "valid" | "invalid" | "warnings" | "duplicates";

const filterRows = <Row extends { errors: string[]; warnings: string[]; duplicate?: boolean; excluded?: boolean }>(
  rows: Row[],
  filter: ReviewFilter
) => {
  switch (filter) {
    case "valid":
      return rows.filter((row) => row.errors.length === 0 && !row.excluded);
    case "invalid":
      return rows.filter((row) => row.errors.length > 0);
    case "warnings":
      return rows.filter((row) => row.warnings.length > 0);
    case "duplicates":
      return rows.filter((row) => row.duplicate);
    case "all":
    default:
      return rows;
  }
};

const ImportWizardPage = () => {
  const { getKey, usesBooksOwner } = useAuth();
  const {
    step,
    setStep,
    importType,
    setImportType,
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
  } = useImportWizard();

  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [payees, setPayees] = useState<Array<{ id: string; name: string }>>([]);
  const [transactionCategories, setTransactionCategories] = useState<CategoryAllowance[]>([]);
  const [accountCategoryIdentifiers, setAccountCategoryIdentifiers] = useState<string[]>([]);
  const [accountCategoryNames, setAccountCategoryNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const loadCategories = async () => {
      const key = getKey();
      if (!key && !usesBooksOwner) return;

      try {
        const [txData, acctData, payeesData] = await Promise.all([
          apiClient.get<{ categories: Array<{ name: string; transactionType?: string | null }> }>("/api/transaction-categories"),
          apiClient.get<{ categories: Array<{ identifier: string; name: string }> }>("/api/account-categories"),
          apiClient.get<{ payees: Array<{ id: string; name: string }> }>("/api/payees"),
        ]);
        setPayees(payeesData.payees || []);
        setTransactionCategories(toCategoryAllowances(txData.categories));
        setAccountCategoryIdentifiers(acctData.categories.map((c) => c.identifier));
        const nameMap = new Map(acctData.categories.map((c) => [c.identifier, c.name]));
        setAccountCategoryNames(nameMap);
      } catch (error) {
        console.error("Error loading categories:", error);
      }
    };

    loadCategories();
  }, [getKey]);

  const rows =
    importType === "transactions"
      ? transactionRows
      : importType === "balances"
        ? balanceRows
        : accountRows;

  const templateUrl =
    importType === "transactions"
      ? "/templates/transactions.csv"
      : importType === "balances"
        ? "/templates/balances.csv"
        : "/templates/accounts.csv";

  const fileLabel =
    importType === "transactions"
      ? "Transactions CSV"
      : importType === "balances"
        ? "Balances CSV"
        : "Accounts CSV";

  const canProceedFromReview = summary.invalid === 0 && summary.valid > 0;

  // Reset filter when entering review step or when import type changes
  const resetKey = `${step}-${importType}`;
  const prevResetKeyRef = useRef(resetKey);
  
  useEffect(() => {
    if (resetKey !== prevResetKeyRef.current && (step === 4 || importType)) {
      prevResetKeyRef.current = resetKey;
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setReviewFilter("all");
      }, 0);
    }
  }, [importType, step, resetKey]);

  const filteredTransactionRows = useMemo(
    () => filterRows(transactionRows, reviewFilter),
    [reviewFilter, transactionRows]
  );
  const filteredBalanceRows = useMemo(
    () => filterRows(balanceRows, reviewFilter),
    [reviewFilter, balanceRows]
  );
  const filteredAccountRows = useMemo(
    () => filterRows(accountRows, reviewFilter),
    [reviewFilter, accountRows]
  );

  const handleProcess = async () => {
    setStep(3);
    const success = await processFile();
    setStep(success ? 4 : 2);
  };

  const handleImport = async () => {
    const success = await importRows();
    if (success) {
      setStep(5);
    }
  };

  const stepperSteps = useMemo(
    () => steps.map((stepItem) => ({ key: String(stepItem.id), label: stepItem.label })),
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings" aria-label="Back to settings" onClick={resetImportState}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-[34px] font-semibold tracking-[-0.03em]">Import Data</h1>
            <p className="text-muted-foreground">
              Import transactions, transfers, balances, and investments from CSV files or PDF statements.
            </p>
          </div>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/settings" onClick={resetImportState}>Cancel</Link>
        </Button>
      </div>

      <Tabs defaultValue="csv" className="w-full">
        <TabsList>
          <TabsTrigger value="csv">CSV Import</TabsTrigger>
          <TabsTrigger value="pdf">PDF Statement Import</TabsTrigger>
        </TabsList>

        <TabsContent value="csv" className="space-y-6">
          <Stepper
            steps={stepperSteps}
            currentStep={String(step)}
            loading={step === 3}
          />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select import type</CardTitle>
            <CardDescription>Choose what kind of data you are importing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={importType}
              onValueChange={(value) =>
                setImportType(value as "transactions" | "balances" | "accounts")
              }
              className="gap-4"
            >
              <Label className="flex items-center gap-3 rounded-md border p-4">
                <RadioGroupItem value="transactions" />
                <div>
                  <p className="font-medium">Transactions + Transfers</p>
                  <p className="text-sm text-muted-foreground">
                    Import transaction rows and transfer rows across accounts.
                  </p>
                </div>
              </Label>
              <Label className="flex items-center gap-3 rounded-md border p-4">
                <RadioGroupItem value="balances" />
                <div>
                  <p className="font-medium">Balances + Investments</p>
                  <p className="text-sm text-muted-foreground">
                    Import historical balance or investment updates.
                  </p>
                </div>
              </Label>
              <Label className="flex items-center gap-3 rounded-md border p-4">
                <RadioGroupItem value="accounts" />
                <div>
                  <p className="font-medium">Accounts</p>
                  <p className="text-sm text-muted-foreground">
                    Import multiple accounts to quickly bootstrap your account list.
                  </p>
                </div>
              </Label>
            </RadioGroup>
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t">
            <Button onClick={() => setStep(2)}>Continue</Button>
          </CardFooter>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Select file</CardTitle>
            <CardDescription>
              Upload an Altair CSV for {importTypeSummary[importType]}, or paste rows from a spreadsheet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CsvUpload
              label={fileLabel}
              templateUrl={templateUrl}
              fileName={fileName}
              importType={importType}
              pasteContent={pasteContent}
              onFileSelected={selectFile}
              onPasteChange={selectPaste}
              onClear={resetImportState}
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
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-2 border-t">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={handleProcess} disabled={!fileName && !pasteContent?.trim()}>
              Process file
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Processing file</CardTitle>
            <CardDescription>Parsing and validating your CSV.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Spinner className="size-5" />
            <p className="text-sm text-muted-foreground">
              Please wait while we validate your data.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review import</CardTitle>
            <CardDescription>
              Fix any errors. Duplicate rows are left out unless you include them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <>
                <CsvImportSummary
                  total={summary.total}
                  valid={summary.valid}
                  invalid={summary.invalid}
                  warnings={summary.warnings}
                  duplicates={summary.duplicates}
                  activeFilter={reviewFilter}
                  onFilterChange={setReviewFilter}
                />

                {(importType === "transactions" || importType === "balances") && summary.duplicates > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {summary.skipped} duplicate {summary.skipped === 1 ? "row" : "rows"} will be skipped unless included.
                  </p>
                )}

                {importType === "transactions" && (
                  <CsvReviewTable
                    rows={filteredTransactionRows}
                    onRowChange={updateTransactionRow}
                    rowHeight={112}
                    onToggleExclude={toggleTransactionExcluded}
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
                      {
                        key: "payeeName",
                        label: "Payee",
                        render: (row, onChange) =>
                          row.type === "transfer" ? (
                            <span className="text-sm text-muted-foreground">—</span>
                          ) : (
                            <PayeeCombobox
                              id={`csv-payee-${row.id}`}
                              value={row.payeeName}
                              payees={payees}
                              onChange={onChange}
                            />
                          ),
                      },
                      { key: "amount", label: "Amount", inputType: "number" },
                      {
                        key: "category",
                        label: "Category",
                        render: (row, onChange) => {
                          const options = categorySelectOptions(transactionCategories, row);
                          const ruleLabel = row.ruleMatch || row.ruleHint;
                          return (
                            <div className="min-w-44 space-y-1">
                              <Select
                                value={options.some((category) => category.name === row.category) ? row.category : undefined}
                                onValueChange={onChange}
                                disabled={row.type === "transfer"}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {options.map((category) => (
                                    <SelectItem key={category.name} value={category.name}>
                                      {category.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {ruleLabel ? (
                                <p className="text-xs text-muted-foreground">{ruleLabel}</p>
                              ) : null}
                            </div>
                          );
                        },
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
                            onValueChange={(value) =>
                              onChange(value === "__none__" ? "" : value)
                            }
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
                )}

                {importType === "balances" && (
                  <CsvReviewTable
                    rows={filteredBalanceRows}
                    onRowChange={updateBalanceRow}
                    onToggleExclude={toggleBalanceExcluded}
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
                )}

                {importType === "accounts" && (
                  <CsvReviewTable
                    rows={filteredAccountRows}
                    onRowChange={updateAccountRow}
                    columns={[
                      { key: "name", label: "Name" },
                      {
                        key: "type",
                        label: "Type",
                        render: (row, onChange) => (
                          <Select value={row.type} onValueChange={onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="balance">Balance</SelectItem>
                              <SelectItem value="transaction">Transaction</SelectItem>
                              <SelectItem value="investment">Investment</SelectItem>
                            </SelectContent>
                          </Select>
                        ),
                      },
                      {
                        key: "nature",
                        label: "Nature",
                        render: (row, onChange) => (
                          <Select value={row.nature} onValueChange={onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select nature" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="asset">Asset</SelectItem>
                              <SelectItem value="liability">Liability</SelectItem>
                            </SelectContent>
                          </Select>
                        ),
                      },
                      {
                        key: "category",
                        label: "Category",
                        render: (row, onChange) => (
                          <Select value={row.category} onValueChange={onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              {accountCategoryIdentifiers.map((identifier) => (
                                <SelectItem key={identifier} value={identifier}>
                                  {accountCategoryNames.get(identifier) || identifier.split("_").map((word) =>
                                    word.charAt(0).toUpperCase() + word.slice(1)
                                  ).join(" ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ),
                      },
                      {
                        key: "currency",
                        label: "Currency",
                        render: (row, onChange) => (
                          <Select value={row.currency} onValueChange={onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                            <SelectContent>
                              {SUPPORTED_CURRENCIES.map((currency) => (
                                <SelectItem key={currency} value={currency}>
                                  {currency}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ),
                      },
                      { key: "initialBalance", label: "Initial Balance", inputType: "number" },
                    ]}
                  />
                )}
              </>
            )}

            {importError && (
              <Alert variant="destructive">
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}

          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={!canProceedFromReview || isImporting}>
                {isImporting ? "Importing..." : "Complete import"}
              </Button>
            </div>
            {!canProceedFromReview && rows.length > 0 && summary.invalid > 0 && (
              <p className="text-xs text-muted-foreground sm:text-right">
                Fix errors before continuing.
              </p>
            )}
            {!canProceedFromReview && rows.length > 0 && summary.invalid === 0 && (
              <p className="text-xs text-muted-foreground sm:text-right">
                Duplicate rows are left out unless you include one.
              </p>
            )}
          </CardFooter>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Import complete</CardTitle>
            <CardDescription>Summary of the imported data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {completion && completion.type === "transactions" && (
              <div className="space-y-2">
                <Badge variant="secondary">Transactions: {completion.transactions}</Badge>
                <Badge variant="secondary">Transfers: {completion.transfers}</Badge>
                <Badge variant="default">Total imported: {completion.total}</Badge>
                {completion.skippedDuplicates > 0 && (
                  <Badge variant="outline">Skipped duplicates: {completion.skippedDuplicates}</Badge>
                )}
                {completion.fileAlreadyImported && (
                  <p className="text-sm text-muted-foreground">This file was imported before.</p>
                )}
              </div>
            )}
            {completion && completion.type === "balances" && (
              <div className="space-y-2">
                <Badge variant="secondary">Balances: {completion.balances}</Badge>
                <Badge variant="secondary">Investments: {completion.investments}</Badge>
                <Badge variant="default">Total imported: {completion.total}</Badge>
                {completion.skippedDuplicates > 0 && (
                  <Badge variant="outline">Skipped duplicates: {completion.skippedDuplicates}</Badge>
                )}
                {completion.fileAlreadyImported && (
                  <p className="text-sm text-muted-foreground">This file was imported before.</p>
                )}
              </div>
            )}
            {completion && completion.type === "accounts" && (
              <div className="space-y-2">
                <Badge variant="default">Total imported: {completion.accounts} accounts</Badge>
              </div>
            )}
            {!completion && (
              <p className="text-sm text-muted-foreground">
                Import completed. No summary data available.
              </p>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-2 border-t">
            <Button
              variant="outline"
              onClick={() => {
                resetImportState();
                setStep(1);
              }}
            >
              Start another import
            </Button>
            <Button asChild onClick={resetImportState}>
              <Link href="/settings">Back to settings</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="pdf" className="space-y-6">
          <PdfStatementImport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ImportWizardPage;

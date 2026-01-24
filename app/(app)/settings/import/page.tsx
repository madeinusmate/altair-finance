"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CsvImportSummary } from "@/components/csv-import/csv-import-summary";
import { CsvReviewTable } from "@/components/csv-import/csv-review-table";
import { CsvUpload } from "@/components/csv-import/csv-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { CATEGORIES } from "@/lib/categories";
import { useImportWizard } from "@/hooks/use-import-wizard";

const steps = [
  { id: 1, label: "Select type" },
  { id: 2, label: "Select file" },
  { id: 3, label: "Processing" },
  { id: 4, label: "Review" },
  { id: 5, label: "Complete" },
];

type ReviewFilter = "all" | "valid" | "invalid" | "warnings" | "duplicates";

const filterRows = <Row extends { errors: string[]; warnings: string[]; duplicate?: boolean }>(
  rows: Row[],
  filter: ReviewFilter
) => {
  switch (filter) {
    case "valid":
      return rows.filter((row) => row.errors.length === 0);
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
  const {
    step,
    setStep,
    importType,
    setImportType,
    fileName,
    selectFile,
    parseErrors,
    headerErrors,
    transactionRows,
    balanceRows,
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
    importRows,
  } = useImportWizard();

  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");

  const rows = importType === "transactions" ? transactionRows : balanceRows;

  const templateUrl = importType === "transactions"
    ? "/templates/transactions.csv"
    : "/templates/balances.csv";

  const fileLabel = importType === "transactions" ? "Transactions CSV" : "Balances CSV";

  const canProceedFromReview = summary.invalid === 0 && rows.length > 0;

  useEffect(() => {
    setReviewFilter("all");
  }, [importType, step]);

  const filteredTransactionRows = useMemo(
    () => filterRows(transactionRows, reviewFilter),
    [reviewFilter, transactionRows]
  );
  const filteredBalanceRows = useMemo(
    () => filterRows(balanceRows, reviewFilter),
    [reviewFilter, balanceRows]
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

  const stepBadges = useMemo(
    () =>
      steps.map((stepItem) => (
        <Badge key={stepItem.id} variant={stepItem.id === step ? "default" : "outline"}>
          {stepItem.id}. {stepItem.label}
        </Badge>
      )),
    [step]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CSV Import Wizard</h1>
          <p className="text-muted-foreground">
            Import transactions, transfers, balances, and investments in a guided flow.
          </p>
        </div>
        <Button variant="ghost" asChild onClick={resetImportState}>
          <Link href="/settings">Cancel</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">{stepBadges}</div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select import type</CardTitle>
            <CardDescription>Choose what kind of data you are importing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={importType}
              onValueChange={(value) => setImportType(value as "transactions" | "balances")}
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
            </RadioGroup>
            <div className="flex items-center gap-2">
              <Button onClick={() => setStep(2)}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Select file</CardTitle>
            <CardDescription>Upload a Netly CSV file to continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CsvUpload
              label={fileLabel}
              templateUrl={templateUrl}
              fileName={fileName}
              onFileSelected={selectFile}
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

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleProcess} disabled={!fileName}>
                Process file
              </Button>
            </div>
          </CardContent>
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
              Fix any errors. Warnings will not block the import.
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

                {importType === "transactions" && (
                  <CsvReviewTable
                    rows={filteredTransactionRows}
                    onRowChange={updateTransactionRow}
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
                          <Select
                            value={row.category}
                            onValueChange={onChange}
                            disabled={row.type === "transfer"}
                          >
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
              </>
            )}

            {importError && (
              <Alert variant="destructive">
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={!canProceedFromReview || isImporting}>
                {isImporting ? "Importing..." : "Complete import"}
              </Button>
              {!canProceedFromReview && rows.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Fix errors before continuing.
                </p>
              )}
            </div>
          </CardContent>
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
              </div>
            )}
            {completion && completion.type === "balances" && (
              <div className="space-y-2">
                <Badge variant="secondary">Balances: {completion.balances}</Badge>
                <Badge variant="secondary">Investments: {completion.investments}</Badge>
                <Badge variant="default">Total imported: {completion.total}</Badge>
              </div>
            )}
            {!completion && (
              <p className="text-sm text-muted-foreground">
                Import completed. No summary data available.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
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
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ImportWizardPage;

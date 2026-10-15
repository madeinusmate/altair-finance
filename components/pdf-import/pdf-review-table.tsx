"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Account } from "@/lib/db/schema";
import { ParsedTransaction } from "@/lib/pdf/types";
import { ArrowLeftRight } from "lucide-react";
import { CategoryAllowance } from "@/lib/categorization/rules";

export type TransactionRow = ParsedTransaction & {
  id: string;
  errors: string[];
  warnings: string[];
  duplicate?: boolean;
  excluded?: boolean;
  ruleMatch?: string;
  ruleHint?: string;
  categoryTouched?: boolean;
  overrideDuplicate?: boolean;
  isTransfer?: boolean;
  fromAccountId?: string;
  toAccountId?: string;
  fromAmount?: number;
  toAmount?: number;
};

interface PdfReviewTableProps {
  rows: TransactionRow[];
  accounts: Account[];
  transactionCategories: CategoryAllowance[];
  onRowChange: (rowId: string, updates: Partial<TransactionRow>) => void;
  onToggleExclude: (rowId: string) => void;
}

export const PdfReviewTable = ({
  rows,
  accounts,
  transactionCategories,
  onRowChange,
  onToggleExclude,
}: PdfReviewTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) {
      return rows;
    }
    const query = searchQuery.toLowerCase();
    return rows.filter(
      (row) =>
        row.description.toLowerCase().includes(query) ||
        row.category.toLowerCase().includes(query) ||
        row.date.includes(query)
    );
  }, [rows, searchQuery]);

  const categoryChoices = (row: TransactionRow): CategoryAllowance[] => {
    if (row.isTransfer) return transactionCategories;
    const legal = transactionCategories.filter(
      (category) => category.transactionType === row.type || category.transactionType === null
    );
    if (!row.category || legal.some((category) => category.name === row.category)) return legal;
    return [...legal, { name: row.category, transactionType: row.type }];
  };

  const transactionAccounts = accounts.filter((account) => account.type === "transaction");
  // For transfers: from and to accounts can be transaction or investment (exclude balance accounts)
  const transferFromAccounts = accounts.filter((account) => account.type !== "balance");
  const transferToAccounts = accounts.filter((account) => account.type !== "balance");

  const handleConvertToTransfer = (rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row || row.isTransfer) return;

    onRowChange(rowId, {
      isTransfer: true,
      fromAccountId: undefined,
      toAccountId: undefined,
      fromAmount: row.amount,
      toAmount: row.amount,
    });
  };

  const handleConvertToTransaction = (rowId: string) => {
    onRowChange(rowId, {
      isTransfer: false,
      fromAccountId: undefined,
      toAccountId: undefined,
      fromAmount: undefined,
      toAmount: undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search transactions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="overflow-auto rounded-md border" style={{ maxHeight: "calc(100vh - 400px)", minHeight: 400 }}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              {rows.some((r) => r.isTransfer) ? (
                <>
                  <TableHead>From Amount</TableHead>
                  <TableHead>To Amount</TableHead>
                </>
              ) : (
                <TableHead>Amount</TableHead>
              )}
              <TableHead>Category</TableHead>
              {!rows.some((r) => r.isTransfer) && <TableHead>Type</TableHead>}
              {rows.some((r) => r.isTransfer) && (
                <>
                  <TableHead>From Account</TableHead>
                  <TableHead>To Account</TableHead>
                </>
              )}
              <TableHead>Actions</TableHead>
              <TableHead>Issues</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row) => (
              <TableRow key={row.id} className={row.excluded ? "opacity-50" : ""}>
                <TableCell>
                  <Input
                    type="date"
                    value={row.date}
                    onChange={(e) => onRowChange(row.id, { date: e.target.value })}
                    className="w-40"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.description}
                    onChange={(e) => onRowChange(row.id, { description: e.target.value })}
                    className="min-w-[200px]"
                  />
                </TableCell>
                {row.isTransfer ? (
                  <>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.fromAmount || ""}
                        onChange={(e) =>
                          onRowChange(row.id, { fromAmount: parseFloat(e.target.value) || 0 })
                        }
                        className="w-32"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.toAmount || ""}
                        onChange={(e) =>
                          onRowChange(row.id, { toAmount: parseFloat(e.target.value) || 0 })
                        }
                        className="w-32"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={categoryChoices(row).some((category) => category.name === row.category) ? row.category : undefined}
                        onValueChange={(value) => onRowChange(row.id, { category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categoryChoices(row).map((cat) => (
                            <SelectItem key={cat.name} value={cat.name}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.fromAccountId || ""}
                        onValueChange={(value) => onRowChange(row.id, { fromAccountId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="From" />
                        </SelectTrigger>
                        <SelectContent>
                          {transferFromAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.toAccountId || ""}
                        onValueChange={(value) => onRowChange(row.id, { toAccountId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="To" />
                        </SelectTrigger>
                        <SelectContent>
                          {transferToAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) =>
                          onRowChange(row.id, { amount: parseFloat(e.target.value) || 0 })
                        }
                        className="w-32"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={categoryChoices(row).some((category) => category.name === row.category) ? row.category : undefined}
                        onValueChange={(value) => onRowChange(row.id, { category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categoryChoices(row).map((cat) => (
                            <SelectItem key={cat.name} value={cat.name}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.type}
                        onValueChange={(value) =>
                          onRowChange(row.id, { type: value as "debit" | "credit" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="debit">Debit</SelectItem>
                          <SelectItem value="credit">Credit</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {rows.some((r) => r.isTransfer) && (
                      <>
                        <TableCell />
                        <TableCell />
                      </>
                    )}
                  </>
                )}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {!row.isTransfer && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleConvertToTransfer(row.id)}
                        title="Convert to transfer"
                      >
                        <ArrowLeftRight className="h-4 w-4" />
                      </Button>
                    )}
                    {row.isTransfer && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleConvertToTransaction(row.id)}
                        title="Convert to transaction"
                      >
                        Transaction
                      </Button>
                    )}
                    {row.duplicate && (
                      <Button
                        type="button"
                        variant={row.excluded ? "default" : "outline"}
                        size="sm"
                        onClick={() => onToggleExclude(row.id)}
                      >
                        {row.excluded ? "Include" : "Exclude"}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-h-20 space-y-2 overflow-auto">
                    {row.errors.length > 0 && (
                      <div className="space-y-1">
                        <Badge variant="destructive">{row.errors.length} errors</Badge>
                        <ul className="text-xs text-destructive space-y-1">
                          {row.errors.map((error, index) => (
                            <li key={`${row.id}-error-${index}`}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {row.warnings.length > 0 && (
                      <div className="space-y-1">
                        <Badge variant="secondary">{row.warnings.length} warnings</Badge>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {row.warnings.map((warning, index) => (
                            <li key={`${row.id}-warning-${index}`}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {row.duplicate && !row.excluded && (
                      <Badge variant="secondary">Possible duplicate</Badge>
                    )}
                    {(row.ruleMatch || row.ruleHint) && (
                      <p className="text-xs text-muted-foreground">{row.ruleMatch || row.ruleHint}</p>
                    )}
                    {row.errors.length === 0 && row.warnings.length === 0 && !row.duplicate && !row.ruleMatch && !row.ruleHint && (
                      <span className="text-xs text-muted-foreground">No issues</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

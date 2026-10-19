"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { currencyFractionDigits } from "@/lib/currencies";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TransactionForm } from "@/components/transaction-form";
import { dialogFormContentClassName, dialogFormHeaderClassName } from "@/components/form-section";
import { TransferForm } from "@/components/transfer-form";
import { BulkRecategorizeBar, type BulkCategory } from "@/components/ledger/bulk-recategorize-bar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { CategoryBadge } from "@/components/category-management/category-badge";
import { toast } from "sonner";
import { Search, ArrowLeftRight, Pencil, Trash2, Plus } from "lucide-react";
import { Transaction, Account, Transfer } from "@/lib/db/schema";
import { transactionSubtitle, transactionTitle } from "@/lib/payees/display";
import { PayeeMark } from "@/components/payees/payee-mark";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { LedgerDateFilter } from "@/components/ledger/ledger-date-filter";
import { isInLedgerDateFilter, type LedgerDateFilter as LedgerDateFilterValue } from "@/lib/ledger/date-filter";
import {
  headerCheckboxState,
  ledgerSelectionKey,
  toggleFilteredSelection,
  toLedgerSelection,
  type LedgerSelectionEntry,
} from "@/lib/ledger/selection";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type LedgerTransaction = Transaction & { payeeName?: string | null; payeeIcon?: string | null };

type UnifiedItem = 
  | { type: "transaction"; data: LedgerTransaction }
  | { type: "transfer"; data: Transfer };

const DELETE_UNDO_MS = 5000;

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: currencyFractionDigits(currency),
    maximumFractionDigits: currencyFractionDigits(currency),
  }).format(amount);
};

const TransactionsPage = () => {
  const { getKey, usesBooksOwner } = useAuth();
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [payees, setPayees] = useState<Array<{ id: string; name: string; icon?: string | null; iconImage?: string | null }>>([]);
  const payeeById = useMemo(() => new Map(payees.map((payee) => [payee.id, payee])), [payees]);
  const [payeeFilter, setPayeeFilter] = useState<string>("all");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactionCategories, setTransactionCategories] = useState<BulkCategory[]>([]);
  const [selectedRows, setSelectedRows] = useState<Map<string, LedgerSelectionEntry>>(new Map());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all"); // "all" | "debit" | "credit" | "transfer"
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [ledgerDateFilter, setLedgerDateFilter] = useState<LedgerDateFilterValue>({ kind: "all" });
  const [isEditTransactionDialogOpen, setIsEditTransactionDialogOpen] = useState(false);
  const [isCreateTransactionDialogOpen, setIsCreateTransactionDialogOpen] = useState(false);
  const [isCreateTransferDialogOpen, setIsCreateTransferDialogOpen] = useState(false);
  const [isEditTransferDialogOpen, setIsEditTransferDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<LedgerTransaction | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const pendingDeletesRef = useRef<Map<string, number>>(new Map());

  const replaceUnified = (unifiedData: { transactions: LedgerTransaction[]; transfers: Transfer[] }) => {
    setTransactions(unifiedData.transactions.filter((item) => !pendingDeletesRef.current.has(item.id)));
    setTransfers(unifiedData.transfers.filter((item) => !pendingDeletesRef.current.has(item.id)));
  };

  useEffect(() => {
    const fetchData = async () => {
      const key = getKey();
      if (!key && !usesBooksOwner) {
        setIsLoading(false);
        return;
      }

      try {
        const [unifiedData, accountsData, categoriesData, payeesData] = await Promise.all([
          apiClient.get<{ transactions: LedgerTransaction[]; transfers: Transfer[] }>("/api/transactions-unified"),
          apiClient.get<Account[]>("/api/accounts"),
          apiClient.get<{ categories: BulkCategory[] }>("/api/transaction-categories"),
          apiClient.get<{
            payees: Array<{ id: string; name: string; icon?: string | null; iconImage?: string | null }>;
          }>("/api/payees"),
        ]);
        replaceUnified(unifiedData);
        setAccounts(accountsData);
        setPayees(payeesData.payees || []);
        setTransactionCategories(categoriesData.categories);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch transactions");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [getKey]);

  const accountMap = useMemo(() => {
    return new Map(accounts.map((a) => [a.id, a]));
  }, [accounts]);

  // Filter accounts eligible for transfers (transaction and investment only)
  const transferEligibleAccounts = useMemo(() => 
    accounts.filter(a => a.type === "transaction" || a.type === "investment"),
    [accounts]
  );

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditTransactionDialogOpen(true);
  };

  const handleTransactionUpdated = () => {
    setIsEditTransactionDialogOpen(false);
    setEditingTransaction(null);
    // Refresh unified data
    const fetchData = async () => {
      try {
        const unifiedData = await apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>("/api/transactions-unified");
        replaceUnified(unifiedData);
      } catch (err) {
        toast.error("Failed to refresh transactions");
      }
    };
    fetchData();
  };

  const clearPendingDelete = (key: string) => {
    const pending = pendingDeletesRef.current.get(key);
    if (pending) {
      window.clearTimeout(pending);
      pendingDeletesRef.current.delete(key);
    }
    setPendingDeleteIds((current) => {
      if (!current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  const scheduleDelete = (id: string, kind: "transaction" | "transfer", path: string, label: string) => {
    const key = ledgerSelectionKey(kind, id);
    const existing = pendingDeletesRef.current.get(key);
    if (existing) {
      window.clearTimeout(existing);
    }

    setPendingDeleteIds((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
    setSelectedRows((current) => {
      if (!current.has(key)) {
        return current;
      }
      const next = new Map(current);
      next.delete(key);
      return next;
    });

    const timeout = window.setTimeout(() => {
      pendingDeletesRef.current.delete(key);
      setPendingDeleteIds((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      void apiClient.delete(path).then(() => {
        if (kind === "transaction") {
          setTransactions((current) => current.filter((item) => item.id !== id));
        } else {
          setTransfers((current) => current.filter((item) => item.id !== id));
        }
      }).catch(() => {
        toast.error(`Failed to delete ${label.toLowerCase()}`);
      });
    }, DELETE_UNDO_MS);

    pendingDeletesRef.current.set(key, timeout);
    toast(`${label} deleted`, {
      duration: DELETE_UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          clearPendingDelete(key);
        },
      },
    });
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    scheduleDelete(
      transaction.id,
      "transaction",
      `/api/transactions?id=${transaction.id}`,
      "Transaction"
    );
  };

  const handleTransactionCreated = () => {
    setIsCreateTransactionDialogOpen(false);
    // Refresh unified data
    const fetchData = async () => {
      try {
        const unifiedData = await apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>("/api/transactions-unified");
        replaceUnified(unifiedData);
      } catch (err) {
        toast.error("Failed to refresh transactions");
      }
    };
    fetchData();
  };

  const handleTransferCreated = () => {
    setIsCreateTransferDialogOpen(false);
    // Refresh unified data
    const fetchData = async () => {
      try {
        const unifiedData = await apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>("/api/transactions-unified");
        replaceUnified(unifiedData);
        toast.success("Transfer created successfully");
      } catch (err) {
        toast.error("Failed to refresh transactions");
      }
    };
    fetchData();
  };

  const handleEditTransfer = (transfer: Transfer) => {
    setEditingTransfer(transfer);
    setIsEditTransferDialogOpen(true);
  };

  const handleTransferUpdated = () => {
    setIsEditTransferDialogOpen(false);
    setEditingTransfer(null);
    // Refresh unified data
    const fetchData = async () => {
      try {
        const unifiedData = await apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>("/api/transactions-unified");
        replaceUnified(unifiedData);
      } catch (err) {
        toast.error("Failed to refresh transfers");
      }
    };
    fetchData();
  };

  const handleDeleteTransfer = (transfer: Transfer) => {
    scheduleDelete(
      transfer.id,
      "transfer",
      `/api/transfers?id=${transfer.id}`,
      "Transfer"
    );
  };

  // Create unified items array
  const unifiedItems = useMemo((): UnifiedItem[] => {
    const items: UnifiedItem[] = [
      ...transactions.map((t) => ({ type: "transaction" as const, data: t })),
      ...transfers.map((t) => ({ type: "transfer" as const, data: t })),
    ];
    return items;
  }, [transactions, transfers]);

  // Unified filtering logic
  const filteredItems = useMemo(() => {
    return unifiedItems.filter((item) => {
      if (!isInLedgerDateFilter(item.data.date, ledgerDateFilter)) {
        return false;
      }

      if (item.type === "transaction") {
        const t = item.data;
        const account = accountMap.get(t.accountId);

        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesDescription = t.description?.toLowerCase().includes(query);
          const matchesPayee = t.payeeName?.toLowerCase().includes(query);
          const matchesCategory = (t.category ?? "").toLowerCase().includes(query);
          const matchesAccount = account?.name.toLowerCase().includes(query);
          if (!matchesDescription && !matchesPayee && !matchesCategory && !matchesAccount) {
            return false;
          }
        }

        if (payeeFilter !== "all" && t.payeeId !== payeeFilter) {
          return false;
        }

        if (categoryFilter !== "all" && String(t.categoryId ?? "") !== categoryFilter) {
          return false;
        }

        if (typeFilter !== "all" && typeFilter !== "transfer" && t.type !== typeFilter) {
          return false;
        }

        if (typeFilter === "transfer") {
          return false; // Hide transactions when filtering for transfers
        }

        if (accountFilter !== "all" && t.accountId !== accountFilter) {
          return false;
        }

        return true;
      } else {
        // Transfer filtering
        const t = item.data;
        const fromAccount = accountMap.get(t.fromAccountId);
        const toAccount = accountMap.get(t.toAccountId);

        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesDescription = t.description?.toLowerCase().includes(query);
          const matchesCategory = (t.category ?? "").toLowerCase().includes(query);
          const matchesFromAccount = fromAccount?.name.toLowerCase().includes(query);
          const matchesToAccount = toAccount?.name.toLowerCase().includes(query);
          if (!matchesDescription && !matchesCategory && !matchesFromAccount && !matchesToAccount) {
            return false;
          }
        }

        if (categoryFilter !== "all" && String(t.categoryId ?? "") !== categoryFilter) {
          return false;
        }

        if (typeFilter !== "all" && typeFilter !== "transfer") {
          return false; // Hide transfers when filtering for debit/credit
        }

        if (accountFilter !== "all" && t.fromAccountId !== accountFilter) {
          return false; // Only show transfers where fromAccount matches (per user requirement)
        }

        if (payeeFilter !== "all") {
          return false;
        }

        return true;
      }
    }).sort((a, b) => {
      // Sort by date descending
      const dateA = new Date(a.data.date).getTime();
      const dateB = new Date(b.data.date).getTime();
      return dateB - dateA;
    });
  }, [unifiedItems, searchQuery, categoryFilter, typeFilter, accountFilter, payeeFilter, accountMap, ledgerDateFilter]);

  const debitTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of filteredItems) {
      if (item.type !== "transaction" || item.data.type !== "debit") continue;
      const currency = accountMap.get(item.data.accountId)?.currency || "USD";
      totals.set(currency, (totals.get(currency) ?? 0) + item.data.amount);
    }
    return [...totals.entries()];
  }, [filteredItems, accountMap]);

  // Pagination logic
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  const categoryById = useMemo(
    () => new Map(transactionCategories.map((category) => [category.id, category])),
    [transactionCategories]
  );

  const selectableEntries = useMemo(
    () => filteredItems.map(toLedgerSelection).filter((entry) => !pendingDeleteIds.has(entry.key)),
    [filteredItems, pendingDeleteIds]
  );

  const headerChecked = headerCheckboxState(
    selectableEntries.map((entry) => entry.key),
    new Set(selectedRows.keys())
  );

  const toggleRow = (entry: LedgerSelectionEntry, checked: boolean) => {
    setSelectedRows((current) => {
      const next = new Map(current);
      if (checked) {
        next.set(entry.key, entry);
      } else {
        next.delete(entry.key);
      }
      return next;
    });
  };

  const handleRecategorized = async () => {
    try {
      const unifiedData = await apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>("/api/transactions-unified");
      replaceUnified(unifiedData);
    } catch {
      toast.error("Failed to refresh transactions");
    }
    setSelectedRows(new Map());
  };

  // Reset to page 1 when filters or items per page change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, typeFilter, accountFilter, payeeFilter, itemsPerPage, ledgerDateFilter]);

  useEffect(() => {
    setSelectedRows(new Map());
  }, [searchQuery, categoryFilter, typeFilter, accountFilter, payeeFilter, itemsPerPage, ledgerDateFilter]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Transactions</h1>
          <p className="text-muted-foreground">View all transactions across accounts</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Transactions</h1>
          <p className="text-muted-foreground">View all transactions across accounts</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const transactionAccounts = accounts.filter((a) => a.type === "transaction");

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Transactions</h1>
          <p className="text-muted-foreground">View all transactions across accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Dialog open={isCreateTransferDialogOpen} onOpenChange={setIsCreateTransferDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={transferEligibleAccounts.length < 2}>
                      <ArrowLeftRight className="mr-2 h-4 w-4" />
                      Add Transfer
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Transfer</DialogTitle>
                      <DialogDescription>Transfer funds between accounts</DialogDescription>
                    </DialogHeader>
                    <TransferForm
                      accounts={transferEligibleAccounts}
                      onSuccess={handleTransferCreated}
                    />
                  </DialogContent>
                </Dialog>
              </div>
            </TooltipTrigger>
            {transferEligibleAccounts.length < 2 && (
              <TooltipContent>
                <p>Need at least 2 accounts to create a transfer</p>
              </TooltipContent>
            )}
          </Tooltip>
          {transactionAccounts.length > 0 && (
            <Dialog open={isCreateTransactionDialogOpen} onOpenChange={setIsCreateTransactionDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Transaction
                </Button>
              </DialogTrigger>
              <DialogContent className={dialogFormContentClassName}>
                <DialogHeader className={dialogFormHeaderClassName}>
                  <DialogTitle>Add Transaction</DialogTitle>
                  <DialogDescription>Record the amount, category, and payee.</DialogDescription>
                </DialogHeader>
                <TransactionForm
                  accounts={transactionAccounts}
                  onSuccess={handleTransactionCreated}
                  onCancel={() => setIsCreateTransactionDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {unifiedItems.length === 0 ? (
        <Card className="altair-fade-in">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ArrowLeftRight className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No transactions yet</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Add transactions or transfers to your accounts to see them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Transactions</CardTitle>
                <CardDescription>
                  {totalItems === unifiedItems.length 
                    ? `${totalItems} item${totalItems !== 1 ? "s" : ""}`
                    : `${totalItems} of ${unifiedItems.length} item${unifiedItems.length !== 1 ? "s" : ""}`
                  }
                  {totalPages > 1 && (
                    <> • Page {currentPage} of {totalPages}</>
                  )}
                </CardDescription>
              </div>
              {unifiedItems.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Per page:</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => setItemsPerPage(Number(value))}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="150">150</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                      <SelectItem value="250">250</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative min-w-48 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search transactions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts
                    .filter((a) => a.type === "transaction" || a.type === "investment")
                    .map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {transactionCategories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={payeeFilter} onValueChange={setPayeeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Payee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payees</SelectItem>
                  {payees.map((payee) => (
                    <SelectItem key={payee.id} value={payee.id}>
                      {payee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
              <LedgerDateFilter
                value={ledgerDateFilter}
                onChange={setLedgerDateFilter}
                className="sm:shrink-0"
              />
            </div>

            <BulkRecategorizeBar
              selectedRows={[...selectedRows.values()]}
              categories={transactionCategories}
              onCompleted={handleRecategorized}
            />

            {totalItems === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No transactions match your filters
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={headerChecked}
                          onCheckedChange={(value) => {
                            setSelectedRows((current) =>
                              toggleFilteredSelection(current, selectableEntries, value === true)
                            );
                          }}
                          aria-label={`Select ${selectableEntries.length} matching`}
                          disabled={selectableEntries.length === 0}
                        />
                      </TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TooltipProvider>
                      {paginatedItems.map((item, index) => {
                        const previous = paginatedItems[index - 1];
                        const dayKey = format(new Date(item.data.date), "yyyy-MM-dd");
                        const showDay = !previous || format(new Date(previous.data.date), "yyyy-MM-dd") !== dayKey;

                        if (item.type === "transaction") {
                          const transaction = item.data;
                          const account = accountMap.get(transaction.accountId);
                          const isCredit = transaction.type === "credit";
                          const title = transactionTitle(transaction.payeeName, transaction.description, transaction.category);
                          const subtitle = transactionSubtitle(transaction.payeeName, transaction.description);
                          return (
                            <Fragment key={`transaction-${transaction.id}`}>
                              {showDay && (
                                <TableRow>
                                  <TableCell colSpan={6} className="bg-muted/40 text-xs font-medium text-muted-foreground">
                                    {format(new Date(transaction.date), "EEEE, MMM d")}
                                  </TableCell>
                                </TableRow>
                              )}
                              <TableRow>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedRows.has(ledgerSelectionKey("transaction", transaction.id))}
                                    disabled={pendingDeleteIds.has(ledgerSelectionKey("transaction", transaction.id))}
                                    onCheckedChange={(value) =>
                                      toggleRow(toLedgerSelection(item), value === true)
                                    }
                                    aria-label={`Select transaction ${transaction.description?.trim() || transaction.category}`}
                                  />
                                </TableCell>
                                <TableCell className="max-w-[240px] font-medium">
                                  <div className="flex items-center gap-3">
                                    <PayeeMark
                                      image={transaction.payeeId ? payeeById.get(transaction.payeeId)?.iconImage : null}
                                      icon={transaction.payeeId ? payeeById.get(transaction.payeeId)?.icon ?? transaction.payeeIcon : transaction.payeeIcon}
                                      fallback={title.charAt(0).toUpperCase()}
                                      className="size-10 text-sm"
                                    />
                                    <div className="min-w-0">
                                      <span className="block truncate">{title}</span>
                                      {subtitle ? (
                                        <span className="block truncate text-xs font-normal text-muted-foreground">{subtitle}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <CategoryBadge
                                    name={categoryById.get(transaction.categoryId ?? -1)?.name || transaction.category}
                                    color={categoryById.get(transaction.categoryId ?? -1)?.color}
                                    icon={categoryById.get(transaction.categoryId ?? -1)?.icon}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Link href={`/accounts/${transaction.accountId}`} className="hover:underline">
                                    {account?.name || "Unknown"}
                                  </Link>
                                </TableCell>
                                <TableCell
                                  className="text-right font-medium tabular-nums tracking-[-0.02em]"
                                >
                                  {isCredit ? "+" : "−"}
                                  {formatCurrency(transaction.amount, account?.currency || "USD")}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEditTransaction(transaction)}
                                      aria-label="Edit transaction"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteTransaction(transaction)}
                                      aria-label="Delete transaction"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            </Fragment>
                          );
                        }

                        const transfer = item.data;
                        const fromAccount = accountMap.get(transfer.fromAccountId);
                        const toAccount = accountMap.get(transfer.toAccountId);
                        const isCrossCurrency = fromAccount?.currency !== toAccount?.currency;

                        return (
                          <Fragment key={`transfer-${transfer.id}`}>
                            {showDay && (
                              <TableRow>
                                <TableCell colSpan={6} className="bg-muted/40 text-xs font-medium text-muted-foreground">
                                  {format(new Date(transfer.date), "EEEE, MMM d")}
                                </TableCell>
                              </TableRow>
                            )}
                            <TableRow>
                              <TableCell>
                                <Checkbox
                                  checked={selectedRows.has(ledgerSelectionKey("transfer", transfer.id))}
                                  disabled={pendingDeleteIds.has(ledgerSelectionKey("transfer", transfer.id))}
                                  onCheckedChange={(value) =>
                                    toggleRow(toLedgerSelection(item), value === true)
                                  }
                                  aria-label={`Select transfer ${transfer.description?.trim() || "Transfer"}`}
                                />
                              </TableCell>
                              <TableCell className="max-w-[240px] font-medium">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                                    <ArrowLeftRight className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                <div className="truncate">{transfer.description?.trim() || "Transfer"}</div>
                                {isCrossCurrency && transfer.exchangeRate && (
                                  <div className="text-xs font-normal text-muted-foreground">
                                    Rate: {transfer.exchangeRate.toFixed(4)}
                                  </div>
                                )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <CategoryBadge
                                  name={categoryById.get(transfer.categoryId ?? -1)?.name || transfer.category || "Transfer"}
                                  color={categoryById.get(transfer.categoryId ?? -1)?.color}
                                  icon={categoryById.get(transfer.categoryId ?? -1)?.icon}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Link href={`/accounts/${transfer.fromAccountId}`} className="hover:underline">
                                    {fromAccount?.name || "Unknown"}
                                  </Link>
                                  <ArrowLeftRight className="mx-1 h-3 w-3 text-muted-foreground" />
                                  <Link href={`/accounts/${transfer.toAccountId}`} className="hover:underline">
                                    {toAccount?.name || "Unknown"}
                                  </Link>
                                  {isCrossCurrency && toAccount && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="ml-2">
                                          {toAccount.currency}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Cross-currency transfer</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums tracking-[-0.02em]">
                                {formatCurrency(transfer.fromAmount ?? transfer.amount, fromAccount?.currency || "USD")}
                                {isCrossCurrency && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="cursor-help text-xs font-normal text-muted-foreground">
                                        → {formatCurrency(transfer.toAmount ?? transfer.amount, toAccount?.currency || "USD")}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Amount in destination currency</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditTransfer(transfer)}
                                    aria-label="Edit transfer"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteTransfer(transfer)}
                                    aria-label="Delete transfer"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          </Fragment>
                        );
                      })}
                    </TooltipProvider>
                  </TableBody>
                </Table>
                {debitTotals.length > 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Debit total:{" "}
                    {debitTotals.map(([currency, amount]) => formatCurrency(amount, currency)).join(" · ")}
                  </p>
                )}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground w-full" >
                      Showing {startIndex + 1} to {Math.min(endIndex, totalItems)} of {totalItems} items
                    </div>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage((prev) => Math.max(1, prev - 1));
                            }}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                        {(() => {
                          const pages: (number | "ellipsis")[] = [];
                          const showEllipsis = totalPages > 7;

                          if (!showEllipsis) {
                            // Show all pages if 7 or fewer
                            for (let i = 1; i <= totalPages; i++) {
                              pages.push(i);
                            }
                          } else {
                            // Always show first page
                            pages.push(1);

                            if (currentPage <= 4) {
                              // Near the start: 1 2 3 4 5 ... last
                              for (let i = 2; i <= 5; i++) {
                                pages.push(i);
                              }
                              pages.push("ellipsis");
                              pages.push(totalPages);
                            } else if (currentPage >= totalPages - 3) {
                              // Near the end: 1 ... (n-4) (n-3) (n-2) (n-1) n
                              pages.push("ellipsis");
                              for (let i = totalPages - 4; i <= totalPages; i++) {
                                pages.push(i);
                              }
                            } else {
                              // In the middle: 1 ... (current-1) current (current+1) ... last
                              pages.push("ellipsis");
                              pages.push(currentPage - 1);
                              pages.push(currentPage);
                              pages.push(currentPage + 1);
                              pages.push("ellipsis");
                              pages.push(totalPages);
                            }
                          }

                          return pages.map((page, index) => {
                            if (page === "ellipsis") {
                              return (
                                <PaginationItem key={`ellipsis-${index}`}>
                                  <PaginationEllipsis />
                                </PaginationItem>
                              );
                            }
                            return (
                              <PaginationItem key={page}>
                                <PaginationLink
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setCurrentPage(page);
                                  }}
                                  isActive={currentPage === page}
                                  className="cursor-pointer"
                                >
                                  {page}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          });
                        })()}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                            }}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                    <div className="w-full"/>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Transaction Dialog */}
      {editingTransaction && (
        <Dialog open={isEditTransactionDialogOpen} onOpenChange={setIsEditTransactionDialogOpen}>
          <DialogContent className={dialogFormContentClassName}>
            <DialogHeader className={dialogFormHeaderClassName}>
              <DialogTitle>Edit Transaction</DialogTitle>
              <DialogDescription>Update the amount, category, and payee.</DialogDescription>
            </DialogHeader>
            <TransactionForm
              accountId={editingTransaction.accountId}
              currency={accountMap.get(editingTransaction.accountId)?.currency || "USD"}
              transaction={editingTransaction}
              mode="edit"
              onSuccess={handleTransactionUpdated}
              onCancel={() => setIsEditTransactionDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Transfer Dialog */}
      {editingTransfer && (
        <Dialog open={isEditTransferDialogOpen} onOpenChange={setIsEditTransferDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Transfer</DialogTitle>
              <DialogDescription>Update transfer details</DialogDescription>
            </DialogHeader>
            <TransferForm
              accounts={accounts}
              transfer={editingTransfer}
              mode="edit"
              onSuccess={handleTransferUpdated}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default TransactionsPage;

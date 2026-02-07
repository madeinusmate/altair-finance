"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
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
import { TransactionForm } from "@/components/transaction-form";
import { TransferForm } from "@/components/transfer-form";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { ArrowUpRight, ArrowDownRight, Search, ArrowLeftRight, Pencil, Trash2, Plus } from "lucide-react";
import { Transaction, Account, Transfer } from "@/lib/db/schema";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type UnifiedItem = 
  | { type: "transaction"; data: Transaction }
  | { type: "transfer"; data: Transfer };

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const TransactionsPage = () => {
  const { getKey } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactionCategories, setTransactionCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all"); // "all" | "debit" | "credit" | "transfer"
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [isEditTransactionDialogOpen, setIsEditTransactionDialogOpen] = useState(false);
  const [isCreateTransactionDialogOpen, setIsCreateTransactionDialogOpen] = useState(false);
  const [isCreateTransferDialogOpen, setIsCreateTransferDialogOpen] = useState(false);
  const [isEditTransferDialogOpen, setIsEditTransferDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    const fetchData = async () => {
      const key = getKey();
      if (!key) {
        setIsLoading(false);
        return;
      }

      try {
        const [unifiedData, accountsData, categoriesData] = await Promise.all([
          apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>("/api/transactions-unified"),
          apiClient.get<Account[]>("/api/accounts"),
          apiClient.get<{ categories: Array<{ name: string }> }>("/api/transaction-categories"),
        ]);
        setTransactions(unifiedData.transactions);
        setTransfers(unifiedData.transfers);
        setAccounts(accountsData);
        setTransactionCategories(categoriesData.categories.map((c) => c.name));
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
        setTransactions(unifiedData.transactions);
        setTransfers(unifiedData.transfers);
      } catch (err) {
        toast.error("Failed to refresh transactions");
      }
    };
    fetchData();
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      await apiClient.delete(`/api/transactions?id=${transactionId}`);
      const unifiedData = await apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>("/api/transactions-unified");
      setTransactions(unifiedData.transactions);
      setTransfers(unifiedData.transfers);
      toast.success("Transaction deleted");
    } catch {
      toast.error("Failed to delete transaction");
    }
  };

  const handleTransactionCreated = () => {
    setIsCreateTransactionDialogOpen(false);
    // Refresh unified data
    const fetchData = async () => {
      try {
        const unifiedData = await apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>("/api/transactions-unified");
        setTransactions(unifiedData.transactions);
        setTransfers(unifiedData.transfers);
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
        setTransactions(unifiedData.transactions);
        setTransfers(unifiedData.transfers);
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
        setTransactions(unifiedData.transactions);
        setTransfers(unifiedData.transfers);
      } catch (err) {
        toast.error("Failed to refresh transfers");
      }
    };
    fetchData();
  };

  const handleDeleteTransfer = async (transferId: string) => {
    try {
      await apiClient.delete(`/api/transfers?id=${transferId}`);
      const unifiedData = await apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>("/api/transactions-unified");
      setTransactions(unifiedData.transactions);
      setTransfers(unifiedData.transfers);
      toast.success("Transfer deleted");
    } catch {
      toast.error("Failed to delete transfer");
    }
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
      if (item.type === "transaction") {
        const t = item.data;
        const account = accountMap.get(t.accountId);

        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesDescription = t.description?.toLowerCase().includes(query);
          const matchesCategory = t.category.toLowerCase().includes(query);
          const matchesAccount = account?.name.toLowerCase().includes(query);
          if (!matchesDescription && !matchesCategory && !matchesAccount) {
            return false;
          }
        }

        if (categoryFilter !== "all" && t.category !== categoryFilter) {
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
          const matchesCategory = t.category?.toLowerCase().includes(query);
          const matchesFromAccount = fromAccount?.name.toLowerCase().includes(query);
          const matchesToAccount = toAccount?.name.toLowerCase().includes(query);
          if (!matchesDescription && !matchesCategory && !matchesFromAccount && !matchesToAccount) {
            return false;
          }
        }

        if (categoryFilter !== "all" && t.category !== categoryFilter) {
          return false;
        }

        if (typeFilter !== "all" && typeFilter !== "transfer") {
          return false; // Hide transfers when filtering for debit/credit
        }

        if (accountFilter !== "all" && t.fromAccountId !== accountFilter) {
          return false; // Only show transfers where fromAccount matches (per user requirement)
        }

        return true;
      }
    }).sort((a, b) => {
      // Sort by date descending
      const dateA = new Date(a.data.date).getTime();
      const dateB = new Date(b.data.date).getTime();
      return dateB - dateA;
    });
  }, [unifiedItems, searchQuery, categoryFilter, typeFilter, accountFilter, accountMap]);

  // Pagination logic
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  // Reset to page 1 when filters or items per page change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, typeFilter, accountFilter, itemsPerPage]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
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
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
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
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Transaction</DialogTitle>
                  <DialogDescription>Create a new transaction</DialogDescription>
                </DialogHeader>
                <TransactionForm
                  accounts={transactionAccounts}
                  onSuccess={handleTransactionCreated}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {unifiedItems.length === 0 ? (
        <Card>
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
            <div className="mb-4 flex flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
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
                    <SelectItem key={cat} value={cat}>
                      {cat}
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
            </div>

            {totalItems === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No transactions match your filters
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Account(s)</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TooltipProvider>
                      {paginatedItems.map((item) => {
                      if (item.type === "transaction") {
                        const transaction = item.data;
                        const account = accountMap.get(transaction.accountId);
                        return (
                          <TableRow key={`transaction-${transaction.id}`}>
                            <TableCell>
                              {format(new Date(transaction.date), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/accounts/${transaction.accountId}`}
                                className="hover:underline"
                              >
                                {account?.name || "Unknown"}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {transaction.type === "credit" ? (
                                  <ArrowUpRight className="h-4 w-4 text-green-500" />
                                ) : (
                                  <ArrowDownRight className="h-4 w-4 text-red-500" />
                                )}
                                <span className="capitalize">{transaction.type}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{transaction.category}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {transaction.description || "-"}
                            </TableCell>
                            <TableCell
                              className={`text-right font-medium ${
                                transaction.type === "credit" ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {transaction.type === "credit" ? "+" : "-"}
                              {formatCurrency(transaction.amount, account?.currency || "USD")}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
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
                                  onClick={() => handleDeleteTransaction(transaction.id)}
                                  aria-label="Delete transaction"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      } else {
                        const transfer = item.data;
                        const fromAccount = accountMap.get(transfer.fromAccountId);
                        const toAccount = accountMap.get(transfer.toAccountId);
                        const isCrossCurrency = fromAccount?.currency !== toAccount?.currency;
                        
                        return (
                          <TableRow key={`transfer-${transfer.id}`}>
                            <TableCell>
                              {format(new Date(transfer.date), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Link
                                  href={`/accounts/${transfer.fromAccountId}`}
                                  className="hover:underline"
                                >
                                  {fromAccount?.name || "Unknown"}
                                </Link>
                                <ArrowLeftRight className="h-3 w-3 text-muted-foreground mx-1" />
                                <Link
                                  href={`/accounts/${transfer.toAccountId}`}
                                  className="hover:underline"
                                >
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
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <ArrowLeftRight className="h-4 w-4 text-blue-500" />
                                <span>Transfer</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{transfer.category || "Transfer"}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              <div>
                                {transfer.description || "-"}
                                {isCrossCurrency && transfer.exchangeRate && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Rate: {transfer.exchangeRate.toFixed(4)}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(transfer.fromAmount ?? transfer.amount, fromAccount?.currency || "USD")}
                              {isCrossCurrency && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="text-xs text-muted-foreground cursor-help">
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
                              <div className="flex items-center gap-1">
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
                                  onClick={() => handleDeleteTransfer(transfer.id)}
                                  aria-label="Delete transfer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }
                    })}
                    </TooltipProvider>
                  </TableBody>
                </Table>
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Transaction</DialogTitle>
              <DialogDescription>Update transaction details</DialogDescription>
            </DialogHeader>
            <TransactionForm
              accountId={editingTransaction.accountId}
              currency={accountMap.get(editingTransaction.accountId)?.currency || "USD"}
              transaction={editingTransaction}
              mode="edit"
              onSuccess={handleTransactionUpdated}
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

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { ArrowUpRight, ArrowDownRight, Search, ArrowLeftRight, Pencil, Trash2, Plus } from "lucide-react";
import { Transaction, Account } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/categories";
import { format } from "date-fns";

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [isEditTransactionDialogOpen, setIsEditTransactionDialogOpen] = useState(false);
  const [isCreateTransactionDialogOpen, setIsCreateTransactionDialogOpen] = useState(false);
  const [isCreateTransferDialogOpen, setIsCreateTransferDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [transactionsData, accountsData] = await Promise.all([
          apiClient.get<Transaction[]>("/api/transactions"),
          apiClient.get<Account[]>("/api/accounts"),
        ]);
        setTransactions(transactionsData);
        setAccounts(accountsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch transactions");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

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
    // Refresh transactions
    const fetchData = async () => {
      try {
        const transactionsData = await apiClient.get<Transaction[]>("/api/transactions");
        setTransactions(transactionsData);
      } catch (err) {
        toast.error("Failed to refresh transactions");
      }
    };
    fetchData();
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      await apiClient.delete(`/api/transactions?id=${transactionId}`);
      const transactionsData = await apiClient.get<Transaction[]>("/api/transactions");
      setTransactions(transactionsData);
      toast.success("Transaction deleted");
    } catch {
      toast.error("Failed to delete transaction");
    }
  };

  const handleTransactionCreated = () => {
    setIsCreateTransactionDialogOpen(false);
    // Refresh transactions
    const fetchData = async () => {
      try {
        const transactionsData = await apiClient.get<Transaction[]>("/api/transactions");
        setTransactions(transactionsData);
      } catch (err) {
        toast.error("Failed to refresh transactions");
      }
    };
    fetchData();
  };

  const handleTransferCreated = () => {
    setIsCreateTransferDialogOpen(false);
    // Refresh transactions list
    const fetchData = async () => {
      try {
        const transactionsData = await apiClient.get<Transaction[]>("/api/transactions");
        setTransactions(transactionsData);
        toast.success("Transfer created successfully");
      } catch (err) {
        toast.error("Failed to refresh transactions");
      }
    };
    fetchData();
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
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

      if (typeFilter !== "all" && t.type !== typeFilter) {
        return false;
      }

      if (accountFilter !== "all" && t.accountId !== accountFilter) {
        return false;
      }

      return true;
    });
  }, [transactions, searchQuery, categoryFilter, typeFilter, accountFilter, accountMap]);

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

      {transactions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ArrowLeftRight className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No transactions yet</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Add transactions to your accounts to see them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Transactions</CardTitle>
            <CardDescription>
              {filteredTransactions.length} of {transactions.length} transaction
              {transactions.length !== 1 ? "s" : ""}
            </CardDescription>
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
                    .filter((a) => a.type === "transaction")
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
                  {CATEGORIES.map((cat) => (
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
                </SelectContent>
              </Select>
            </div>

            {filteredTransactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No transactions match your filters
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction) => {
                    const account = accountMap.get(transaction.accountId);
                    return (
                      <TableRow key={transaction.id}>
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
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTransaction(transaction.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
    </div>
  );
};

export default TransactionsPage;

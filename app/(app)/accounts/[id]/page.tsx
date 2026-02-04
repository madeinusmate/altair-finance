"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  Pencil,
} from "lucide-react";
import { Account, Transaction, Transfer, BalanceHistory, InvestmentHistory } from "@/lib/db/schema";
import { TransactionForm } from "@/components/transaction-form";
import { TransferForm } from "@/components/transfer-form";
import { BalanceUpdateForm } from "@/components/balance-update-form";
import { InvestmentBalanceForm } from "@/components/investment-balance-form";
import { AccountEditForm } from "@/components/account-edit-form";
import { TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { formatCategoryDisplay } from "@/lib/account-categories";
import { calculateTransactionAccountBalance, calculateNetContributions } from "@/lib/accounting";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AccountChartsContainer } from "@/components/account-charts/account-charts-container";

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

const AccountDetailPage = ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = use(params);
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [balanceHistory, setBalanceHistory] = useState<BalanceHistory[]>([]);
  const [investmentHistory, setInvestmentHistory] = useState<InvestmentHistory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false);
  const [isInvestmentBalanceDialogOpen, setIsInvestmentBalanceDialogOpen] = useState(false);
  const [isEditAccountDialogOpen, setIsEditAccountDialogOpen] = useState(false);
  const [isEditTransactionDialogOpen, setIsEditTransactionDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditTransferDialogOpen, setIsEditTransferDialogOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);

  const fetchData = async () => {
    try {
      const [accountData, unifiedData, balanceData, investmentData, allAccounts] =
        await Promise.all([
          apiClient.get<Account>(`/api/accounts/${id}`),
          apiClient.get<{ transactions: Transaction[]; transfers: Transfer[] }>(`/api/transactions-unified?accountId=${id}`),
          apiClient.get<BalanceHistory[]>(`/api/balance-history?accountId=${id}`),
          apiClient.get<InvestmentHistory[]>(`/api/investment-history?accountId=${id}`),
          apiClient.get<Account[]>("/api/accounts"),
        ]);

      setAccount(accountData);
      setTransactions(unifiedData.transactions);
      setTransfers(unifiedData.transfers);
      setBalanceHistory(balanceData);
      setInvestmentHistory(investmentData);
      setAccounts(allAccounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch account");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleDeleteAccount = async () => {
    try {
      await apiClient.delete(`/api/accounts?id=${id}`);
      toast.success("Account deleted");
      router.push("/accounts");
    } catch (err) {
      toast.error("Failed to delete account");
    }
  };

  const handleTransactionCreated = () => {
    setIsTransactionDialogOpen(false);
    fetchData();
  };

  const handleTransferCreated = () => {
    setIsTransferDialogOpen(false);
    fetchData();
    toast.success("Transfer added");
  };

  const handleBalanceUpdated = () => {
    setIsBalanceDialogOpen(false);
    fetchData();
    toast.success("Balance updated");
  };

  const handleInvestmentBalanceUpdated = () => {
    setIsInvestmentBalanceDialogOpen(false);
    fetchData();
    toast.success("Investment value updated");
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      await apiClient.delete(`/api/transactions?id=${transactionId}`);
      fetchData();
      toast.success("Transaction deleted");
    } catch {
      toast.error("Failed to delete transaction");
    }
  };

  const handleAccountUpdated = () => {
    setIsEditAccountDialogOpen(false);
    fetchData();
  };

  const handleTransactionUpdated = () => {
    setIsEditTransactionDialogOpen(false);
    setEditingTransaction(null);
    fetchData();
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditTransactionDialogOpen(true);
  };

  const handleDeleteTransfer = async (transferId: string) => {
    try {
      await apiClient.delete(`/api/transfers?id=${transferId}`);
      fetchData();
      toast.success("Transfer deleted");
    } catch {
      toast.error("Failed to delete transfer");
    }
  };

  const handleEditTransfer = (transfer: Transfer) => {
    setEditingTransfer(transfer);
    setIsEditTransferDialogOpen(true);
  };

  const handleTransferUpdated = () => {
    setIsEditTransferDialogOpen(false);
    setEditingTransfer(null);
    fetchData();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/accounts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Account Not Found</h1>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">{error || "Account not found"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate transfers for balance calculation
  // Use fromAmount/toAmount if available, fallback to amount for backward compatibility
  const transferIn = transfers
    .filter((t) => t.toAccountId === id)
    .reduce((acc, t) => acc + (t.toAmount ?? t.amount), 0);
  const transferOut = transfers
    .filter((t) => t.fromAccountId === id)
    .reduce((acc, t) => acc + (t.fromAmount ?? t.amount), 0);

  // Calculate current balance based on account type
  let currentBalance: number;
  let profitLoss: number | undefined;
  let netContributions: number | undefined;

  if (account.type === "balance") {
    currentBalance = balanceHistory[0]?.balance ?? account.initialBalance;
  } else if (account.type === "investment") {
    currentBalance = investmentHistory[0]?.balance ?? 0;
    // Investment accounts are always assets, so use standard calculation
    netContributions = transferIn - transferOut;
    profitLoss = currentBalance - netContributions;
  } else {
    // Transaction account: calculate balance based on account nature (asset vs liability)
    const credits = transactions
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);
    const debits = transactions
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);

    currentBalance = calculateTransactionAccountBalance(
      account.initialBalance,
      credits,
      debits,
      transferIn,
      transferOut,
      account.nature as "asset" | "liability"
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/accounts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{account.name}</h1>
              <Badge variant={account.nature === "asset" ? "default" : "destructive"}>
                {account.nature}
              </Badge>
              <Badge variant="outline">
                {formatCategoryDisplay(String(account.category))}
              </Badge>
            </div>
            <p className="text-muted-foreground capitalize">
              {account.type} account • {account.currency}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={isEditAccountDialogOpen} onOpenChange={setIsEditAccountDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit {account.name}</DialogTitle>
                <DialogDescription>Update account details</DialogDescription>
              </DialogHeader>
              <AccountEditForm
                account={account}
                transactions={transactions}
                balanceHistory={balanceHistory}
                onSuccess={handleAccountUpdated}
              />
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Account</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this account? This will also delete all
                  transactions and balance history. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAccount}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className={`grid gap-4 ${account.type === "investment" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {account.type === "investment" ? "Current Value" : "Current Balance"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                account.nature === "asset" 
                  ? "text-green-600" 
                  : currentBalance < 0 
                    ? "text-green-600" 
                    : "text-red-600"
              }`}
            >
              {account.nature === "liability" && currentBalance < 0 
                ? `${formatCurrency(Math.abs(currentBalance), account.currency)} credit`
                : formatCurrency(currentBalance, account.currency)}
            </div>
          </CardContent>
        </Card>

        {account.type === "investment" ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Net Contributions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(netContributions ?? 0, account.currency)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Profit / Loss</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`flex items-center gap-2 text-2xl font-bold ${
                  (profitLoss ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                }`}>
                  {(profitLoss ?? 0) >= 0 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : (
                    <TrendingDown className="h-5 w-5" />
                  )}
                  {formatCurrency(Math.abs(profitLoss ?? 0), account.currency)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Value Updates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{investmentHistory.length}</div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Initial Balance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(account.initialBalance, account.currency)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  {account.type === "transaction" ? "Transactions" : "Balance Updates"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {account.type === "transaction" ? transactions.length : balanceHistory.length}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="flex gap-2">
        {account.type === "transaction" && (
          <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Transaction
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Transaction</DialogTitle>
                <DialogDescription>
                  Add a new transaction to {account.name}
                </DialogDescription>
              </DialogHeader>
              <TransactionForm
                accountId={id}
                currency={account.currency}
                onSuccess={handleTransactionCreated}
              />
            </DialogContent>
          </Dialog>
        )}

        {account.type === "balance" && (
          <Dialog open={isBalanceDialogOpen} onOpenChange={setIsBalanceDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Update Balance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update Balance</DialogTitle>
                <DialogDescription>Record a new balance for {account.name}</DialogDescription>
              </DialogHeader>
              <BalanceUpdateForm
                accountId={id}
                currency={account.currency}
                onSuccess={handleBalanceUpdated}
              />
            </DialogContent>
          </Dialog>
        )}

        {account.type === "investment" && (
          <Dialog open={isInvestmentBalanceDialogOpen} onOpenChange={setIsInvestmentBalanceDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Update Value
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update Investment Value</DialogTitle>
                <DialogDescription>Record the current market value for {account.name}</DialogDescription>
              </DialogHeader>
              <InvestmentBalanceForm
                accountId={id}
                currency={account.currency}
                onSuccess={handleInvestmentBalanceUpdated}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Transfer button only for transaction and investment accounts */}
        {account.type !== "balance" && (
          <>
            <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <ArrowLeftRight className="mr-2 h-4 w-4" />
                  Transfer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transfer Funds</DialogTitle>
                  <DialogDescription>Transfer money between accounts</DialogDescription>
                </DialogHeader>
                <TransferForm
                  fromAccountId={id}
                  accounts={accounts}
                  onSuccess={handleTransferCreated}
                />
              </DialogContent>
            </Dialog>

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
          </>
        )}
      </div>

      {/* Charts Section */}
      <AccountChartsContainer
        account={account}
        transactions={transactions}
        transfers={transfers}
        balanceHistory={balanceHistory}
        investmentHistory={investmentHistory}
        isLoading={isLoading}
      />

      {/* Edit Transaction Dialog */}
      {account.type === "transaction" && editingTransaction && (
        <Dialog open={isEditTransactionDialogOpen} onOpenChange={setIsEditTransactionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Transaction</DialogTitle>
              <DialogDescription>Update transaction details</DialogDescription>
            </DialogHeader>
            <TransactionForm
              accountId={id}
              currency={account.currency}
              transaction={editingTransaction}
              mode="edit"
              onSuccess={handleTransactionUpdated}
            />
          </DialogContent>
        </Dialog>
      )}

      {account.type === "transaction" && (
        <Card>
          <CardHeader>
            <CardTitle>Transactions & Transfers</CardTitle>
            <CardDescription>
              {transactions.length + transfers.length} item{(transactions.length + transfers.length) !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 && transfers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No transactions or transfers yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TooltipProvider>
                    {(() => {
                      // Create unified array and sort by date descending
                      const unifiedItems: UnifiedItem[] = [
                        ...transactions.map((t) => ({ type: "transaction" as const, data: t })),
                        ...transfers.map((t) => ({ type: "transfer" as const, data: t })),
                      ].sort((a, b) => {
                        const dateA = new Date(a.data.date).getTime();
                        const dateB = new Date(b.data.date).getTime();
                        return dateB - dateA;
                      });

                      return unifiedItems.map((item) => {
                        if (item.type === "transaction") {
                          const transaction = item.data;
                          return (
                            <TableRow key={`transaction-${transaction.id}`}>
                              <TableCell>{format(new Date(transaction.date), "MMM d, yyyy")}</TableCell>
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
                              <TableCell>{transaction.description || "-"}</TableCell>
                              <TableCell
                                className={`text-right font-medium ${
                                  transaction.type === "credit" ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {transaction.type === "credit" ? "+" : "-"}
                                {formatCurrency(transaction.amount, account.currency)}
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
                          const isOutgoing = transfer.fromAccountId === id;
                          const otherAccount = accounts.find(
                            (a) => a.id === (isOutgoing ? transfer.toAccountId : transfer.fromAccountId)
                          );
                          const isCrossCurrency = account.currency !== otherAccount?.currency;
                          // Use fromAmount for outgoing, toAmount for incoming (both already in account currency)
                          const displayAmount = isOutgoing 
                            ? (transfer.fromAmount ?? transfer.amount)
                            : (transfer.toAmount ?? transfer.amount);
                          
                          return (
                            <TableRow key={`transfer-${transfer.id}`}>
                              <TableCell>{format(new Date(transfer.date), "MMM d, yyyy")}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <ArrowLeftRight className="h-4 w-4 text-blue-500" />
                                  <span>
                                    {isOutgoing ? "To" : "From"} {otherAccount?.name || "Unknown"}
                                  </span>
                                  {isCrossCurrency && otherAccount && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="ml-1">
                                          {otherAccount.currency}
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
                                <Badge variant="outline">{transfer.category || "Transfer"}</Badge>
                              </TableCell>
                              <TableCell>
                                <div>
                                  {transfer.description || "-"}
                                  {isCrossCurrency && transfer.exchangeRate && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Rate: {transfer.exchangeRate.toFixed(4)}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell
                                className={`text-right font-medium ${
                                  isOutgoing ? "text-red-600" : "text-green-600"
                                }`}
                              >
                                {isOutgoing ? "-" : "+"}
                                {formatCurrency(displayAmount, account.currency)}
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
                      });
                    })()}
                  </TooltipProvider>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {account.type === "balance" && (
        <Card>
          <CardHeader>
            <CardTitle>Balance History</CardTitle>
            <CardDescription>
              {balanceHistory.length} update{balanceHistory.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {balanceHistory.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No balance updates yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balanceHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(new Date(entry.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(entry.balance, account.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {account.type === "investment" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Value History</CardTitle>
              <CardDescription>
                {investmentHistory.length} update{investmentHistory.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {investmentHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No value updates yet. Add your first value update to start tracking performance.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Market Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {investmentHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{format(new Date(entry.date), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(entry.balance, account.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {transfers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Transfers</CardTitle>
                <CardDescription>
                  {transfers.length} transfer{transfers.length !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TooltipProvider>
                      {transfers
                        .sort((a, b) => {
                          const dateA = new Date(a.date).getTime();
                          const dateB = new Date(b.date).getTime();
                          return dateB - dateA;
                        })
                        .map((transfer) => {
                          const isOutgoing = transfer.fromAccountId === id;
                          const otherAccount = accounts.find(
                            (a) => a.id === (isOutgoing ? transfer.toAccountId : transfer.fromAccountId)
                          );
                          const isCrossCurrency = account.currency !== otherAccount?.currency;
                          // Use fromAmount for outgoing, toAmount for incoming (both already in account currency)
                          const displayAmount = isOutgoing 
                            ? (transfer.fromAmount ?? transfer.amount)
                            : (transfer.toAmount ?? transfer.amount);
                          
                          return (
                            <TableRow key={transfer.id}>
                              <TableCell>{format(new Date(transfer.date), "MMM d, yyyy")}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <ArrowLeftRight className="h-4 w-4 text-blue-500" />
                                  <span>
                                    {isOutgoing ? "To" : "From"} {otherAccount?.name || "Unknown"}
                                  </span>
                                  {isCrossCurrency && otherAccount && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="ml-1">
                                          {otherAccount.currency}
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
                                <Badge variant="outline">{transfer.category || "Transfer"}</Badge>
                              </TableCell>
                              <TableCell>
                                <div>
                                  {transfer.description || "-"}
                                  {isCrossCurrency && transfer.exchangeRate && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Rate: {transfer.exchangeRate.toFixed(4)}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell
                                className={`text-right font-medium ${
                                  isOutgoing ? "text-red-600" : "text-green-600"
                                }`}
                              >
                                {isOutgoing ? "-" : "+"}
                                {formatCurrency(displayAmount, account.currency)}
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
                        })}
                    </TooltipProvider>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

    </div>
  );
};

export default AccountDetailPage;

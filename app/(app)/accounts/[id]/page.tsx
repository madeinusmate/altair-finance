"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Search,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Account, Transaction, Transfer, BalanceHistory, InvestmentHistory } from "@/lib/db/schema";
import { transactionSubtitle, transactionTitle } from "@/lib/payees/display";
import { PayeeMark } from "@/components/payees/payee-mark";
import { TransactionForm } from "@/components/transaction-form";
import { TransferForm } from "@/components/transfer-form";
import { BalanceUpdateForm } from "@/components/balance-update-form";
import { InvestmentBalanceForm } from "@/components/investment-balance-form";
import { AccountEditForm } from "@/components/account-edit-form";
import { TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format, startOfMonth, endOfDay, subMonths, startOfDay } from "date-fns";
import { formatCategoryDisplay } from "@/lib/account-categories";
import { calculateTransactionAccountBalance, calculateNetContributions } from "@/lib/accounting";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AccountChartsContainer } from "@/components/account-charts/account-charts-container";
import { InvestmentPerformanceChart } from "@/components/dashboard/investment-performance-chart";
import { DashboardDateSelector, type DashboardDateRange } from "@/components/dashboard/dashboard-date-selector";
import { PdfStatementImport } from "@/components/pdf-import/pdf-statement-import";
import { FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CategoryBadge } from "@/components/category-management/category-badge";
import { LedgerDateFilter } from "@/components/ledger/ledger-date-filter";
import { isInLedgerDateFilter, type LedgerDateFilter as LedgerDateFilterValue } from "@/lib/ledger/date-filter";
import { BulkRecategorizeBar, type BulkCategory } from "@/components/ledger/bulk-recategorize-bar";
import {
  headerCheckboxState,
  ledgerSelectionKey,
  toggleFilteredSelection,
  toLedgerSelection,
  type LedgerSelectionEntry,
} from "@/lib/ledger/selection";

type LedgerTransaction = Transaction & { payeeName?: string | null; payeeIcon?: string | null };

type UnifiedItem = 
  | { type: "transaction"; data: LedgerTransaction }
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
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [payees, setPayees] = useState<Array<{ id: string; name: string; icon?: string | null; iconImage?: string | null }>>([]);
  const payeeById = useMemo(() => new Map(payees.map((payee) => [payee.id, payee])), [payees]);
  const [payeeFilter, setPayeeFilter] = useState("all");
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
  const [editingTransaction, setEditingTransaction] = useState<LedgerTransaction | null>(null);
  const [isEditTransferDialogOpen, setIsEditTransferDialogOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [isPdfImportDialogOpen, setIsPdfImportDialogOpen] = useState(false);
  const [isEditBalanceEntryDialogOpen, setIsEditBalanceEntryDialogOpen] = useState(false);
  const [editingBalanceEntry, setEditingBalanceEntry] = useState<BalanceHistory | null>(null);
  const [isEditInvestmentEntryDialogOpen, setIsEditInvestmentEntryDialogOpen] = useState(false);
  const [editingInvestmentEntry, setEditingInvestmentEntry] = useState<InvestmentHistory | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all"); // "all" | "debit" | "credit" | "transfer"
  const [ledgerDateFilter, setLedgerDateFilter] = useState<LedgerDateFilterValue>({ kind: "all" });
  const [transactionCategories, setTransactionCategories] = useState<BulkCategory[]>([]);
  const [selectedRows, setSelectedRows] = useState<Map<string, LedgerSelectionEntry>>(new Map());
  
  // Investment performance chart state
  const [dateRange, setDateRange] = useState<DashboardDateRange>(() => {
    const now = new Date();
    const endDate = endOfDay(now);
    const currentMonthStart = startOfMonth(now);
    const startDate = startOfDay(subMonths(currentMonthStart, 2));
    return {
      startDate,
      endDate,
    };
  });
  const [investmentPerformanceData, setInvestmentPerformanceData] = useState<{
    data: Array<{
      date: string;
      dateLabel: string;
      value: number;
      netContributions: number;
      pnl: number;
      pnlPercentage: number;
    }>;
    currentValue: number;
    previousValue: number;
    percentageChange: number;
    currency: string;
  } | null>(null);
  const [isLoadingInvestmentPerformance, setIsLoadingInvestmentPerformance] = useState(false);

  // Calculate the oldest date from transactions, transfers, balance history, and investment history
  const calculateOldestDate = (): Date | null => {
    const dates: Date[] = [];
    
    // Add transaction dates
    transactions.forEach((t) => dates.push(new Date(t.date)));
    
    // Add transfer dates
    transfers.forEach((t) => dates.push(new Date(t.date)));
    
    // Add balance history dates
    balanceHistory.forEach((b) => dates.push(new Date(b.date)));
    
    // Add investment history dates
    investmentHistory.forEach((i) => dates.push(new Date(i.date)));
    
    if (dates.length === 0) {
      return null;
    }
    
    return new Date(Math.min(...dates.map((d) => d.getTime())));
  };

  const oldestDate = calculateOldestDate();

  const fetchData = async () => {
    try {
      const [accountData, unifiedData, balanceData, investmentData, allAccounts, categoriesData, payeesData] =
        await Promise.all([
          apiClient.get<Account>(`/api/accounts/${id}`),
          apiClient.get<{ transactions: LedgerTransaction[]; transfers: Transfer[] }>(`/api/transactions-unified?accountId=${id}`),
          apiClient.get<BalanceHistory[]>(`/api/balance-history?accountId=${id}`),
          apiClient.get<InvestmentHistory[]>(`/api/investment-history?accountId=${id}`),
          apiClient.get<Account[]>("/api/accounts"),
          apiClient.get<{ categories: BulkCategory[] }>("/api/transaction-categories"),
          apiClient.get<{ payees: Array<{ id: string; name: string }> }>("/api/payees"),
        ]);

      setAccount(accountData);
      setTransactions(unifiedData.transactions);
      setPayees(payeesData.payees || []);
      setTransfers(unifiedData.transfers);
      setBalanceHistory(balanceData);
      setInvestmentHistory(investmentData);
      setAccounts(allAccounts);
      setTransactionCategories(categoriesData.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch account");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    setCurrentPage(1);
  }, [id]);

  // Fetch investment performance data for investment accounts
  useEffect(() => {
    const fetchInvestmentPerformance = async () => {
      if (!account || account.type !== "investment") {
        setInvestmentPerformanceData(null);
        return;
      }

      setIsLoadingInvestmentPerformance(true);
      try {
        const startDateStr = format(dateRange.startDate, "yyyy-MM-dd");
        const endDateStr = format(dateRange.endDate, "yyyy-MM-dd");
        const data = await apiClient.get<{
          data: Array<{
            date: string;
            dateLabel: string;
            value: number;
            netContributions: number;
            pnl: number;
            pnlPercentage: number;
          }>;
          currentValue: number;
          previousValue: number;
          percentageChange: number;
          currency: string;
        }>(
          `/api/dashboard/investment-performance?startDate=${startDateStr}&endDate=${endDateStr}&currency=${account.currency}&accountId=${account.id}`
        );
        setInvestmentPerformanceData(data);
      } catch (err) {
        console.error("Error fetching investment performance:", err);
        setInvestmentPerformanceData(null);
      } finally {
        setIsLoadingInvestmentPerformance(false);
      }
    };

    void fetchInvestmentPerformance();
  }, [account, dateRange]);

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

  const dropSelection = (kind: "transaction" | "transfer", rowId: string) => {
    const key = ledgerSelectionKey(kind, rowId);
    setSelectedRows((current) => {
      if (!current.has(key)) {
        return current;
      }
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      await apiClient.delete(`/api/transactions?id=${transactionId}`);
      dropSelection("transaction", transactionId);
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
      dropSelection("transfer", transferId);
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

  const handleEditBalanceEntry = (entry: BalanceHistory) => {
    setEditingBalanceEntry(entry);
    setIsEditBalanceEntryDialogOpen(true);
  };

  const handleDeleteBalanceEntry = async (entryId: string) => {
    try {
      await apiClient.delete(`/api/balance-history?id=${entryId}`);
      fetchData();
      toast.success("Balance entry deleted");
    } catch {
      toast.error("Failed to delete balance entry");
    }
  };

  const handleBalanceEntryUpdated = () => {
    setIsEditBalanceEntryDialogOpen(false);
    setEditingBalanceEntry(null);
    fetchData();
    toast.success("Balance entry updated");
  };

  const handleEditInvestmentEntry = (entry: InvestmentHistory) => {
    setEditingInvestmentEntry(entry);
    setIsEditInvestmentEntryDialogOpen(true);
  };

  const handleDeleteInvestmentEntry = async (entryId: string) => {
    try {
      await apiClient.delete(`/api/investment-history?id=${entryId}`);
      fetchData();
      toast.success("Investment entry deleted");
    } catch {
      toast.error("Failed to delete investment entry");
    }
  };

  const handleInvestmentEntryUpdated = () => {
    setIsEditInvestmentEntryDialogOpen(false);
    setEditingInvestmentEntry(null);
    fetchData();
    toast.success("Investment entry updated");
  };

  const categoryById = useMemo(
    () => new Map(transactionCategories.map((category) => [category.id, category])),
    [transactionCategories]
  );

  const handleRecategorized = async () => {
    await fetchData();
    setSelectedRows(new Map());
  };

  // Reset to page 1 when items per page or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, searchQuery, categoryFilter, typeFilter, ledgerDateFilter, payeeFilter]);

  useEffect(() => {
    setSelectedRows(new Map());
  }, [id, itemsPerPage, searchQuery, categoryFilter, typeFilter, ledgerDateFilter, payeeFilter]);

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
            <h1 className="text-[34px] font-semibold tracking-[-0.03em]">Account Not Found</h1>
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
              <h1 className="text-[34px] font-semibold tracking-[-0.03em]">{account.name}</h1>
              {account.type === "transaction" && (
                <span className="text-[34px] font-semibold tracking-[-0.03em] tabular-nums text-foreground">
                  {account.nature === "liability" && currentBalance < 0 
                    ? ` • ${formatCurrency(Math.abs(currentBalance), account.currency)} credit`
                    : ` • ${formatCurrency(currentBalance, account.currency)}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className="capitalize" variant="outline">
                {account.nature}
              </Badge>              
              <Badge variant="outline" className="capitalize">
                {account.type}
              </Badge>
              <Badge variant="outline">
                {formatCategoryDisplay(String(account.category))}
              </Badge>
              <Badge variant="outline">
                {account.currency}
              </Badge>
            </div>
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

      {account.type === "investment" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Current Value</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tracking-[-0.03em] tabular-nums text-foreground">
                {account.nature === "liability" && currentBalance < 0 
                  ? `${formatCurrency(Math.abs(currentBalance), account.currency)} credit`
                  : formatCurrency(currentBalance, account.currency)}
              </div>
            </CardContent>
          </Card>
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
                (profitLoss ?? 0) >= 0 ? "text-foreground" : "text-foreground"
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
        </div>
      )}

      

      {/* Charts Section */}
      {account.type === "investment" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <DashboardDateSelector value={dateRange} onChange={setDateRange} oldestDate={oldestDate} />
          </div>
          <InvestmentPerformanceChart
            dateRange={dateRange}
            currency={account.currency}
            isLoading={isLoadingInvestmentPerformance}
            data={investmentPerformanceData || undefined}
          />
        </div>
      ) : (
        <AccountChartsContainer
          account={account}
          transactions={transactions}
          transfers={transfers}
          balanceHistory={balanceHistory}
          investmentHistory={investmentHistory}
          isLoading={isLoading}
        />
      )}

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

<div className="flex gap-2">
        {account.type === "transaction" && (
          <>
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
            <Dialog open={isPdfImportDialogOpen} onOpenChange={setIsPdfImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                Import PDF Statement
              </Button>
            </DialogTrigger>
            <DialogContent className="!max-w-[98vw] !max-h-[98vh] !w-[98vw] !h-[98vh] !translate-x-[-50%] !translate-y-[-50%] !top-[50%] !left-[50%] overflow-hidden flex flex-col p-0 gap-0 [&>button]:z-50">
              <div className="p-6 border-b shrink-0 bg-background">
                <DialogHeader>
                  <DialogTitle>Import PDF Statement</DialogTitle>
                  <DialogDescription>
                    Statements are read on this computer. The file is not sent anywhere unless you turn on cloud parsing. Import transactions into {account.name}
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="flex-1 overflow-y-auto p-6 min-h-0">
                <PdfStatementImport
                  accountId={id}
                  onSuccess={() => {
                    setIsPdfImportDialogOpen(false);
                    fetchData();
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
          </>
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

      {account.type === "transaction" && (() => {
        // Create unified array and sort by date descending
        const unifiedItems: UnifiedItem[] = [
          ...transactions.map((t) => ({ type: "transaction" as const, data: t })),
          ...transfers.map((t) => ({ type: "transfer" as const, data: t })),
        ].sort((a, b) => {
          const dateA = new Date(a.data.date).getTime();
          const dateB = new Date(b.data.date).getTime();
          return dateB - dateA;
        });

        // Apply filters
        const filteredItems = unifiedItems.filter((item) => {
          if (!isInLedgerDateFilter(item.data.date, ledgerDateFilter)) {
            return false;
          }

          if (item.type === "transaction") {
            const t = item.data;

            // Search filter
            if (searchQuery) {
              const query = searchQuery.toLowerCase();
              const matchesDescription = t.description?.toLowerCase().includes(query);
              const matchesPayee = t.payeeName?.toLowerCase().includes(query);
              const matchesCategory = (t.category ?? "").toLowerCase().includes(query);
              if (!matchesDescription && !matchesPayee && !matchesCategory) {
                return false;
              }
            }

            if (payeeFilter !== "all" && t.payeeId !== payeeFilter) {
              return false;
            }

            // Category filter
            if (categoryFilter !== "all" && String(t.categoryId ?? "") !== categoryFilter) {
              return false;
            }

            // Type filter
            if (typeFilter !== "all" && typeFilter !== "transfer" && t.type !== typeFilter) {
              return false;
            }

            if (typeFilter === "transfer") {
              return false; // Hide transactions when filtering for transfers
            }

            return true;
          } else {
            // Transfer filtering
            const t = item.data;

            // Search filter
            if (searchQuery) {
              const query = searchQuery.toLowerCase();
              const matchesDescription = t.description?.toLowerCase().includes(query);
              const matchesCategory = (t.category ?? "").toLowerCase().includes(query);
              const otherAccount = accounts.find(
                (a) => a.id === (t.fromAccountId === id ? t.toAccountId : t.fromAccountId)
              );
              const matchesAccount = otherAccount?.name.toLowerCase().includes(query);
              if (!matchesDescription && !matchesCategory && !matchesAccount) {
                return false;
              }
            }

            // Category filter
            if (categoryFilter !== "all" && String(t.categoryId ?? "") !== categoryFilter) {
              return false;
            }

            // Type filter
            if (typeFilter !== "all" && typeFilter !== "transfer") {
              return false; // Hide transfers when filtering for debit/credit
            }

            if (payeeFilter !== "all") {
              return false;
            }

            return true;
          }
        });

        const totalItems = filteredItems.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedItems = filteredItems.slice(startIndex, endIndex);
        const selectableEntries = filteredItems.map(toLedgerSelection);
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

        return (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Transactions & Transfers</CardTitle>
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
              {unifiedItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No transactions or transfers yet</p>
              ) : (
                <>
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
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Payee</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TooltipProvider>
                        {paginatedItems.map((item) => {
                        if (item.type === "transaction") {
                          const transaction = item.data;
                          return (
                            <TableRow key={`transaction-${transaction.id}`}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedRows.has(ledgerSelectionKey("transaction", transaction.id))}
                                  onCheckedChange={(value) =>
                                    toggleRow(toLedgerSelection(item), value === true)
                                  }
                                  aria-label={`Select transaction ${transaction.description?.trim() || transaction.category}`}
                                />
                              </TableCell>
                              <TableCell>{format(new Date(transaction.date), "MMM d, yyyy")}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {transaction.type === "credit" ? (
                                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  <span className="capitalize">{transaction.type}</span>
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
                                <div className="flex items-center gap-2 font-medium">
                                  <PayeeMark
                                    image={transaction.payeeId ? payeeById.get(transaction.payeeId)?.iconImage : null}
                                    icon={transaction.payeeId ? payeeById.get(transaction.payeeId)?.icon ?? transaction.payeeIcon : transaction.payeeIcon}
                                    fallback=""
                                  />
                                  {transactionTitle(transaction.payeeName, transaction.description, transaction.category)}
                                </div>
                                {transactionSubtitle(transaction.payeeName, transaction.description) ? (
                                  <div className="text-xs text-muted-foreground">
                                    {transactionSubtitle(transaction.payeeName, transaction.description)}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell
                                className={`text-right font-medium ${
                                  transaction.type === "credit" ? "text-foreground" : "text-foreground"
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
                              <TableCell>
                                <Checkbox
                                  checked={selectedRows.has(ledgerSelectionKey("transfer", transfer.id))}
                                  onCheckedChange={(value) =>
                                    toggleRow(toLedgerSelection(item), value === true)
                                  }
                                  aria-label={`Select transfer ${transfer.description?.trim() || "Transfer"}`}
                                />
                              </TableCell>
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
                                <CategoryBadge
                                  name={categoryById.get(transfer.categoryId ?? -1)?.name || transfer.category || "Transfer"}
                                  color={categoryById.get(transfer.categoryId ?? -1)?.color}
                                  icon={categoryById.get(transfer.categoryId ?? -1)?.icon}
                                />
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
                                  isOutgoing ? "text-foreground" : "text-foreground"
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
                      })}
                      </TooltipProvider>
                    </TableBody>
                  </Table>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Debit total:{" "}
                    {formatCurrency(
                      filteredItems.reduce((sum, item) => {
                        if (item.type !== "transaction" || item.data.type !== "debit") return sum;
                        return sum + item.data.amount;
                      }, 0),
                      account.currency
                    )}
                  </p>
                  </>
                  )}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground line-clamp-1" >
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
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })()}

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
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balanceHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(new Date(entry.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(entry.balance, account.currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditBalanceEntry(entry)}
                            aria-label="Edit balance entry"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteBalanceEntry(entry.id)}
                            aria-label="Delete balance entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={isEditBalanceEntryDialogOpen} onOpenChange={(open) => {
        setIsEditBalanceEntryDialogOpen(open);
        if (!open) setEditingBalanceEntry(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Balance Entry</DialogTitle>
            <DialogDescription>Update the balance and date for this entry.</DialogDescription>
          </DialogHeader>
          {editingBalanceEntry && account && (
            <BalanceUpdateForm
              accountId={id}
              currency={account.currency}
              onSuccess={handleBalanceEntryUpdated}
              entry={editingBalanceEntry}
            />
          )}
        </DialogContent>
      </Dialog>

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
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {investmentHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{format(new Date(entry.date), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(entry.balance, account.currency)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditInvestmentEntry(entry)}
                              aria-label="Edit investment entry"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteInvestmentEntry(entry.id)}
                              aria-label="Delete investment entry"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={isEditInvestmentEntryDialogOpen} onOpenChange={(open) => {
            setIsEditInvestmentEntryDialogOpen(open);
            if (!open) setEditingInvestmentEntry(null);
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Value Entry</DialogTitle>
                <DialogDescription>Update the market value and date for this entry.</DialogDescription>
              </DialogHeader>
              {editingInvestmentEntry && account && (
                <InvestmentBalanceForm
                  accountId={id}
                  currency={account.currency}
                  onSuccess={handleInvestmentEntryUpdated}
                  entry={editingInvestmentEntry}
                />
              )}
            </DialogContent>
          </Dialog>

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
                                <CategoryBadge
                                  name={categoryById.get(transfer.categoryId ?? -1)?.name || transfer.category || "Transfer"}
                                  color={categoryById.get(transfer.categoryId ?? -1)?.color}
                                  icon={categoryById.get(transfer.categoryId ?? -1)?.icon}
                                />
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
                                  isOutgoing ? "text-foreground" : "text-foreground"
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

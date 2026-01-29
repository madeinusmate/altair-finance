"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus } from "lucide-react";
import { TransactionCategoriesTable } from "@/components/category-management/transaction-categories-table";
import { AccountCategoriesTable } from "@/components/category-management/account-categories-table";
import { CategoryEditDialog } from "@/components/category-management/category-edit-dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

interface TransactionCategory {
  id: number;
  name: string;
  color?: string | null;
  icon?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AccountCategory {
  id: number;
  identifier: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const CategoriesPage = () => {
  const { getKey } = useAuth();
  const [transactionCategories, setTransactionCategories] = useState<TransactionCategory[]>([]);
  const [accountCategories, setAccountCategories] = useState<AccountCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateTransaction, setShowCreateTransaction] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  const fetchCategories = async () => {
    const key = getKey();
    if (!key) {
      toast.error("Please unlock the app first");
      return;
    }

    try {
      setIsLoading(true);
      const [txData, acctData] = await Promise.all([
        apiClient.get<{ categories: TransactionCategory[] }>("/api/transaction-categories"),
        apiClient.get<{ categories: AccountCategory[] }>("/api/account-categories"),
      ]);

      setTransactionCategories(txData.categories || []);
      setAccountCategories(acctData.categories || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to load categories");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Category Management</h1>
          <p className="text-muted-foreground">Manage transaction and account categories</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transaction Categories</CardTitle>
              <CardDescription>
                Categories used for transactions and transfers
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateTransaction(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <TransactionCategoriesTable
              categories={transactionCategories}
              onRefresh={fetchCategories}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Account Categories</CardTitle>
              <CardDescription>
                Categories used for account classification
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateAccount(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <AccountCategoriesTable
              categories={accountCategories}
              onRefresh={fetchCategories}
            />
          )}
        </CardContent>
      </Card>

      <CategoryEditDialog
        open={showCreateTransaction}
        onOpenChange={setShowCreateTransaction}
        category={null}
        type="transaction"
        onSuccess={() => {
          setShowCreateTransaction(false);
          fetchCategories();
        }}
      />

      <CategoryEditDialog
        open={showCreateAccount}
        onOpenChange={setShowCreateAccount}
        category={null}
        type="account"
        onSuccess={() => {
          setShowCreateAccount(false);
          fetchCategories();
        }}
      />
    </div>
  );
};

export default CategoriesPage;

"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { Account, Transaction, BalanceHistory } from "@/lib/db/schema";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountAppearanceFields } from "@/components/accounts/account-appearance-fields";
import {
  dialogFormBodyClassName,
  dialogFormFooterClassName,
  dialogLockedClassName,
  dialogSelectClassName,
  FormRow,
  FormSection,
} from "@/components/form-section";
import { DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface AccountEditFormProps {
  account: Account;
  transactions?: Transaction[];
  balanceHistory?: BalanceHistory[];
  onSuccess: () => void;
  onCancel?: () => void;
}

const accountTypeLabel = (type: Account["type"]) => {
  if (type === "balance") return "Balance Account";
  if (type === "transaction") return "Transaction Account";
  return "Investment Account";
};

export const AccountEditForm = ({
  account,
  transactions = [],
  balanceHistory = [],
  onSuccess,
  onCancel,
}: AccountEditFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getKey, usesBooksOwner } = useAuth();
  const [categories, setCategories] = useState<Array<{ identifier: string; name: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [name, setName] = useState(account.name);
  const [nature, setNature] = useState<"asset" | "liability">(account.nature);
  const [category, setCategory] = useState<string>(account.category);
  const [currency, setCurrency] = useState(account.currency);
  const [initialBalance, setInitialBalance] = useState(account.initialBalance.toString());
  const [icon, setIcon] = useState(account.icon ?? "");
  const [iconImage, setIconImage] = useState(account.iconImage ?? "");

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      const key = getKey();
      if (!key && !usesBooksOwner) {
        setCategoriesLoading(false);
        return;
      }

      try {
        const data = await apiClient.get<{ categories: Array<{ identifier: string; name: string }> }>("/api/account-categories");
        setCategories(data.categories);
      } catch (error) {
        console.error("Error fetching categories:", error);
        toast.error("Failed to load categories");
      } finally {
        setCategoriesLoading(false);
      }
    };

    fetchCategories();
  }, [getKey]);

  // Show warning if editing initial balance with existing history
  const hasHistory =
    account.type === "balance" ? balanceHistory.length > 0 : transactions.length > 0;
  const showWarning = hasHistory && account.type !== "investment";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await apiClient.put("/api/accounts", {
        id: account.id,
        name,
        currency,
        nature,
        category,
        initialBalance: account.type === "investment" ? 0 : parseFloat(initialBalance) || 0,
        icon: icon || null,
        iconImage: iconImage || null,
      });

      toast.success("Account updated successfully");
      onSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update account";
      setError(errorMessage);
      toast.error(errorMessage);
      setIsLoading(false);
    }
  };

  const isInvestment = account.type === "investment";

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-col overflow-hidden">
      <div className={dialogFormBodyClassName}>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {showWarning && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This account has existing {account.type === "balance" ? "balance history" : "transactions"}.
              Changing the initial balance may affect calculated balances.
            </AlertDescription>
          </Alert>
        )}

        <FormSection title="Details">
          <div className="space-y-2">
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
              placeholder="e.g., Savings Account, Credit Card"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <FormRow>
            <div className="space-y-2">
              <Label htmlFor="account-type">Account Type</Label>
              <div id="account-type" className={dialogLockedClassName}>
                {accountTypeLabel(account.type)}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nature">Account Nature</Label>
              {isInvestment ? (
                <>
                  <div id="nature" className={dialogLockedClassName}>
                    Asset
                  </div>
                  <p className="text-xs text-muted-foreground">Investment accounts are assets.</p>
                </>
              ) : (
                <Select value={nature} onValueChange={(v) => setNature(v as "asset" | "liability")}>
                  <SelectTrigger id="nature" className={dialogSelectClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asset">
                      <div className="flex flex-col items-start">
                        <span>Asset</span>
                        <span className="text-xs text-muted-foreground">Increases your net worth</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="liability">
                      <div className="flex flex-col items-start">
                        <span>Liability</span>
                        <span className="text-xs text-muted-foreground">Decreases your net worth</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </FormRow>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            {categoriesLoading ? (
              <Skeleton className="h-10 w-full rounded-full" />
            ) : (
              <Select value={category} onValueChange={setCategory} disabled={categoriesLoading || categories.length === 0}>
                <SelectTrigger id="category" className={dialogSelectClassName}>
                  <SelectValue placeholder={categories.length === 0 ? "No categories available" : "Select category"} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.identifier} value={cat.identifier}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </FormSection>

        <Separator />

        <FormSection title="Opening balance">
          <FormRow>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency" className={dialogSelectClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="initialBalance">Initial Balance</Label>
              {isInvestment ? (
                <div id="initialBalance" className={dialogLockedClassName}>
                  <span className="text-muted-foreground">Starts at zero</span>
                </div>
              ) : (
                <Input
                  id="initialBalance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  disabled={isLoading}
                />
              )}
            </div>
          </FormRow>
        </FormSection>

        <Separator />

        <FormSection title="Appearance">
          <AccountAppearanceFields
            name={name}
            icon={icon}
            iconImage={iconImage}
            onIconChange={setIcon}
            onIconImageChange={setIconImage}
            disabled={isLoading}
          />
        </FormSection>
      </div>

      <DialogFooter className={dialogFormFooterClassName}>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={isLoading || !name}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            "Update Account"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
};

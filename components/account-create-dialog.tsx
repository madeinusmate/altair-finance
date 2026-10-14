"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { DEFAULT_ACCOUNT_CURRENCY, SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";

interface AccountCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const AccountCreateDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: AccountCreateDialogProps) => {
  const { getKey } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Array<{ identifier: string; name: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  
  const [name, setName] = useState("");
  const [type, setType] = useState<"balance" | "transaction" | "investment">("balance");
  const [nature, setNature] = useState<"asset" | "liability">("asset");
  const [category, setCategory] = useState<string>("");
  const [currency, setCurrency] = useState<SupportedCurrency>(DEFAULT_ACCOUNT_CURRENCY);
  const [initialBalance, setInitialBalance] = useState("0");

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      const key = getKey();
      if (!key) {
        setCategoriesLoading(false);
        return;
      }

      try {
        const data = await apiClient.get<{ categories: Array<{ identifier: string; name: string }> }>("/api/account-categories");
        setCategories(data.categories);
        if (data.categories.length > 0) {
          setCategory(data.categories[0].identifier);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
        toast.error("Failed to load categories");
      } finally {
        setCategoriesLoading(false);
      }
    };

    if (open) {
      fetchCategories();
    }
  }, [getKey, open]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setType("balance");
      setNature("asset");
      setCurrency(DEFAULT_ACCOUNT_CURRENCY);
      setInitialBalance("0");
      setError(null);
      // Category will be set when categories load in the fetchCategories effect
    }
  }, [open]);

  // Investment accounts are always assets with zero initial balance
  const isInvestment = type === "investment";
  const effectiveNature = isInvestment ? "asset" : nature;
  const effectiveInitialBalance = isInvestment ? "0" : initialBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await apiClient.post("/api/accounts", {
        name,
        type,
        nature: effectiveNature,
        category,
        currency,
        initialBalance: parseFloat(effectiveInitialBalance) || 0,
      });

      toast.success("Account created successfully");
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Account</DialogTitle>
          <DialogDescription>
            Enter the details for your new account. Choose between a balance account (tracks
            balance changes), a transaction account (tracks individual transactions), or an
            investment account (tracks contributions and market value).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

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

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Account Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "balance" | "transaction" | "investment")}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balance">
                    <div className="flex flex-col items-start">
                      <span>Balance Account</span>
                      <span className="text-xs text-muted-foreground">
                        Track balance changes over time
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="transaction">
                    <div className="flex flex-col items-start">
                      <span>Transaction Account</span>
                      <span className="text-xs text-muted-foreground">
                        Track individual transactions
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="investment">
                    <div className="flex flex-col items-start">
                      <span>Investment Account</span>
                      <span className="text-xs text-muted-foreground">
                        Track contributions and profit/loss
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nature">Account Nature</Label>
              {isInvestment ? (
                <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                  Asset (investment accounts are always assets)
                </div>
              ) : (
                <Select value={nature} onValueChange={(v) => setNature(v as "asset" | "liability")}>
                  <SelectTrigger id="nature">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asset">
                      <div className="flex flex-col items-start">
                        <span>Asset</span>
                        <span className="text-xs text-muted-foreground">
                          Increases your net worth
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="liability">
                      <div className="flex flex-col items-start">
                        <span>Liability</span>
                        <span className="text-xs text-muted-foreground">
                          Decreases your net worth
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            {categoriesLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={category} onValueChange={setCategory} disabled={categoriesLoading || categories.length === 0}>
                <SelectTrigger id="category">
                  <SelectValue placeholder={categories.length === 0 ? "No categories available" : "Select a category"} />
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as SupportedCurrency)}>
                <SelectTrigger id="currency">
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

            {!isInvestment && (
              <div className="space-y-2">
                <Label htmlFor="initialBalance">Initial Balance</Label>
                <Input
                  id="initialBalance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name || !category}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

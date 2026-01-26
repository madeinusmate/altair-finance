"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_ACCOUNT_CURRENCY, SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { ACCOUNT_CATEGORIES, formatCategoryDisplay, type AccountCategory } from "@/lib/account-categories";

const NewAccountPage = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [type, setType] = useState<"balance" | "transaction" | "investment">("balance");
  const [nature, setNature] = useState<"asset" | "liability">("asset");
  const [category, setCategory] = useState<AccountCategory | "">("");
  const [currency, setCurrency] = useState<SupportedCurrency>(DEFAULT_ACCOUNT_CURRENCY);
  const [initialBalance, setInitialBalance] = useState("0");

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
      router.push("/accounts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/accounts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Account</h1>
          <p className="text-muted-foreground">Add a new financial account</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>
            Enter the details for your new account. Choose between a balance account (tracks
            balance changes), a transaction account (tracks individual transactions), or an
            investment account (tracks contributions and market value).
          </CardDescription>
        </CardHeader>
        <CardContent>
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

            <div className="grid gap-4 sm:grid-cols-2">
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
              <Select value={category} onValueChange={(v) => setCategory(v as AccountCategory)}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {formatCategoryDisplay(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div className="flex gap-4">
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
              <Button type="button" variant="outline" asChild>
                <Link href="/accounts">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default NewAccountPage;

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, AlertCircle } from "lucide-react";

export const UnlockForm = () => {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { unlock } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const result = await unlock(key);

    if (result.success) {
      router.push("/dashboard");
    } else {
      setError(result.error || "Failed to unlock");
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Unlock Netly</CardTitle>
        <CardDescription>
          Enter your encryption key to access your financial data
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive" aria-live="polite">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="encryption-key">Encryption Key</Label>
            <Input
              id="encryption-key"
              name="encryption-key"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your encryption key…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isLoading}
              spellCheck={false}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Minimum 8 characters. This key encrypts all your data locally.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Unlocking…
              </>
            ) : (
              "Unlock"
            )}
          </Button>
          <Button type="button" variant="ghost" className="w-full" asChild>
            <Link href="/recovery">Need Help Unlocking?</Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

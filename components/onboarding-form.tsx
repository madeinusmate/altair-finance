"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, KeyRound, AlertCircle } from "lucide-react";

const getStrength = (value: string): { label: string; tone: "muted" | "warning" | "success" } => {
  if (value.length < 8) {
    return { label: "Too Short", tone: "warning" };
  }

  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSymbol = /[^a-zA-Z\d]/.test(value);
  const score = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;

  if (score <= 1) {
    return { label: "Weak", tone: "warning" };
  }
  if (score === 2) {
    return { label: "Fair", tone: "muted" };
  }
  return { label: "Strong", tone: "success" };
};

export const OnboardingForm = () => {
  const [key, setKey] = useState("");
  const [confirmKey, setConfirmKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { bootstrap } = useAuth();
  const router = useRouter();

  const strength = getStrength(key);
  const keysMatch = key === confirmKey;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (key.length < 8) {
      setError("Use at least 8 characters for your encryption key.");
      return;
    }

    if (!keysMatch) {
      setError("The confirmation does not match the encryption key.");
      return;
    }

    setIsLoading(true);
    const result = await bootstrap(key);
    if (result.success) {
      router.push("/dashboard");
      return;
    }
    setError(result.error || "Failed to initialize the database.");
    setIsLoading(false);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Create Encryption Key</CardTitle>
        <CardDescription>
          This key encrypts your local database and cannot be recovered later.
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
              autoComplete="new-password"
              placeholder="Create your encryption key…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isLoading}
              spellCheck={false}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Strength:{" "}
              <span
                className={
                  strength.tone === "success"
                    ? "text-emerald-500"
                    : strength.tone === "warning"
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }
              >
                {strength.label}
              </span>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-encryption-key">Confirm Encryption Key</Label>
            <Input
              id="confirm-encryption-key"
              name="confirm-encryption-key"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your encryption key…"
              value={confirmKey}
              onChange={(e) => setConfirmKey(e.target.value)}
              disabled={isLoading}
              spellCheck={false}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create Key"
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Keep this key safe. Losing it means losing access to your data.
          </p>
        </form>
      </CardContent>
    </Card>
  );
};

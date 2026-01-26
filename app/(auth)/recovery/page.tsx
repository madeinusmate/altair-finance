"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

const RecoveryPage = () => {
  const { state, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (state === "unlocked") {
      router.push("/dashboard");
      return;
    }
    if (state === "new") {
      router.push("/onboarding");
      return;
    }
    if (state === "locked") {
      router.push("/unlock");
    }
  }, [isLoading, router, state]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Database Recovery</CardTitle>
          <CardDescription>
            Netly could not open the local database with the stored key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <Database className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-foreground">
                Check that you are using the correct encryption key for this database.
              </p>
              <p className="mt-1">
                If the database was moved or corrupted, you may need to restore from a backup.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-foreground">Start Fresh (Destructive)</p>
            <p className="mt-1">
              Delete the local database file at <span className="font-medium">data/netly.db</span>{" "}
              and reload the app to create a new encrypted database.
            </p>
          </div>
          <Button className="w-full" onClick={() => router.push("/unlock")}>
            Return to Unlock
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default RecoveryPage;

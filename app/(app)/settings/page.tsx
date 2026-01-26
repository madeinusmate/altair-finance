"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatabaseDeleteDialog } from "@/components/database-delete-dialog";
import { useAuth } from "@/lib/auth-context";

const SettingsPage = () => {
  const [isExporting, setIsExporting] = useState(false);
  const { getKey } = useAuth();

  const handleExport = async () => {
    const key = getKey();
    if (!key) {
      toast.error("Unlock the app before exporting the database.");
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch("/api/app/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Encryption-Key": key,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStamp = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `netly-backup-${dateStamp}.zip`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your application settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            About Netly
          </CardTitle>
          <CardDescription>Net Worth Tracker</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span>1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Storage</span>
              <span>Local SQLite Database</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Encryption</span>
              <span>Enabled</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data import</CardTitle>
          <CardDescription>Import transactions, transfers, balances, and investments.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/settings/import">Open CSV import wizard</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Export
          </CardTitle>
          <CardDescription>Download an encrypted backup of your local database.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting…
              </>
            ) : (
              "Export Database"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Delete your local database and start over with a new encryption key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            This removes all stored data and cannot be undone.
          </p>
          <DatabaseDeleteDialog />
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;

"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatabaseDeleteDialog } from "@/components/database-delete-dialog";
import { DatabaseImportWizard } from "@/components/database-import-wizard";
import { useAuth } from "@/lib/auth-context";

const SettingsPage = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const { getKey, isAuthenticated } = useAuth();

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
          <CardTitle>Data Import</CardTitle>
          <CardDescription>Import transactions, transfers, balances, and investments.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/settings/import">Open CSV import wizard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/settings/imports">View import history</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Manage transaction and account categories.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/settings/categories">Manage Categories</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Export & Import
          </CardTitle>
          <CardDescription>
            Download an encrypted backup of your local database or import an existing backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
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
          <Button
            variant="outline"
            onClick={() => setShowImportWizard(true)}
            disabled={!isAuthenticated}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import Database
          </Button>
          {!isAuthenticated && (
            <p className="text-xs text-muted-foreground">
              Unlock the app before importing a database.
            </p>
          )}
        </CardContent>
      </Card>
      <DatabaseImportWizard open={showImportWizard} onOpenChange={setShowImportWizard} />

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

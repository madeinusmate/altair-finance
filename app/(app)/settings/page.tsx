"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";

const SettingsPage = () => {
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
    </div>
  );
};

export default SettingsPage;

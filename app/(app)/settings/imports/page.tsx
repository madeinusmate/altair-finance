"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { ImportHistoryList } from "@/components/imports/import-history-list";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

type Import = {
  id: string;
  type: "transactions" | "balances";
  filename: string;
  fileHash: string;
  rowCount: number;
  createdAt: Date | string;
};

const ImportsPage = () => {
  const { getKey } = useAuth();
  const [imports, setImports] = useState<Import[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchImports = async () => {
    const key = getKey();
    if (!key) {
      toast.error("Please unlock the app first");
      return;
    }

    try {
      setIsLoading(true);
      const data = await apiClient.get<{ imports: Import[] }>("/api/imports");
      setImports(data.imports || []);
    } catch (error) {
      console.error("Error fetching imports:", error);
      toast.error("Failed to load imports");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchImports();
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
          <h1 className="text-[34px] font-semibold tracking-[-0.03em]">Import History</h1>
          <p className="text-muted-foreground">View and manage your CSV imports</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSV Imports</CardTitle>
          <CardDescription>
            Track and manage your imported transactions and balances. You can delete entire imports to rollback changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <ImportHistoryList imports={imports} onRefresh={fetchImports} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportsPage;

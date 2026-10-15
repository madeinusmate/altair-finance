"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { PayeeIconSelect } from "@/components/payees/payee-icon-select";

type PayeeRow = {
  id: string;
  name: string;
  icon?: string | null;
  transactionCount: number;
};

export const PayeesSettings = () => {
  const { getKey, usesBooksOwner } = useAuth();
  const [payees, setPayees] = useState<PayeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [iconDrafts, setIconDrafts] = useState<Record<string, string>>({});
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});

  const loadPayees = async () => {
    const key = getKey();
    if (!key && !usesBooksOwner) return;
    try {
      setIsLoading(true);
      const data = await apiClient.get<{ payees: PayeeRow[] }>("/api/payees");
      setPayees(data.payees || []);
      setDrafts(Object.fromEntries((data.payees || []).map((payee) => [payee.id, payee.name])));
      setIconDrafts(Object.fromEntries((data.payees || []).map((payee) => [payee.id, payee.icon || ""])));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load payees");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPayees();
  }, []);

  const renamePayee = async (id: string) => {
    const name = drafts[id]?.trim();
    if (!name) return;
    try {
      await apiClient.patch("/api/payees", { id, name, icon: iconDrafts[id] || null });
      toast.success("Payee renamed");
      await loadPayees();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename payee");
    }
  };

  const mergePayee = async (sourceId: string) => {
    const targetId = mergeTargets[sourceId];
    if (!targetId) return;
    try {
      await apiClient.post("/api/payees/merge", { sourceId, targetId });
      toast.success("Payees merged");
      await loadPayees();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to merge payees");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payees</CardTitle>
        <CardDescription>Rename a payee, change its icon, or merge it into another. Statement lines stay unchanged.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : payees.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payees yet.</p>
        ) : (
          <ul className="space-y-3">
            {payees.map((payee) => (
              <li key={payee.id} className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center">
                <div className="min-w-[8rem] text-sm text-muted-foreground">{payee.transactionCount}</div>
                <Input
                  value={drafts[payee.id] ?? payee.name}
                  onChange={(event) => setDrafts((current) => ({ ...current, [payee.id]: event.target.value }))}
                  aria-label={`Name for ${payee.name}`}
                />
                <div className="w-full sm:w-[220px]">
                  <PayeeIconSelect
                    id={`payee-icon-${payee.id}`}
                    value={iconDrafts[payee.id] ?? payee.icon ?? ""}
                    onChange={(value) => setIconDrafts((current) => ({ ...current, [payee.id]: value }))}
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => renamePayee(payee.id)}>
                  Rename
                </Button>
                <Select
                  value={mergeTargets[payee.id] ?? ""}
                  onValueChange={(value) => setMergeTargets((current) => ({ ...current, [payee.id]: value }))}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Merge into" />
                  </SelectTrigger>
                  <SelectContent>
                    {payees
                      .filter((candidate) => candidate.id !== payee.id)
                      .map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="secondary" disabled={!mergeTargets[payee.id]} onClick={() => mergePayee(payee.id)}>
                  Merge
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

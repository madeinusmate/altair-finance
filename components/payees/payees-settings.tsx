"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { PayeeIconSelect } from "@/components/payees/payee-icon-select";
import { PayeeImageField } from "@/components/payees/payee-image-field";
import { PayeeMark } from "@/components/payees/payee-mark";

const PAGE_SIZE = 40;

type PayeeRow = {
  id: string;
  name: string;
  icon?: string | null;
  iconImage?: string | null;
  transactionCount: number;
};

type MergePayee = {
  id: string;
  name: string;
};

type PayeePage = {
  payees: PayeeRow[];
  total: number;
  hasMore: boolean;
};

type PayeeDraft = {
  name: string;
  icon: string;
  image: string;
};

type PayeeEditorRowProps = {
  payee: PayeeRow;
  onRename: (id: string, draft: PayeeDraft) => Promise<void>;
  onMerge: (sourceId: string, targetName: string, transactionCount: number) => Promise<void>;
};

const PayeeEditorRow = memo(({ payee, onRename, onMerge }: PayeeEditorRowProps) => {
  const [name, setName] = useState(payee.name);
  const [icon, setIcon] = useState(payee.icon || "");
  const [image, setImage] = useState(payee.iconImage || "");
  const [mergeName, setMergeName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const rename = async () => {
    const next = name.trim();
    if (!next || isSaving) return;
    setIsSaving(true);
    try {
      await onRename(payee.id, { name: next, icon, image });
    } finally {
      setIsSaving(false);
    }
  };

  const merge = async () => {
    const target = mergeName.trim();
    if (!target || isSaving) return;
    setIsSaving(true);
    try {
      await onMerge(payee.id, target, payee.transactionCount);
      setMergeName("");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 border-b pb-3 [content-visibility:auto] [contain-intrinsic-size:auto_4.5rem] sm:flex-row sm:items-center">
      <div className="min-w-[8rem] text-sm text-muted-foreground">{payee.transactionCount}</div>
      <PayeeMark image={image} icon={icon} fallback={payee.name.charAt(0).toUpperCase()} className="size-8" />
      <Input value={name} onChange={(event) => setName(event.target.value)} aria-label={`Name for ${payee.name}`} disabled={isSaving} />
      <div className="w-full sm:w-[220px]">
        <PayeeIconSelect id={`payee-icon-${payee.id}`} value={icon} onChange={setIcon} disabled={isSaving} />
      </div>
      <div className="w-full sm:min-w-[240px]">
        <PayeeImageField id={`payee-image-${payee.id}`} value={image} onChange={setImage} disabled={isSaving} />
      </div>
      <Button type="button" variant="outline" onClick={() => void rename()} disabled={isSaving}>
        Rename
      </Button>
      <Input
        value={mergeName}
        onChange={(event) => setMergeName(event.target.value)}
        list="payee-merge-targets"
        placeholder="Merge into"
        aria-label={`Merge ${payee.name} into`}
        disabled={isSaving}
        className="w-full sm:w-[200px]"
      />
      <Button type="button" variant="secondary" disabled={isSaving || !mergeName.trim()} onClick={() => void merge()}>
        Merge
      </Button>
    </li>
  );
});

PayeeEditorRow.displayName = "PayeeEditorRow";

export const PayeesSettings = () => {
  const { getKey, usesBooksOwner } = useAuth();
  const [payees, setPayees] = useState<PayeeRow[]>([]);
  const [mergeTargets, setMergeTargets] = useState<MergePayee[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const generation = useRef(0);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const queryRef = useRef("");
  const mergeTargetsRef = useRef<MergePayee[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  hasMoreRef.current = hasMore;
  queryRef.current = query;
  mergeTargetsRef.current = mergeTargets;

  const fetchPage = useCallback(async (offset: number, q: string, mode: "replace" | "append") => {
    const ticket = mode === "replace" ? ++generation.current : generation.current;
    loadingRef.current = true;
    if (mode === "replace") setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (q) params.set("q", q);
      const data = await apiClient.get<PayeePage>(`/api/payees?${params}`);
      if (ticket !== generation.current) return;

      setPayees((current) => {
        if (mode === "replace") return data.payees || [];
        const seen = new Set(current.map((payee) => payee.id));
        return [...current, ...(data.payees || []).filter((payee) => !seen.has(payee.id))];
      });
      setTotal(data.total ?? 0);
      setHasMore(Boolean(data.hasMore));
      offsetRef.current = offset + (data.payees?.length ?? 0);
    } catch (error) {
      if (ticket !== generation.current) return;
      console.error(error);
      toast.error("Failed to load payees");
    } finally {
      if (ticket === generation.current) {
        loadingRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const key = getKey();
    if (!key && !usesBooksOwner) {
      setIsLoading(false);
      return;
    }
    setPayees([]);
    offsetRef.current = 0;
    void fetchPage(0, query, "replace");
  }, [query, getKey, usesBooksOwner, fetchPage]);

  useEffect(() => {
    const key = getKey();
    if (!key && !usesBooksOwner) return;
    let cancelled = false;
    void apiClient
      .get<{ payees: MergePayee[] }>("/api/payees?view=summary")
      .then((data) => {
        if (!cancelled) setMergeTargets(data.payees || []);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load payee names");
      });
    return () => {
      cancelled = true;
    };
  }, [getKey, usesBooksOwner]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;
    void fetchPage(offsetRef.current, queryRef.current, "append");
  }, [fetchPage]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || isLoading || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "240px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, payees.length, loadMore]);

  const renamePayee = useCallback(async (id: string, draft: PayeeDraft) => {
    try {
      await apiClient.patch("/api/payees", {
        id,
        name: draft.name,
        icon: draft.icon || null,
        iconImage: draft.image || null,
      });
      setPayees((current) =>
        current.map((payee) =>
          payee.id === id ? { ...payee, name: draft.name, icon: draft.icon || null, iconImage: draft.image || null } : payee
        )
      );
      setMergeTargets((current) => current.map((payee) => (payee.id === id ? { ...payee, name: draft.name } : payee)));
      toast.success("Payee renamed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename payee");
    }
  }, []);

  const mergePayee = useCallback(async (sourceId: string, targetName: string, transactionCount: number) => {
    const target = mergeTargetsRef.current.find((payee) => payee.name.toLowerCase() === targetName.toLowerCase());
    if (!target) {
      toast.error("Choose a payee from the list");
      return;
    }
    if (target.id === sourceId) {
      toast.error("Choose a different payee");
      return;
    }
    try {
      await apiClient.post("/api/payees/merge", { sourceId, targetId: target.id });
      offsetRef.current = Math.max(0, offsetRef.current - 1);
      setPayees((current) =>
        current.flatMap((payee) => {
          if (payee.id === sourceId) return [];
          if (payee.id === target.id) {
            return [{ ...payee, transactionCount: payee.transactionCount + transactionCount }];
          }
          return [payee];
        })
      );
      setMergeTargets((current) => current.filter((payee) => payee.id !== sourceId));
      setTotal((current) => Math.max(0, current - 1));
      toast.success("Payees merged");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to merge payees");
    }
  }, []);

  const countLabel = query ? `${total} matching "${query}"` : `${total} payees`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payees</CardTitle>
        <CardDescription>Rename a payee, change its icon, or merge it into another. Statement lines stay unchanged.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search payees"
          aria-label="Search payees"
        />
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : payees.length === 0 ? (
          <p className="text-sm text-muted-foreground">{query ? "No payees match that search." : "No payees yet."}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{countLabel}</p>
            <datalist id="payee-merge-targets">
              {mergeTargets.map((payee) => (
                <option key={payee.id} value={payee.name} />
              ))}
            </datalist>
            <ul className="space-y-3">
              {payees.map((payee) => (
                <PayeeEditorRow key={payee.id} payee={payee} onRename={renamePayee} onMerge={mergePayee} />
              ))}
            </ul>
            {hasMore ? (
              <div ref={sentinelRef} className="flex justify-center pt-2">
                <Button type="button" variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
};

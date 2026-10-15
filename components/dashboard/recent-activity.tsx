"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeftRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Transaction, Transfer } from "@/lib/db/schema";

interface ActivityAccount {
  id: string;
  name: string;
  currency: string;
}

interface RecentActivityProps {
  transactions: Transaction[];
  transfers: Transfer[];
  accounts: ActivityAccount[];
  isLoading?: boolean;
  embedded?: boolean;
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const iconColors = ["#af52de", "#ff9f0a", "#ff375f", "#32ade6", "#30d158", "#5e5ce6"];

const colorFor = (label: string): string => {
  const code = label.charCodeAt(0) || 0;
  return iconColors[code % iconColors.length];
};

const toTime = (value: Date | string | number): number => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export const RecentActivity = ({
  transactions,
  transfers,
  accounts,
  isLoading,
  embedded,
}: RecentActivityProps) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const items = [
    ...transactions.map((transaction) => ({
      kind: "transaction" as const,
      id: transaction.id,
      date: transaction.date,
      transaction,
    })),
    ...transfers.map((transfer) => ({
      kind: "transfer" as const,
      id: transfer.id,
      date: transfer.date,
      transfer,
    })),
  ]
    .sort((a, b) => toTime(b.date) - toTime(a.date))
    .slice(0, 8);

  const list = (
    <>
      {isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              if (item.kind === "transaction") {
                const account = accountById.get(item.transaction.accountId);
                const isCredit = item.transaction.type === "credit";
                const categoryName = item.transaction.category;
                const description = item.transaction.description?.trim();
                const title = description || categoryName;

                return (
                  <li key={`transaction-${item.id}`} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-semibold text-white"
                        style={{ backgroundColor: colorFor(title) }}
                      >
                        {title.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{title}</p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {account?.name || "Unknown"}
                          {description ? ` · ${categoryName}` : ""} · {format(new Date(item.date), "MMM d")}
                        </p>
                      </div>
                    </div>
                    <p className="shrink-0 tabular-nums text-[15px] tracking-[-0.01em]">
                      {isCredit ? "+" : "−"}
                      {formatCurrency(item.transaction.amount, account?.currency || "USD")}
                    </p>
                  </li>
                );
              }

              const fromAccount = accountById.get(item.transfer.fromAccountId);
              const toAccount = accountById.get(item.transfer.toAccountId);
              const categoryName = item.transfer.category || "Transfer";
              const description = item.transfer.description?.trim();
              const title = description || categoryName;

              return (
                <li key={`transfer-${item.id}`} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white"
                      style={{ backgroundColor: colorFor(title) }}
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{title}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {fromAccount?.name || "Unknown"} → {toAccount?.name || "Unknown"}
                        {description ? ` · ${categoryName}` : ""} · {format(new Date(item.date), "MMM d")}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 tabular-nums text-[15px] tracking-[-0.01em]">
                    {formatCurrency(item.transfer.fromAmount ?? item.transfer.amount, fromAccount?.currency || "USD")}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
    </>
  );

  if (embedded) {
    return <div className="mt-6 border-t border-border pt-4">{list}</div>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Latest transactions</h2>
        <Button variant="link" className="h-auto p-0 text-sm font-medium" asChild>
          <Link href="/transactions">See all</Link>
        </Button>
      </div>
      <Card className="border-transparent shadow-none">
        <CardContent className="px-4 py-2">{list}</CardContent>
      </Card>
    </section>
  );
};

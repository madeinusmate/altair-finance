"use client";

import type { MouseEvent } from "react";
import { author, isGitHubCreditUrl, libraryGroups, license, repository } from "@/lib/credits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const openCreditLink = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
  const openExternal = window.electron?.openExternal;
  if (!openExternal || !isGitHubCreditUrl(href)) return;
  event.preventDefault();
  void openExternal(href);
};

const CreditLink = ({ href, children }: { href: string; children: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    onClick={(event) => openCreditLink(event, href)}
    className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
  >
    {children}
  </a>
);

export const Credits = () => (
  <div className="space-y-6">
    <dl className="grid gap-y-2 text-sm sm:grid-cols-[7.5rem_1fr] sm:gap-x-4">
      <dt className="text-muted-foreground">Author</dt>
      <dd>
        <CreditLink href={author.url}>{author.name}</CreditLink>
      </dd>
      <dt className="text-muted-foreground">Repository</dt>
      <dd>
        <CreditLink href={repository.url}>{repository.name}</CreditLink>
      </dd>
      <dt className="text-muted-foreground">License</dt>
      <dd>
        <CreditLink href={license.url}>{license.name}</CreditLink>
      </dd>
    </dl>

    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">View libraries</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Libraries</DialogTitle>
          <DialogDescription>Open-source libraries Netly is built with.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(24rem,60vh)] space-y-5 overflow-y-auto pr-1">
          {libraryGroups.map((group) => (
            <section key={group.title} className="space-y-2">
              <h2 className="text-sm font-medium">{group.title}</h2>
              <ul className="divide-y divide-border border-y border-border">
                {group.libraries.map((library) => (
                  <li
                    key={library.name}
                    className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                  >
                    <CreditLink href={library.url}>{library.name}</CreditLink>
                    <span className="text-sm text-muted-foreground sm:text-right">{library.role}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  </div>
);

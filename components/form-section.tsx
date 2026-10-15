import type { ReactNode } from "react";

type FormSectionProps = {
  title: string;
  children: ReactNode;
};

export const FormSection = ({ title, children }: FormSectionProps) => (
  <section className="space-y-3">
    <h3 className="text-sm font-medium text-foreground">{title}</h3>
    <div className="space-y-3">{children}</div>
  </section>
);

export const FormRow = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
);

export const dialogFormContentClassName =
  "flex max-h-[min(90vh,44rem)] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl [&>[data-slot=dialog-close]]:top-5 [&>[data-slot=dialog-close]]:right-5";

export const dialogFormHeaderClassName = "shrink-0 border-b px-6 py-5 pr-12";

export const dialogFormBodyClassName = "min-h-0 space-y-5 overflow-y-auto px-6 py-5";

export const dialogFormFooterClassName = "shrink-0 border-t bg-background px-6 py-4";

export const dialogSelectClassName = "h-10! w-full rounded-full px-4";

export const dialogLockedClassName =
  "flex h-10 items-center rounded-full border bg-muted/50 px-4 text-sm";

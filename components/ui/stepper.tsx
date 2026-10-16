"use client";

import * as React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export interface StepperStep {
  key: string;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentStep: string;
  className?: string;
  loading?: boolean;
}

export const Stepper = ({ steps, currentStep, className, loading = false }: StepperProps) => {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === currentStep)
  );

  return (
    <nav aria-label="Progress" className={cn("w-full overflow-x-auto", className)}>
      <ol className="flex min-w-max items-center gap-2 py-2 md:min-w-0 md:gap-0">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isLoading = isCurrent && loading;

          return (
            <React.Fragment key={step.key}>
              <li className="flex shrink-0 items-center gap-2">
                <div className="flex flex-col items-center gap-1.5 px-1">
                  {isCompleted ? (
                    <CheckCircle2 className="size-6 text-primary" aria-hidden />
                  ) : isLoading ? (
                    <Spinner className="size-6 text-primary" />
                  ) : isCurrent ? (
                    <span
                      className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                  ) : (
                    <Circle className="size-6 text-muted-foreground/60" aria-hidden />
                  )}
                  <span
                    className={cn(
                      "max-w-[5.5rem] text-center text-xs leading-tight sm:max-w-none",
                      isCurrent || isLoading
                        ? "font-medium text-foreground"
                        : isCompleted
                          ? "text-primary"
                          : "text-muted-foreground"
                    )}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {step.label}
                  </span>
                </div>
              </li>
              {index < steps.length - 1 && (
                <li
                  aria-hidden
                  className={cn(
                    "hidden h-0.5 min-w-6 flex-1 sm:block",
                    index < currentIndex ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

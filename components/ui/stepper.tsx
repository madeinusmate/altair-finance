"use client";

import * as React from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export interface StepperStep {
  key: string;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentStep: string;
  className?: string;
}

export const Stepper = ({ steps, currentStep, className }: StepperProps) => {
  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className={cn("flex items-center justify-center gap-4 py-6", className)}>
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;
        const isPending = index > currentIndex;

        return (
          <React.Fragment key={step.key}>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-2">
                {isCompleted ? (
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                ) : isActive ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <Circle className="h-6 w-6 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "text-xs",
                    isActive
                      ? "font-semibold text-primary"
                      : isCompleted
                        ? "text-primary"
                        : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
            </div>
            {index < steps.length - 1 && (
              <Separator
                orientation="horizontal"
                className={cn(
                  "h-0.5 w-12",
                  isCompleted ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

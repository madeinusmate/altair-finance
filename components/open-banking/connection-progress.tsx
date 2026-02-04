"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";

type Step = "connecting" | "account-selection" | "transaction-preview" | "creating" | "completed";

interface ConnectionProgressProps {
  currentStep: Step;
}

const steps: Array<{ key: Step; label: string }> = [
  { key: "connecting", label: "Connecting" },
  { key: "account-selection", label: "Select Accounts" },
  { key: "transaction-preview", label: "Preview Transactions" },
  { key: "creating", label: "Creating Accounts" },
  { key: "completed", label: "Complete" },
];

export const ConnectionProgress = ({ currentStep }: ConnectionProgressProps) => {
  const currentIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-4 py-6">
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;
        const isPending = index > currentIndex;

        return (
          <div key={step.key} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-2">
              {isCompleted ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : isActive ? (
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <span className={`text-xs ${isActive ? "font-semibold text-blue-600" : isCompleted ? "text-green-600" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`h-0.5 w-12 ${isCompleted ? "bg-green-600" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

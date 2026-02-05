"use client";

import { Stepper, type StepperStep } from "@/components/ui/stepper";

type Step = "connecting" | "account-selection" | "transaction-preview" | "creating" | "completed";

interface ConnectionProgressProps {
  currentStep: Step;
}

const steps: StepperStep[] = [
  { key: "connecting", label: "Connecting" },
  { key: "account-selection", label: "Select Accounts" },
  { key: "transaction-preview", label: "Preview Transactions" },
  { key: "creating", label: "Creating Accounts" },
  { key: "completed", label: "Complete" },
];

export const ConnectionProgress = ({ currentStep }: ConnectionProgressProps) => {
  return <Stepper steps={steps} currentStep={currentStep} />;
};

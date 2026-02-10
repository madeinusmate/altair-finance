"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface ConnectionIndicatorProps {
  status?: "connected" | "syncing" | "error" | "disconnected";
  provider?: "finverse" | "plaid";
  errorMessage?: string;
}

const providerLabel = (provider?: "finverse" | "plaid") => {
  if (provider === "plaid") return "Plaid";
  if (provider === "finverse") return "Finverse";
  return "";
};

export const ConnectionIndicator = ({
  status,
  provider,
  errorMessage,
}: ConnectionIndicatorProps) => {
  if (!status || status === "disconnected") {
    return null;
  }

  const label = providerLabel(provider);

  if (status === "connected") {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {label ? `${label} Connected` : "Connected"}
      </Badge>
    );
  }

  if (status === "syncing") {
    return (
      <Badge variant="outline" className="gap-1 text-primary border-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        {label ? `${label} Syncing` : "Syncing"}
      </Badge>
    );
  }

  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1" title={errorMessage}>
        <AlertCircle className="h-3 w-3" />
        {label ? `${label} Error` : "Error"}
      </Badge>
    );
  }

  return null;
};

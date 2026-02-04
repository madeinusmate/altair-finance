"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface ConnectionIndicatorProps {
  status?: "connected" | "syncing" | "error" | "disconnected";
  errorMessage?: string;
}

export const ConnectionIndicator = ({ status, errorMessage }: ConnectionIndicatorProps) => {
  if (!status || status === "disconnected") {
    return null;
  }

  if (status === "connected") {
    return (
      <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </Badge>
    );
  }

  if (status === "syncing") {
    return (
      <Badge variant="outline" className="gap-1 text-blue-600 border-blue-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing
      </Badge>
    );
  }

  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1" title={errorMessage}>
        <AlertCircle className="h-3 w-3" />
        Error
      </Badge>
    );
  }

  return null;
};

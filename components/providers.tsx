"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { installApiTokenFetch } from "@/lib/install-api-token";

// Runs when the client bundle loads, before unlock/status effects call /api.
installApiTokenFetch();

export const Providers = ({ children }: { children: ReactNode }) => {
  return (
    <AuthProvider>
      {children}
      <Toaster />
    </AuthProvider>
  );
};

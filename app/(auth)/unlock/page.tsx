"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { UnlockForm } from "@/components/unlock-form";
import { Loader2 } from "lucide-react";

const UnlockPage = () => {
  const { state, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (state === "new") {
      router.push("/onboarding");
      return;
    }
    if (state === "corrupt") {
      router.push("/recovery");
      return;
    }
    if (isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router, state]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <UnlockForm />
    </div>
  );
};

export default UnlockPage;

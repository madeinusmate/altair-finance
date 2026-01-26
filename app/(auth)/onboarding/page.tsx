"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding-form";
import { useAuth } from "@/lib/auth-context";

const OnboardingPage = () => {
  const { state, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (state === "unlocked") {
      router.push("/dashboard");
      return;
    }
    if (state === "locked") {
      router.push("/unlock");
      return;
    }
    if (state === "corrupt") {
      router.push("/recovery");
    }
  }, [isLoading, router, state]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <OnboardingForm />
    </div>
  );
};

export default OnboardingPage;

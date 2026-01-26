"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

const HomePage = () => {
  const { state, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (state === "unlocked") {
        router.push("/dashboard");
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
      router.push("/unlock");
    }
  }, [isLoading, router, state]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
};

export default HomePage;

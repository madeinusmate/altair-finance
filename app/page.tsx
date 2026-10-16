"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { StartupScreen } from "@/components/startup-screen";

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

  return <StartupScreen />;
};

export default HomePage;

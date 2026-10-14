"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Loader2 } from "lucide-react";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
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
    if (!isAuthenticated) {
      router.push("/unlock");
    }
  }, [isAuthenticated, isLoading, router, state]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center px-4 md:hidden">
          <SidebarTrigger className="-ml-1" />
        </header>
        <main className="flex-1 overflow-auto px-4 py-6 md:px-10 md:py-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AppLayout;

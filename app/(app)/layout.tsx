"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AltairMark } from "@/components/altair-mark";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { StartupScreen } from "@/components/startup-screen";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { state, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const help = pathname === "/help";

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
    return <StartupScreen />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="relative flex h-12 shrink-0 items-center justify-center px-4 md:hidden">
          <SidebarTrigger className="absolute left-4 -ml-1" />
          <Link
            href="/dashboard"
            className="altair-brand flex max-w-[calc(100%-3rem)] items-center gap-2 rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AltairMark className="altair-mark-hover size-6 shrink-0" />
            <span className="truncate text-lg font-medium tracking-tight">Altair Finance</span>
          </Link>
        </header>
        <main
          className={
            help
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "min-h-0 flex-1 overflow-auto px-4 py-6 md:px-10 md:py-8"
          }
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AppLayout;

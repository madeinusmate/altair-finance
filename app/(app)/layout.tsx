"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { state, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

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

  useEffect(() => {
    const fetchUsername = async () => {
      if (isAuthenticated) {
        try {
          const data = await apiClient.get<{ username: string | null }>("/api/user/username");
          setUsername(data.username);
        } catch (error) {
          console.error("Failed to fetch username:", error);
        }
      }
    };
    void fetchUsername();
  }, [isAuthenticated]);

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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AppLayout;

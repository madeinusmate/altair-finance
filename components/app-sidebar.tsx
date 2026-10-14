"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Settings,
  LogOut,
  Target,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Accounts",
    url: "/accounts",
    icon: Wallet,
  },
  {
    title: "Transactions",
    url: "/transactions",
    icon: ArrowLeftRight,
  },
  {
    title: "Budget",
    url: "/budget",
    icon: Target,
  },
];

export const AppSidebar = () => {
  const pathname = usePathname();
  const { lock, isAuthenticated } = useAuth();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsername = async () => {
      if (!isAuthenticated) {
        return;
      }
      try {
        const data = await apiClient.get<{ username: string | null }>("/api/user/username");
        setUsername(data.username);
      } catch (error) {
        console.error("Failed to fetch username:", error);
      }
    };
    void fetchUsername();
  }, [isAuthenticated]);

  const handleLock = () => {
    lock();
    window.location.href = "/unlock";
  };

  const initial = username?.trim().charAt(0).toUpperCase() || "N";

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-4">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-white"
            style={{ background: "linear-gradient(160deg, #1227fd 0%, #6fa0ff 100%)" }}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{username || "Netly"}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url || pathname.startsWith(item.url + "/")}
                    className="h-10 rounded-full px-3"
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title === "Dashboard" ? "Home" : item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
        <Button variant="ghost" className="w-full justify-start rounded-full" asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </Button>
        <Button variant="ghost" className="w-full justify-start rounded-full" onClick={handleLock}>
          <LogOut className="h-4 w-4" />
          <span>Lock</span>
        </Button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

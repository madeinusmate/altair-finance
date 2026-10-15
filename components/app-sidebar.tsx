"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CircleHelp,
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Settings,
  LogOut,
  Target,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { PROFILE_UPDATED_EVENT, type UserProfile } from "@/lib/user-profile";
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
import { cn } from "@/lib/utils";

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
  const { lock, isAuthenticated, usesBooksOwner } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [agent, setAgent] = useState<{ enabled: boolean; stopped: boolean; running: boolean } | null>(null);

  useEffect(() => {
    const applyProfile = (profile: Pick<UserProfile, "name" | "email" | "avatar">) => {
      setUsername(profile.name || null);
      setEmail(profile.email);
      setAvatar(profile.avatar);
    };

    const fetchProfile = async () => {
      if (!isAuthenticated) {
        return;
      }
      try {
        const data = await apiClient.get<UserProfile>("/api/user/profile");
        applyProfile(data);
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      }
    };

    const handleProfileUpdated = (event: Event) => {
      const profile = (event as CustomEvent<UserProfile>).detail;
      if (profile) {
        applyProfile(profile);
      }
    };

    void fetchProfile();
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const load = async () => {
      try {
        const status = await apiClient.get<{ enabled: boolean; stopped: boolean; running: boolean }>("/api/agent/status");
        if (!cancelled) setAgent(status);
      } catch {
        if (!cancelled) setAgent({ enabled: false, stopped: false, running: false });
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);

  const handleLock = () => {
    lock();
    window.location.href = "/unlock";
  };

  const initial = username?.trim().charAt(0).toUpperCase() || "N";
  const agentConnected = agent?.running === true;

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-4">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-medium ${avatar ? "" : "avatar-mark"}`}
          >
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{username || "Netly"}</p>
            {email ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
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
        {agent ? (
          <Button variant="ghost" className="w-full justify-start rounded-full" asChild>
            <Link
              href="/settings#agent"
              aria-label={agentConnected ? "Agent connected. Open settings" : "Agent disconnected. Open settings"}
            >
              <Bot className="h-4 w-4" />
              <span>Agent</span>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    agentConnected ? "bg-connected" : "bg-disconnected",
                  )}
                />
                {agentConnected ? "Connected" : "Disconnected"}
              </span>
            </Link>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start rounded-full",
            pathname === "/help" && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
          asChild
        >
          <Link href="/help" aria-current={pathname === "/help" ? "page" : undefined}>
            <CircleHelp className="h-4 w-4" />
            <span>Help</span>
          </Link>
        </Button>
        <Button variant="ghost" className="w-full justify-start rounded-full" asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </Button>
        {usesBooksOwner && agent?.running ? null : (
          <Button variant="ghost" className="w-full justify-start rounded-full" onClick={handleLock}>
            <LogOut className="h-4 w-4" />
            <span>Lock</span>
          </Button>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

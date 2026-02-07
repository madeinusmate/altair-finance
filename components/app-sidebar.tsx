"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Settings,
  LogOut,
  DollarSign,
  Target,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

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
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export const AppSidebar = () => {
  const pathname = usePathname();
  const { lock } = useAuth();

  const handleLock = () => {
    lock();
    window.location.href = "/unlock";
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <DollarSign className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Netly</span>
            <span className="text-xs text-muted-foreground">Personal Finance Tracker</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url || pathname.startsWith(item.url + "/")}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost" className="w-full justify-start gap-2" onClick={handleLock}>
          <LogOut className="h-4 w-4" />
          <span>Lock</span>
        </Button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

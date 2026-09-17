"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FileText,
  HelpCircle,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  LogOut,
  Building2,
  Sparkles,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store/interview-store";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, setCurrentUser, users } = useStore();
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);

  const navItems = [
    {
      title: "Dashboard",
      href: "/app/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Interviews",
      href: "/app/interviews",
      icon: CalendarDays,
    },
    {
      title: "Candidates",
      href: "/app/candidates",
      icon: Users,
    },
    {
      title: "Reports",
      href: "/app/reports",
      icon: FileText,
    },
    {
      title: "Question Bank",
      href: "/app/questions",
      icon: HelpCircle,
    },
    {
      title: "Analytics",
      href: "/app/analytics",
      icon: BarChart3,
    },
    {
      title: "Settings",
      href: "/app/settings",
      icon: Settings,
    },
  ];

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-border bg-card/60 backdrop-blur-md transition-all duration-200 z-30 select-none",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Top Organization Header */}
      <div className="flex h-14 items-center justify-between px-3.5 border-b border-border">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background font-bold">
              <Shield className="h-4 w-4" />
            </div>
            <div className="flex flex-col truncate">
              <span className="font-semibold text-foreground text-xs tracking-tight">
                VeriTrust
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                Acme Systems
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background font-bold">
            <Shield className="h-4 w-4" />
          </div>
        )}

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "hidden md:flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors",
            collapsed && "mx-auto mt-1"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/app/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                collapsed && "justify-center px-1.5"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {!collapsed && <span className="truncate">{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Demo Mode Subtle Notice */}
      {!collapsed && (
        <div className="px-3 py-1.5 mx-2 mb-2 rounded border border-border/80 bg-secondary/40 text-[10px] text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" /> Demo Mode
          </span>
          <span className="font-mono text-[9px]">v2.4</span>
        </div>
      )}

      {/* User Profile & Persona Switcher */}
      <div className="border-t border-border p-2">
        <div className="relative">
          <button
            onClick={() => setShowPersonaMenu(!showPersonaMenu)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-secondary/70 transition-colors",
              collapsed && "justify-center p-1"
            )}
          >
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="truncate text-xs font-medium text-foreground">
                    {currentUser.name.split(" ")[0]}
                  </p>
                  <Badge variant="outline" size="sm" className="text-[9px] px-1 py-0">
                    {currentUser.role}
                  </Badge>
                </div>
              </div>
            )}
          </button>

          {/* Persona quick menu */}
          {showPersonaMenu && (
            <div className="absolute bottom-12 left-0 w-56 rounded-md border border-border bg-popover p-1 shadow-lg z-50 animate-in fade-in-50 zoom-in-95">
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Switch Role / Persona
              </div>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setCurrentUser(u);
                    setShowPersonaMenu(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors hover:bg-secondary",
                    currentUser.id === u.id && "bg-secondary font-medium"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={u.avatar} alt={u.name} className="h-5 w-5 rounded-full object-cover" />
                    <span className="truncate text-foreground">{u.name.split(" ")[0]}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{u.role}</span>
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-rose-500 hover:bg-rose-500/10 transition-colors"
              >
                <LogOut className="h-3 w-3" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Sun,
  Moon,
  Laptop,
  Bell,
  Search,
  Plus,
  Command,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store/interview-store";
import { ScheduleModal } from "@/components/interviews/schedule-modal";

export function Header() {
  const { theme, setTheme } = useTheme();
  const { currentUser } = useStore();
  const [mounted, setMounted] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // next-themes reads localStorage in useState on the client, so `theme` is
  // undefined on the server and populated on the first client render.
  // Only render the theme icon after mount so SSR and hydration match.
  useEffect(() => {
    setMounted(true);
  }, []);

  const notifications = [
    {
      id: "n-1",
      title: "Integrity Report Generated",
      time: "2 mins ago",
      desc: "Report for Alexei Petrov is ready for review.",
    },
    {
      id: "n-2",
      title: "Active Live Session",
      time: "15 mins ago",
      desc: "Maya Chen joined room #8F7K2M.",
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 w-full items-center justify-between border-b border-border bg-card/60 px-4 sm:px-6 backdrop-blur-md">
        {/* Left: Clean Search Input */}
        <div className="flex items-center gap-2 w-64 sm:w-80">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search or jump to..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-background/50 pl-8 pr-8 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none transition-colors"
            />
            <kbd className="pointer-events-none absolute right-2 top-2 hidden h-4 select-none items-center rounded border border-border bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground sm:flex">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Active Role Tag */}
          <span className="hidden sm:inline-flex text-[11px] text-muted-foreground border-r border-border pr-2.5">
            Role: <strong className="text-foreground ml-1">{currentUser.role}</strong>
          </span>

          {/* Quick Schedule Button */}
          <Button
            size="sm"
            onClick={() => setScheduleModalOpen(true)}
            disabled={currentUser.role === "Viewer"}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Schedule</span>
          </Button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Notifications"
            >
              <Bell className="h-3.5 w-3.5" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-foreground" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-9 w-72 rounded-md border border-border bg-popover p-2 shadow-lg z-50 animate-in fade-in-50 zoom-in-95">
                <div className="flex items-center justify-between pb-1.5 border-b border-border px-1">
                  <span className="text-xs font-semibold text-foreground">Notifications</span>
                  <span className="text-[10px] text-muted-foreground cursor-pointer hover:underline">
                    Mark read
                  </span>
                </div>
                <div className="divide-y divide-border/60">
                  {notifications.map((n) => (
                    <div key={n.id} className="py-2 px-1 text-xs text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground text-[11px]">{n.title}</span>
                        <span className="text-[10px] text-muted-foreground">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{n.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Toggle theme"
            >
              {!mounted ? (
                <span className="h-3.5 w-3.5" aria-hidden />
              ) : theme === "light" ? (
                <Sun className="h-3.5 w-3.5" />
              ) : theme === "dark" ? (
                <Moon className="h-3.5 w-3.5" />
              ) : (
                <Laptop className="h-3.5 w-3.5" />
              )}
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 top-9 w-28 rounded-md border border-border bg-popover p-1 shadow-lg z-50 animate-in fade-in-50 zoom-in-95">
                <button
                  onClick={() => {
                    setTheme("light");
                    setShowThemeMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-foreground hover:bg-secondary"
                >
                  <Sun className="h-3 w-3" /> Light
                </button>
                <button
                  onClick={() => {
                    setTheme("dark");
                    setShowThemeMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-foreground hover:bg-secondary"
                >
                  <Moon className="h-3 w-3" /> Dark
                </button>
                <button
                  onClick={() => {
                    setTheme("system");
                    setShowThemeMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-foreground hover:bg-secondary"
                >
                  <Laptop className="h-3 w-3" /> System
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <ScheduleModal open={scheduleModalOpen} onOpenChange={setScheduleModalOpen} />
    </>
  );
}

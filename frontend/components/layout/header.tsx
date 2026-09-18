"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  Sun,
  Moon,
  Laptop,
  Bell,
  Search,
  Plus,
  Menu,
  Shield,
  UserCheck,
  ChevronDown,
  LogOut,
  Check,
} from "lucide-react";
import { useStore } from "@/lib/store/interview-store";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import { cn } from "@/lib/utils";

interface HeaderProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function Header({ collapsed, setCollapsed }: HeaderProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { currentUser, setCurrentUser, users } = useStore();
  const [mounted, setMounted] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

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
      <header className="sticky top-0 z-40 flex h-16 w-full shrink-0 items-center justify-between border-b border-stone-200/80 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#181510] px-4 sm:px-6">
        {/* Left: Hamburger + Logo + Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-1.5 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-sm">
              <Shield className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-bold text-stone-900 dark:text-stone-100 text-base leading-none tracking-tight">
                VeriTrust
              </span>
              <span className="text-[11px] text-stone-400 dark:text-stone-500 font-sans mt-0.5 leading-none">
                Acme Systems
              </span>
            </div>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 max-w-md mx-6 hidden md:block">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search candidates, interviews, questions, reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/70 dark:bg-stone-900/60 pl-9 pr-14 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 select-none items-center gap-1 rounded border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 px-1.5 font-mono text-[10px] text-stone-500">
              ⌘ K
            </kbd>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Role Pill Switcher */}
          <div className="relative hidden lg:block">
            <button
              onClick={() => {
                setShowRoleMenu(!showRoleMenu);
                setShowUserMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white/60 dark:bg-stone-900/60 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
            >
              <UserCheck className="h-3.5 w-3.5 text-stone-500" />
              <span>
                Role: <strong className="font-semibold text-stone-900 dark:text-stone-100">{currentUser.role}</strong>
              </span>
              <ChevronDown className="h-3 w-3 text-stone-400 ml-0.5" />
            </button>

            {showRoleMenu && (
              <div className="absolute right-0 top-10 w-52 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2 shadow-xl z-50 animate-in fade-in-50 zoom-in-95">
                <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                  Switch Active Role
                </div>
                <div className="space-y-0.5 mt-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setCurrentUser(u);
                        setShowRoleMenu(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-stone-100 dark:hover:bg-stone-800",
                        currentUser.id === u.id && "bg-stone-100 dark:bg-stone-800/80 font-medium text-stone-900 dark:text-stone-100"
                      )}
                    >
                      <span className="truncate">{u.role} ({u.name.split(" ")[0]})</span>
                      {currentUser.id === u.id && <Check className="h-3.5 w-3.5 text-stone-700 dark:text-stone-300" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* + Schedule Button */}
          <button
            onClick={() => setScheduleModalOpen(true)}
            disabled={currentUser.role === "Viewer"}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Schedule</span>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowRoleMenu(false);
                setShowUserMenu(false);
              }}
              className="relative p-2 rounded-xl text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#FAF9F6] dark:ring-[#181510]" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-10 w-72 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2.5 shadow-xl z-50 animate-in fade-in-50 zoom-in-95">
                <div className="flex items-center justify-between pb-1.5 border-b border-stone-100 dark:border-stone-800 px-1">
                  <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">Notifications</span>
                  <span className="text-[10px] text-stone-500 cursor-pointer hover:underline">
                    Mark read
                  </span>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {notifications.map((n) => (
                    <div key={n.id} className="py-2 px-1 text-xs text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-stone-900 dark:text-stone-100 text-[11px]">{n.title}</span>
                        <span className="text-[10px] text-stone-400">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-stone-500 mt-0.5">{n.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-xl text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors"
            title="Toggle light / dark theme"
          >
            {!mounted ? (
              <span className="h-4 w-4" aria-hidden />
            ) : theme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </button>

          {/* User Profile Avatar with Online Dot & Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowRoleMenu(false);
              }}
              className="flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-xl hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <div className="relative">
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-stone-200 dark:ring-stone-700"
                />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#10B981] ring-2 ring-[#FAF9F6] dark:ring-[#181510]" />
              </div>
              <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 hidden sm:inline">
                {currentUser.name.split(" ")[0]}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-11 w-56 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2 shadow-xl z-50 animate-in fade-in-50 zoom-in-95">
                <div className="px-2 py-1.5 border-b border-stone-100 dark:border-stone-800 mb-1">
                  <div className="font-semibold text-xs text-stone-900 dark:text-stone-100">{currentUser.name}</div>
                  <div className="text-[11px] text-stone-400">{currentUser.email}</div>
                </div>

                <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                  Switch Persona
                </div>
                <div className="space-y-0.5 mt-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setCurrentUser(u);
                        setShowUserMenu(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-stone-100 dark:hover:bg-stone-800",
                        currentUser.id === u.id && "bg-stone-100 dark:bg-stone-800/80 font-medium text-stone-900 dark:text-stone-100"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={u.avatar} alt={u.name} className="h-5 w-5 rounded-full object-cover shrink-0" />
                        <span className="truncate text-stone-800 dark:text-stone-200">{u.name.split(" ")[0]}</span>
                      </div>
                      <span className="text-[10px] text-stone-400">{u.role}</span>
                    </button>
                  ))}
                </div>

                <div className="my-1.5 border-t border-stone-100 dark:border-stone-800" />

                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
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


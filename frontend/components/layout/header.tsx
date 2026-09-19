"use client";

import { Logo } from "@/components/ui/logo";
import React, { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sun,
  Moon,
  Bell,
  Plus,
  Menu,
  UserCheck,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useAuth, useCurrentUser } from "@/lib/auth/auth-context";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/components/auth/role-guard";
import { GlobalSearch } from "@/components/layout/global-search";
import { useOverview } from "@/lib/api/use-overview";
import { timeAgo } from "@/lib/api/overview";
import { sessionCandidateName, sessionRole } from "@/lib/api/sessions";
import { ScheduleModal } from "@/components/interviews/schedule-modal";

const subscribeNever = () => () => {};

interface HeaderProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function Header({ collapsed, setCollapsed }: HeaderProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const currentUser = useCurrentUser();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const pathname = usePathname();
  const { canCreateInterview } = usePermissions();
  const { data: overview } = useOverview(pathname);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {
      toast({ title: "Sign out failed", description: "The server could not be reached; your local session was cleared.", type: "error" });
    }
    router.replace("/login");
  };

  // No notification service exists, so this is a live view of what the org's data says right now:
  // sessions in progress and the newest reports. There is no read/unread state to fake.
  const liveSessions = overview?.sessions.filter((s) => s.status === "LIVE") ?? [];
  const activity = overview
    ? [
        ...liveSessions.map((s) => ({
          id: `live-${s.id}`,
          title: "Session in progress",
          desc: `${sessionCandidateName(s)}: ${sessionRole(s)}`,
          time: s.startedAt ? timeAgo(s.startedAt) : "now",
          at: Number.MAX_SAFE_INTEGER, // in-progress sessions sort above reports
          href: `/app/interviews/${s.id}/live`,
        })),
        ...overview.reports.slice(0, 4).map((r) => ({
          id: `report-${r.id}`,
          title: "Report ready",
          desc: `${r.session.candidate ? r.session.candidate.name?.trim() || r.session.candidate.email : "No candidate"}: ${r.session.title?.trim() || "Untitled interview"}`,
          time: timeAgo(r.createdAt),
          at: new Date(r.createdAt).getTime(),
          href: `/app/reports/${r.id}`,
        })),
      ].sort((x, y) => y.at - x.at)
    : [];

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
            <Logo size="md" />
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 max-w-md mx-6 hidden md:block">
          <GlobalSearch sessions={overview?.sessions ?? []} />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Role (read-only; roles are managed per organisation member) */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white/60 dark:bg-stone-900/60 text-xs font-medium text-stone-700 dark:text-stone-300">
            <UserCheck className="h-3.5 w-3.5 text-stone-500" />
            <span>
              Role: <strong className="font-semibold text-stone-900 dark:text-stone-100">{currentUser.role}</strong>
            </span>
          </div>

          {/* + Schedule Button */}
          <button
            onClick={() => setScheduleModalOpen(true)}
            disabled={!canCreateInterview}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Schedule</span>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowUserMenu(false);
              }}
              className="relative p-2 rounded-xl text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors"
              title="Recent activity" aria-label="Recent activity"
            >
              <Bell className="h-4 w-4" />
              {liveSessions.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[#FAF9F6] dark:ring-[#181510]" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-10 w-72 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2.5 shadow-xl z-50 animate-in fade-in-50 zoom-in-95">
                <div className="pb-1.5 border-b border-stone-100 dark:border-stone-800 px-1">
                  <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">Recent activity</span>
                </div>
                {activity.length === 0 ? (
                  <p className="py-3 px-1 text-[11px] text-stone-500">Nothing yet. Live sessions and new reports appear here.</p>
                ) : (
                  <div className="divide-y divide-stone-100 dark:divide-stone-800">
                    {activity.map((n) => (
                      <Link key={n.id} href={n.href} onClick={() => setShowNotifications(false)} className="block py-2 px-1 text-xs text-left hover:bg-stone-50 dark:hover:bg-stone-800/50 rounded">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-stone-900 dark:text-stone-100 text-[11px]">{n.title}</span>
                          <span className="text-[10px] text-stone-400 shrink-0">{n.time}</span>
                        </div>
                        <p className="text-[11px] text-stone-500 mt-0.5 truncate">{n.desc}</p>
                      </Link>
                    ))}
                  </div>
                )}
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
                  <div className="text-[10px] text-stone-400 mt-0.5">{currentUser.title}</div>
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


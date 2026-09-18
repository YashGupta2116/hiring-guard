"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MeetingLayout } from "@/components/layout/meeting-layout";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const pathname = usePathname();
  const isMeetingRoute = /^\/app\/interviews\/[^/]+\/live\/?$/.test(pathname);

  useEffect(() => {
    const removeHydrationArtifacts = () => {
      document.querySelectorAll("[bis_skin_checked]").forEach((node) => {
        node.removeAttribute("bis_skin_checked");
      });
    };

    removeHydrationArtifacts();

    const observer = new MutationObserver(() => {
      removeHydrationArtifacts();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["bis_skin_checked"],
    });

    return () => observer.disconnect();
  }, []);

  if (isMeetingRoute) {
    return <MeetingLayout>{children}</MeetingLayout>;
  }

  return (
    <div
      suppressHydrationWarning
      className="flex h-screen flex-col overflow-hidden bg-[#FAF9F6] dark:bg-background text-foreground antialiased"
    >
      {/* Full-width Top Global Header */}
      <Header collapsed={collapsed} setCollapsed={setCollapsed} />

      {/* Main Container: Sidebar + Content */}
      <div suppressHydrationWarning className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

        <main
          suppressHydrationWarning
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-8 max-w-[1600px] w-full mx-auto animate-fade-in-up"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

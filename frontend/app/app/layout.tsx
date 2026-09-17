"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#FAF9F6] dark:bg-background text-foreground antialiased">
      {/* Full-width Top Global Header */}
      <Header collapsed={collapsed} setCollapsed={setCollapsed} />

      {/* Main Container: Sidebar + Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-8 max-w-[1600px] w-full mx-auto animate-fade-in-up">
          {children}
        </main>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useSidebar } from "@/components/providers/SidebarProvider";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased">
      {/* Sidebar component (fixed on desktop with variable width, drawer on mobile) */}
      <Sidebar />

      {/* Main content area dynamically shifted right on desktop for sidebar */}
      <div
        className={`flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300 ease-in-out ${
          isCollapsed ? "lg:pl-20" : "lg:pl-64"
        }`}
      >
        {/* Top Header */}
        <Header />

        {/* Page Content */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 w-full max-w-[1850px] mx-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}


"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Zap,
  Search,
  ChevronRight,
  Code2,
  Sparkles,
  Puzzle,
  Laptop,
  Users,
  Bot,
  AlertTriangle,
} from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { APP_ROUTES } from "@/constants/routes.config";
import {
  QuickstartSection,
  ExtensionSection,
  ClientAgentSection,
  AccountsSection,
  GpmSection,
  TroubleshootingSection,
} from "./_components";

type DocSectionId =
  | "quickstart"
  | "extension"
  | "client_agent"
  | "accounts"
  | "gpm"
  | "troubleshooting";

interface DocNavSection {
  id: DocSectionId;
  title: string;
  icon: any;
  desc: string;
}

const DOC_SECTIONS: DocNavSection[] = [
  { id: "quickstart", title: "Bắt Đầu Nhanh", icon: Sparkles, desc: "Tải công cụ & chọn cách đồng bộ" },
  { id: "client_agent", title: "Client Agent Tự Động", icon: Laptop, desc: "Cách cài, chạy ngầm, đổi Token & gỡ bỏ" },
  { id: "extension", title: "TikTokFlow Extension", icon: Puzzle, desc: "Cách cài đặt, sử dụng & gỡ bỏ tiện ích" },
  { id: "accounts", title: "Quản Trị Dàn Account", icon: Users, desc: "Vòng đời kênh, gán nhân sự & trạng thái" },
  { id: "gpm", title: "GPMLogin Fleet Hub", icon: Bot, desc: "Tự động nhận diện API (Quản Trị Viên)" },
  { id: "troubleshooting", title: "Xử Lý Sự Cố & FAQ", icon: AlertTriangle, desc: "Khắc phục các vấn đề thường gặp" },
];

export default function DocsPage() {
  const { data: session } = useSession();
  const [activeSection, setActiveSection] = useState<DocSectionId>("quickstart");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    toast.success("Đã sao chép mã vào bộ nhớ tạm!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredSections = DOC_SECTIONS.filter(
    (sec) =>
      sec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sec.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-pink-500 selection:text-white font-sans antialiased transition-colors duration-200">
      {/* Top Navbar */}
      <PublicHeader badge="Docs & Guide" />

      {/* Main Docs Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mobile Section Quick Switcher Tabs (lg:hidden) */}
        <div className="lg:hidden mb-6 -mx-4 px-4 sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-2">
            {DOC_SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isActive
                      ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-600/20"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{sec.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          {/* Left Sidebar Navigation (Desktop) */}
          <aside className="hidden lg:block lg:col-span-1 space-y-4 lg:sticky lg:top-24">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm tài liệu..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-pink-500 shadow-xs"
              />
            </div>

            {/* Menu Sections List */}
            <nav className="space-y-1 bg-white dark:bg-slate-900/60 p-2 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
              {filteredSections.map((sec) => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all cursor-pointer ${
                      isActive
                        ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white font-bold shadow-md shadow-pink-600/20"
                        : "text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate font-semibold">{sec.title}</div>
                      <div className={`text-xs truncate ${isActive ? "text-pink-100" : "text-slate-500 dark:text-slate-400"}`}>
                        {sec.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Quick Links Card */}
            <div className="p-4 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-2.5 shadow-xs">
              <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Dành Cho Kỹ Thuật Viên</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Muốn tích hợp RESTful API hoặc tạo webhook tự động?
              </p>
              <Link
                href="/api-docs"
                className="inline-flex items-center gap-1 text-sm font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
              >
                <span>Xem API Reference</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </aside>

          {/* Right Main Content Panel */}
          <main className="lg:col-span-3 bg-white dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800/80 rounded-3xl p-6 sm:p-10 shadow-md space-y-8 min-h-[700px] transition-colors">
            {activeSection === "quickstart" && (
              <QuickstartSection onNavigateSection={(sec) => setActiveSection(sec)} />
            )}
            {activeSection === "extension" && <ExtensionSection />}
            {activeSection === "client_agent" && <ClientAgentSection />}
            {activeSection === "accounts" && <AccountsSection />}
            {activeSection === "gpm" && (
              <GpmSection copiedCode={copiedCode} onCopy={handleCopy} />
            )}
            {activeSection === "troubleshooting" && <TroubleshootingSection />}
          </main>
        </div>
      </div>

      {/* Shared Public Footer */}
      <PublicFooter />
    </div>
  );
}

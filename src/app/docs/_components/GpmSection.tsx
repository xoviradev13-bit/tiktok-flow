"use client";

import React from "react";
import { Info, Check, Copy } from "lucide-react";

interface GpmSectionProps {
  copiedCode: string | null;
  onCopy: (text: string, id: string) => void;
}

export function GpmSection({ copiedCode, onCopy }: GpmSectionProps) {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-4">
        <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 font-mono uppercase">
          Quản Trị Viên
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
          GPMLogin Fleet & Kết Nối Local API (Port 9495)
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
          Cấu hình kết nối trực tiếp dành cho Quản Trị Viên quản lý cụm máy chủ trung tâm.
        </p>
      </div>

      {/* Important notice for staff */}
      <div className="p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-3.5">
        <Info className="w-5 h-5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="leading-relaxed">
          <strong className="text-amber-900 dark:text-amber-200">Lưu ý cho nhân sự vận hành:</strong> Mục cấu hình này chỉ dành riêng cho <strong>Quản Trị Viên (Admin)</strong> khi thiết lập server trung tâm. Nhân viên máy trạm chỉ cần cài <strong>Extension</strong> hoặc chạy <strong>Client Agent</strong>, không cần cấu hình cổng 9495 này.
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
          1. Cấu Hình Cổng API GPMLogin
        </h3>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          Mở phần mềm GPMLogin trên máy chủ. Vào mục <strong>Settings ➔ API Setting</strong> và đảm bảo cổng API là <code className="font-mono text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-xs font-bold">9495</code> (mặc định) và trạng thái là <strong>Enable</strong>.
        </p>

        <div className="p-4 rounded-2xl bg-slate-900 font-mono text-xs sm:text-sm text-slate-200 border border-slate-800 flex items-center justify-between">
          <code>http://127.0.0.1:9495/api/v3/profiles</code>
          <button
            onClick={() => onCopy("http://127.0.0.1:9495/api/v3/profiles", "gpm_api")}
            className="text-slate-400 hover:text-white cursor-pointer px-2 py-1"
          >
            {copiedCode === "gpm_api" ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
          2. Thao Tác 1-Click Scan Profile Trên Server
        </h3>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          Khi Admin nhấp nút <strong>1-Click Scan Profile</strong> trên giao diện web máy chủ, hệ thống sẽ gửi yêu cầu quét toàn bộ profile hiện có trong GPMLogin và tự động map UUID tương ứng với các username TikTok trong hệ thống.
        </p>
      </div>
    </div>
  );
}

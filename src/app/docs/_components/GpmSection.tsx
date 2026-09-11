"use client";

import React from "react";
import { Info, Check, Copy, Radio, CheckCircle2, Sliders } from "lucide-react";

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
          GPMLogin Fleet & Tự Động Nhận Diện Local API
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
          Cơ chế kết nối và điều khiển tự động dành cho Quản Trị Viên trên máy chủ / máy vận hành trung tâm.
        </p>
      </div>

      {/* Important notice for staff */}
      <div className="p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-3.5">
        <Info className="w-5 h-5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="leading-relaxed">
          <strong className="text-amber-900 dark:text-amber-200">Lưu ý cho nhân sự vận hành:</strong> Mục cấu hình này chỉ dành riêng cho <strong>Quản Trị Viên (Admin)</strong> khi thiết lập server trung tâm. Nhân viên máy trạm chỉ cần cài <strong>Extension</strong> hoặc chạy <strong>Client Agent</strong>, hệ thống tự xử lý ngầm mà không cần cấu hình thủ công cổng API.
        </div>
      </div>

      {/* Section 1: Auto-Detect Port Mechanism */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            1. Cơ Chế Nhận Diện Cổng API Tự Động (Auto-Detect Live Port)
          </h3>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          Hệ thống <strong>không cố định cứng duy nhất một cổng 9495</strong> mà được trang bị bộ nhận diện thông minh đa tầng:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs sm:text-sm">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-xs">
            <div className="font-bold text-cyan-700 dark:text-cyan-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              <span>Đọc File Cấu Hình Trực Tiếp</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Tự động nhận diện chính xác cổng API tuỳ biến mà bạn đã cấu hình trong phần mềm GPMLogin.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-xs">
            <div className="font-bold text-pink-700 dark:text-pink-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-pink-500" />
              <span>Tự Động Dò Quét Đa Cổng (Probe Candidates)</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Nếu không đọc được file, hệ thống sẽ tự động quét nhanh các cổng phổ biến: <code className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400">9495</code>, <code className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400">19995</code>, <code className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400">19996</code>, <code className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400">19994</code>, <code className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400">8848</code> trên cả hai chuẩn API (<code className="font-mono text-xs">/v1</code> & <code className="font-mono text-xs">/v3</code>).
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-sm space-y-2">
          <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-slate-500" />
            <span>Thao tác chuẩn bị trên GPMLogin:</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Mở phần mềm GPMLogin trên máy chủ ➔ vào mục <strong>Settings ➔ API Setting</strong> và đảm bảo trạng thái là <strong>Enable</strong> (cổng API có thể để mặc định <code className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded">9495</code>, <code className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded">19995</code> hoặc bất kỳ số cổng nào bạn muốn). Khi kết nối thành công, giao diện sẽ tự động báo <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">GPM Online (Port: XXXX)</span> tương ứng.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            URL endpoint kiểm tra nhanh kết nối cục bộ (thay <code className="font-mono font-bold">:port</code> bằng cổng bạn đang bật):
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 font-mono text-xs sm:text-sm text-slate-200 border border-slate-800 flex items-center justify-between">
            <code>http://127.0.0.1:9495/api/v3/profiles</code>
            <button
              onClick={() => onCopy("http://127.0.0.1:9495/api/v3/profiles", "gpm_api")}
              className="text-slate-400 hover:text-white cursor-pointer px-2 py-1"
              title="Sao chép URL mẫu"
            >
              {copiedCode === "gpm_api" ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: 1-Click Scan */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            2. Thao Tác 1-Click Scan Profile Trên Server
          </h3>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          Khi Admin nhấp nút <strong>1-Click Scan Profile</strong> trên giao diện web máy chủ, hệ thống sẽ gửi yêu cầu qua cổng API đang kết nối để quét toàn bộ profile hiện có trong GPMLogin và tự động map UUID tương ứng với các username TikTok trong hệ thống.
        </p>
      </div>
    </div>
  );
}

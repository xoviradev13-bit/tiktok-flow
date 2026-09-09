"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

export function TroubleshootingSection() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-4">
        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono uppercase">
          FAQ & Sửa Lỗi
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
          Xử Lý Sự Cố Thường Gặp (Troubleshooting)
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
          Hướng dẫn xử lý các vấn đề phổ biến nhất trong quá trình vận hành dàn máy.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Lỗi: Extension báo &quot;Chưa xác thực&quot; hoặc không gửi được số liệu</span>
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <strong className="text-slate-800 dark:text-slate-200">Khắc phục:</strong> Kiểm tra xem bạn có bấm cấp lại Token mới gần đây không. Khi Token đổi mới, token cũ bị vô hiệu hóa. Bạn chỉ cần tải lại bộ Extension và Client Agent mới từ trang web (đã tự động nhúng Token mới), gỡ tiện ích cũ và nạp lại vào GPMLogin.
          </p>
        </div>

        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Client Agent báo &quot;Authentication Failed / 401&quot;</span>
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <strong className="text-slate-800 dark:text-slate-200">Khắc phục:</strong> Do Personal Token trên máy trạm đã cũ hoặc bị vô hiệu hóa sau khi cấp mới trên web. Chỉ cần tải lại file <code className="text-cyan-600 dark:text-cyan-400 font-mono text-xs font-bold">client-agent.zip</code> mới từ trang web (hệ thống đã tự điền sẵn Token mới), giải nén và nhấp đúp file <code className="font-mono text-slate-800 dark:text-slate-200 text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">setup-agent.bat</code> là hoạt động bình thường ngay lập tức.
          </p>
        </div>

        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Lỗi: Không kết nối được GPMLogin (Port 9495 trên Server)</span>
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <strong className="text-slate-800 dark:text-slate-200">Khắc phục:</strong> Chỉ áp dụng cho Admin máy chủ: Kiểm tra phần mềm GPMLogin có đang bật không, tường lửa Windows có chặn port 9495 không. Hãy thử mở <code className="text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 font-mono text-xs">http://127.0.0.1:9495/api/v3/profiles</code> trên trình duyệt server để kiểm tra.
          </p>
        </div>
      </div>
    </div>
  );
}

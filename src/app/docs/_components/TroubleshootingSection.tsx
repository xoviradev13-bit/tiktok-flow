"use client";

import React from "react";
import Link from "next/link";
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
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Extension không kích hoạt / báo thiếu Agent hoặc không kết nối được</span>
          </h3>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Nguyên nhân:</strong> Client Agent chưa chạy trên máy, hoặc chưa cài xong bước{" "}
              <code className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">setup-agent.bat</code> phím <strong>1</strong>.
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Cách khắc phục:</strong> Chạy lại{" "}
              <code className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">setup-agent.bat</code> ➔ phím <strong>1</strong>{" "}
              (Cho phép UAC nếu được hỏi) ➔ mở lại profile GPMLogin. Extension chỉ kích hoạt được khi Agent đang chạy trên cùng máy.
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Lỗi: Extension báo &quot;Chưa xác thực&quot; hoặc không gửi được số liệu</span>
          </h3>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Nguyên nhân:</strong> Do Token trên trình duyệt đã cũ, bị thu hồi hoặc bạn vừa bấm cấp lại Token mới trong Cài Đặt.
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Cách khắc phục (chọn 1 trong 2 cách):</strong>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs sm:text-sm">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-xs">
                <span className="font-bold text-pink-600 dark:text-pink-400 block">Cách 1 (Khuyên dùng):</span>
                <span>Tải lại file <code className="font-mono text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-bold">extension.zip</code> mới từ trang <Link href="/extensions" className="font-bold text-pink-600 dark:text-pink-400 hover:underline">Kho Tiện Ích (/extensions)</Link> (hệ thống đã tích hợp sẵn cơ chế xác thực và trao đổi Token tự động) và nạp lại vào GPMLogin.</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-xs">
                <span className="font-bold text-cyan-600 dark:text-cyan-400 block">Cách 2 (Nhập thủ công):</span>
                <span>Vào <strong>Cài Đặt ➔ Personal Token</strong> sao chép mã mới ➔ Mở popup Extension trên trình duyệt ➔ Dán vào ô <strong>Personal Token</strong> và bấm <strong>Lưu</strong>.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Client Agent báo &quot;Authentication Failed / 401&quot;</span>
          </h3>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Nguyên nhân:</strong> Do Personal Token lưu trên máy trạm đã cũ hoặc bị vô hiệu hóa sau khi cấp mới trên web.
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Cách khắc phục (chọn 1 trong 2 cách):</strong>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs sm:text-sm">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-xs">
                <span className="font-bold text-cyan-600 dark:text-cyan-400 block">Cách 1 (Khuyên dùng):</span>
                <span>Tải lại file <code className="text-cyan-600 dark:text-cyan-400 font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">client-agent.zip</code> mới từ trang <Link href="/extensions" className="font-bold text-cyan-600 dark:text-cyan-400 hover:underline">Kho Tiện Ích (/extensions)</Link> (hệ thống đã tích hợp sẵn cơ chế xác thực và trao đổi Token tự động), giải nén và nhấp đúp file <code className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">setup-agent.bat</code>.</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-xs">
                <span className="font-bold text-amber-600 dark:text-amber-400 block">Cách 2 (Nhập thủ công):</span>
                <span>Vào <strong>Cài Đặt ➔ Personal Token</strong> sao chép mã mới ➔ Nhấp đúp file <code className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">setup-agent.bat</code> ➔ Nhấn phím <strong className="font-bold text-amber-600 dark:text-amber-400">3</strong> để dán mã Token mới.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Lỗi: GPMLogin báo Offline / Không nhận diện được cổng API</span>
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <strong className="text-slate-800 dark:text-slate-200">Khắc phục:</strong> Chỉ áp dụng cho Admin máy chủ: Hệ thống đã tích hợp cơ chế tự động nhận diện cổng API của GPMLogin. Hãy kiểm tra xem phần mềm GPMLogin đã mở chưa và mục <strong>Settings ➔ API Setting</strong> trong GPMLogin đã được <strong>Enable</strong> chưa. Ngoài ra kiểm tra tường lửa Windows có chặn kết nối local hay không. Bạn có thể kiểm tra trực tiếp trên trình duyệt máy chủ bằng cách truy cập <code className="text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 font-mono text-xs">http://127.0.0.1:9495/api/v3/profiles</code> (hoặc cổng mà GPMLogin đang hiển thị).
          </p>
        </div>
      </div>
    </div>
  );
}

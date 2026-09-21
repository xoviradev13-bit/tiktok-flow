"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  HardDrive,
  Download,
  Terminal,
  Play,
  RefreshCw,
  Trash2,
  Lock,
  Key,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { APP_ROUTES } from "@/constants/routes.config";
import { ImageLightbox, ZoomableImage } from "./ImageLightbox";
import { downloadPackage } from "@/lib/download-package";

export function ClientAgentSection() {
  const { data: session } = useSession();
  const [zoomImage, setZoomImage] = useState<{ src: string; alt?: string } | null>(null);
  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-5">
        <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 font-mono uppercase tracking-wider">
          Máy Trạm Tự Động Hóa
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
          Hướng Dẫn Cài Đặt, Chạy Ngầm, Đổi Token & Gỡ Bỏ Client Agent
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
          Ứng dụng chạy ngầm trên máy tính, tự động đồng bộ số liệu TikTok Studio định kỳ mà không cần mở trình duyệt.
        </p>
      </div>

      {/* Download banner */}
      <div className="p-6 rounded-3xl bg-cyan-50/70 dark:bg-gradient-to-r dark:from-cyan-950/40 dark:via-indigo-950/40 dark:to-slate-950 border border-cyan-200 dark:border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">
            <HardDrive className="w-4 h-4" />
            <span>Zero-Dependency Windows Portable</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            TikTokFlow Client Agent
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl">
            Đã bao gồm sẵn mọi thành phần chạy ngầm dạng Portable. Bạn <strong>KHÔNG CẦN</strong> cài thêm bất kỳ phần mềm nào trên máy.
          </p>
        </div>

        {session ? (
          <button
            type="button"
            onClick={() => downloadPackage("/api/client-agent/download", "TikTokFlow-ClientAgent.zip")}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 shrink-0 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Tải Client Agent (.zip)</span>
          </button>
        ) : (
          <Link
            href={APP_ROUTES.SIGNIN}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold bg-slate-200/80 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-400 border border-slate-300 dark:border-slate-700 shrink-0 transition-all cursor-pointer"
          >
            <Lock className="w-4 h-4 text-cyan-500" />
            <span>Đăng Nhập Để Tải (.zip)</span>
          </Link>
        )}
      </div>
      {/* Visual Folder & Terminal Mockup */}
      <div className="space-y-4">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Terminal className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <span>Cấu Trúc Thư Mục Sau Khi Giải Nén</span>
        </h3>

        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 font-mono text-xs sm:text-sm text-slate-300 space-y-3 shadow-xl">
          <div className="text-slate-400 text-xs pb-2.5 border-b border-slate-800 flex items-center justify-between">
            <span>📁 D:\TikTokFlow-Agent\</span>
            <span className="text-emerald-400 font-bold">Ready to run</span>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">├──</span>
              <code className="text-emerald-400 font-bold">run-agent.bat</code>
              <span className="text-slate-400 text-xs">➔ Nhấp đúp để cào số liệu ngay lập tức (1 lần)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">├──</span>
              <code className="text-cyan-400 font-bold">setup-agent.bat</code>
              <span className="text-slate-400 text-xs">➔ Cài đặt tự khởi động ngầm cùng Windows & Đổi Token</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">└──</span>
              <code className="text-rose-400 font-bold">stop-agent.bat</code>
              <span className="text-slate-400 text-xs">➔ Dừng toàn bộ tiến trình ngầm & dọn sạch bộ nhớ RAM</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step-by-Step Guide */}
      <div className="space-y-4">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Cách Cài Đặt & Sử Dụng</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Mode 1: Tự động chạy ngầm (Ưu tiên) */}
          <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm sm:text-base font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Chế Độ 1: Tự Động Chạy Ngầm (Khuyên Dùng)
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Nhấp đúp vào file <code className="text-cyan-600 dark:text-cyan-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-xs font-bold border border-slate-200 dark:border-slate-800">setup-agent.bat</code> ➔ Nhấn phím <strong className="text-cyan-600 dark:text-cyan-400 font-bold">1</strong> và bấm Enter. Nếu Windows hỏi quyền quản trị (UAC), chọn <strong>Cho phép</strong>.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Xong! Agent chạy ngầm cùng Windows. Dữ liệu được thu thập và đồng bộ về hệ thống theo lịch cấu hình sẵn, không làm gián đoạn công việc. Nên hoàn tất bước này <strong>trước</strong> khi nạp Extension vào GPMLogin.
            </p>

            {/* Real Screenshot for setup-agent.bat */}
            <div className="pt-2">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-lg group">
                <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">Menu thiết lập tự động setup-agent.bat</span>
                  <span className="text-[11px] text-cyan-400 font-mono">Windows Cmd</span>
                </div>
                <ZoomableImage
                  src="/images/docs/clientagent/anh-1.png"
                  alt="Giao diện cài đặt chạy ngầm setup-agent.bat"
                  onZoom={(src, alt) => setZoomImage({ src, alt })}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic mt-1.5">
                Hình 1: Menu cài đặt chạy ngầm, đổi Token và gỡ bỏ của setup-agent.bat
              </p>
            </div>
          </div>

          {/* Mode 2: Quét thủ công */}
          <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <Play className="w-4 h-4" />
                Chế Độ 2: Quét Ngay Lập Tức (Thủ Công)
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Nhấp đúp vào file <code className="text-emerald-600 dark:text-emerald-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-xs font-bold border border-slate-200 dark:border-slate-800">run-agent.bat</code>.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Cửa sổ tiến trình sẽ hiển thị trong quá trình Agent tự động quét lần lượt các profile GPMLogin trên máy. Sau khi hoàn tất, dữ liệu sẽ được tự động đồng bộ về hệ thống trung tâm và cửa sổ sẽ tự động đóng.            
            </p>

            {/* Real Screenshot for run-agent.bat */}
            <div className="pt-2">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-lg group">
                <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">Tiến trình cào quét số liệu run-agent.bat</span>
                  <span className="text-[11px] text-emerald-400 font-mono">Quét ngay</span>
                </div>
                <ZoomableImage
                  src="/images/docs/clientagent/anh-4.png"
                  alt="Giao diện cào dữ liệu TikTok Studio của run-agent.bat"
                  onZoom={(src, alt) => setZoomImage({ src, alt })}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic mt-1.5">
                Hình 2: Tiến trình quét tự động từng profile GPMLogin của run-agent.bat
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* How to Update Token */}
      <div className="p-6 sm:p-7 rounded-3xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-400 text-base sm:text-lg font-bold">
            <Key className="w-5 h-5 shrink-0" />
            <span>Cách Cấp Lại & Cập Nhật Personal Token Mới (Phím 3)</span>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-xs transition-all self-start sm:self-auto"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Mở Trang Cài Đặt (Settings)</span>
          </Link>
        </div>

        {/* Step-by-step intro & Settings Screenshot */}
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            Khi đổi sang máy tính mới hoặc cần cấp lại Personal Token, bạn vào <strong>Cài Đặt (Settings) ➔ tab Personal Token</strong> và bấm nút <strong className="text-amber-700 dark:text-amber-400">Cấp Lại Token Mới</strong> (hoặc xem/sao chép mã). Để tải file cài đặt Client Agent, bạn truy cập trang <Link href="/extensions" className="font-bold text-cyan-600 dark:text-cyan-400 hover:underline">Kho Tiện Ích (/extensions)</Link>.
          </p>

          {/* Screenshot of Settings token card */}
          <div className="max-w-3xl">
            <div className="rounded-2xl overflow-hidden border border-amber-200 dark:border-amber-900/60 bg-slate-900 shadow-lg group">
              <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Giao diện Cài Đặt ➔ Thẻ Quản Lý Personal Token</span>
                <span className="text-[11px] text-emerald-400 font-mono">Đang hoạt động</span>
              </div>
              <ZoomableImage
                src="/images/docs/token.png"
                alt="Giao diện Cài Đặt cá nhân hóa với Personal Token và nút Cấp Lại Token Mới"
                onZoom={(src, alt) => setZoomImage({ src, alt })}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic mt-2">
              Hình 3: Giao diện thẻ Personal Token trong Cài Đặt — vị trí cấp lại Token mới
            </p>
          </div>
        </div>

        {/* 2 Options */}
        <div className="space-y-3">
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            Sau khi tạo Token mới, bạn có thể lựa chọn một trong hai cách:
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option 1 */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-emerald-200 dark:border-emerald-900/60 space-y-2 shadow-xs">
              <div className="font-bold text-emerald-700 dark:text-emerald-400 text-sm sm:text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-xs font-black">1</span>
                <span>Tải file ZIP mới (Khuyên dùng):</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-8">
                File cài đặt tải từ trang <Link href="/extensions" className="font-bold text-cyan-600 dark:text-cyan-400 hover:underline">Kho Tiện Ích (/extensions)</Link> <strong>đã tích hợp sẵn cơ chế xác thực và trao đổi Token tự động giữa Extension / Client Agent và hệ thống</strong>. Chỉ cần tải về, giải nén và nhấp đúp file <code className="text-cyan-600 dark:text-cyan-400 font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">setup-agent.bat</code> là xong, không cần nhập mã thủ công!
              </p>
            </div>

            {/* Option 2 */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-900/60 space-y-2 shadow-xs">
              <div className="font-bold text-amber-700 dark:text-amber-400 text-sm sm:text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-300 flex items-center justify-center text-xs font-black">2</span>
                <span>Sử dụng Token thủ công (Phím 3):</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-8">
                Bấm nút <strong>Sao chép</strong> Personal Token mới từ mục Cài đặt và thực hiện cập nhật trực tiếp theo các bước bên dưới.
              </p>
            </div>
          </div>
        </div>

        {/* Steps for Option 2 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-950/80 border border-amber-200 dark:border-amber-900/40 space-y-3.5 text-sm">
          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              Thao tác Cách 2
            </span>
            <span>Các bước cấu hình Token trực tiếp trên Client Agent:</span>
          </div>

          <ol className="list-decimal list-inside text-sm text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed pl-1">
            <li>Nhấp đúp vào file <code className="text-cyan-600 dark:text-cyan-400 font-mono text-xs font-bold bg-cyan-50 dark:bg-cyan-950/50 px-1.5 py-0.5 rounded">setup-agent.bat</code>.</li>
            <li>Nhấn phím <strong className="text-amber-600 dark:text-amber-400 font-bold">3</strong> và bấm Enter để chọn chức năng <strong>DOI TOKEN</strong>.</li>
            <li>Dán mã Personal Token mới của bạn vào và nhấn Enter. Hệ thống sẽ tự động gửi tín hiệu test đến máy chủ và thông báo kết quả xác thực thành công trực tiếp trên màn hình!</li>
          </ol>

          <div className="pl-0 sm:pl-4 max-w-2xl pt-1">
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-lg group">
              <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Giao diện cập nhật Token Client Agent</span>
                <span className="text-[11px] text-amber-400 font-mono">setup-agent.bat phím 3</span>
              </div>
              <ZoomableImage
                src="/images/docs/clientagent/anh-3.png"
                alt="Giao diện cập nhật Token Client Agent qua setup-agent.bat phím 3"
                onZoom={(src, alt) => setZoomImage({ src, alt })}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic mt-1.5">
              Hình 4: Cửa sổ cập nhật Personal Token mới và test kết nối trực tiếp với máy chủ
            </p>
          </div>
        </div>
      </div>

      {/* How to Uninstall / Stop Client Agent */}
      <div className="p-6 sm:p-7 rounded-3xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 space-y-4">
        <div className="flex items-center gap-2.5 text-rose-700 dark:text-rose-400 text-base font-bold">
          <Trash2 className="w-5 h-5 shrink-0" />
          <span>Cách Tắt & Gỡ Bỏ (Uninstall) Client Agent Khỏi Máy Tính</span>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          Nếu bạn muốn dừng hoạt động hoặc gỡ hoàn toàn phần mềm khỏi máy trạm, thực hiện 3 bước sau:
        </p>

        <div className="space-y-3 text-sm">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-950/80 border border-rose-200 dark:border-rose-900/40 space-y-3">
            <div className="flex items-start gap-3.5">
              <span className="w-7 h-7 rounded-xl bg-rose-100 dark:bg-rose-600/30 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-xs shrink-0">
                1
              </span>
              <div>
                <div className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">Dừng Ngay Lập Tức (1-Click Stop)</div>
                <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed text-sm">
                  Nhấp đúp vào file <code className="text-rose-600 dark:text-rose-400 font-mono text-xs font-bold bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded">stop-agent.bat</code> trong thư mục. File sẽ tự động dừng các tiến trình của Agent đang chạy, giải phóng tài nguyên hệ thống và xóa các tệp tạm do Agent tạo trong quá trình hoạt động.
                </p>
              </div>
            </div>

            {/* Real Screenshot for stop-agent.bat */}
            <div className="pl-0 sm:pl-10 max-w-2xl">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-lg group">
                <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">Giao diện dừng tiến trình stop-agent.bat</span>
                  <span className="text-[11px] text-rose-400 font-mono">Dừng hoàn toàn</span>
                </div>
                <ZoomableImage
                  src="/images/docs/clientagent/anh-2.png"
                  alt="Giao diện dừng tiến trình stop-agent.bat"
                  onZoom={(src, alt) => setZoomImage({ src, alt })}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic mt-1.5">
                Hình 4: Tiến trình dừng ngầm, giải phóng RAM và dọn dẹp sạch sẽ của stop-agent.bat
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-950/80 border border-rose-200 dark:border-rose-900/40 flex items-start gap-3.5">
            <span className="w-7 h-7 rounded-xl bg-rose-100 dark:bg-rose-600/30 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-xs shrink-0">
              2
            </span>
            <div>
              <div className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">Gỡ Chạy Ngầm Khỏi Máy</div>
              <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed text-sm">
                Nhấp đúp vào file <code className="text-cyan-600 dark:text-cyan-400 font-mono text-xs font-bold bg-cyan-50 dark:bg-cyan-950/50 px-1.5 py-0.5 rounded">setup-agent.bat</code> ➔ Nhấn phím <strong className="text-rose-600 dark:text-rose-400">2</strong> và bấm Enter. Hệ thống sẽ dừng và gỡ cài đặt Agent khỏi máy (có thể cần Cho phép UAC).
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-950/80 border border-rose-200 dark:border-rose-900/40 flex items-start gap-3.5">
            <span className="w-7 h-7 rounded-xl bg-rose-100 dark:bg-rose-600/30 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-xs shrink-0">
              3
            </span>
            <div>
              <div className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">Xóa Thư Mục Đã Giải Nén</div>
              <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed text-sm">
                Xóa thư mục <code className="text-slate-800 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-xs">TikTokFlow-Agent</code>. Máy trạm của bạn hoàn toàn sạch sẽ, không có bất kỳ file rác hay registry nào bị lưu lại.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox for zooming screenshots */}
      <ImageLightbox
        src={zoomImage?.src || null}
        alt={zoomImage?.alt}
        onClose={() => setZoomImage(null)}
      />
    </div>
  );
}

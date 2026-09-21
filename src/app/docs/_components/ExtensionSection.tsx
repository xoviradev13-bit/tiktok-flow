"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Download,
  Key,
  FolderOpen,
  Monitor,
  Zap,
  CheckCircle2,
  Trash2,
  Lock,
  Puzzle,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { APP_ROUTES } from "@/constants/routes.config";
import { ImageLightbox, ZoomableImage } from "./ImageLightbox";
import { downloadPackage } from "@/lib/download-package";

export function ExtensionSection() {
  const { data: session } = useSession();
  const [zoomImage, setZoomImage] = useState<{ src: string; alt?: string } | null>(null);
  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-5">
        <span className="text-xs font-bold text-pink-600 dark:text-pink-400 font-mono uppercase tracking-wider">
          Tiện Ích Trình Duyệt
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
          Hướng Dẫn Cài Đặt, Sử Dụng & Gỡ Bỏ TikTokFlow Extension
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
          Cách nạp tiện ích TikTokFlow Companion vào GPMLogin, kích hoạt đồng bộ số liệu và gỡ bỏ khi cần.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-cyan-50/80 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 text-sm text-cyan-900 dark:text-cyan-100 leading-relaxed">
        <strong className="font-bold">Làm trước:</strong> Cài và chạy Client Agent trên máy (
        <code className="font-mono text-xs font-bold bg-cyan-100 dark:bg-cyan-900/50 px-1.5 py-0.5 rounded">setup-agent.bat</code>{" "}
        phím <strong>1</strong>) rồi mới nạp Extension. Extension cần Agent đang chạy trên cùng máy để kích hoạt lần đầu.
      </div>

      {/* Download banner */}
      <div className="p-6 rounded-3xl bg-pink-50/70 dark:bg-gradient-to-r dark:from-pink-950/40 dark:via-purple-950/40 dark:to-slate-950 border border-pink-200 dark:border-pink-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-pink-700 dark:text-pink-400 uppercase tracking-wider">
            <Puzzle className="w-4 h-4" />
            <span>Tiện Ích GPMLogin Tự Động Định Danh</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            TikTokFlow Companion Extension
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl">
            Đã tích hợp sẵn cơ chế xác thực và trao đổi Token tự động với hệ thống. Bạn <strong>KHÔNG CẦN</strong> giải nén, chỉ cần nạp trực tiếp file zip vào GPMLogin.
          </p>
        </div>

        {session ? (
          <button
            type="button"
            onClick={() => downloadPackage("/api/extension/download", "TikTokFlow-Extension.zip")}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/20 shrink-0 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Tải Extension (.zip)</span>
          </button>
        ) : (
          <Link
            href={APP_ROUTES.SIGNIN}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold bg-slate-200/80 hover:bg-pink-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-pink-600 dark:hover:text-pink-400 border border-slate-300 dark:border-slate-700 shrink-0 transition-all cursor-pointer"
          >
            <Lock className="w-4 h-4 text-pink-500" />
            <span>Đăng Nhập Để Tải (.zip)</span>
          </Link>
        )}
      </div>

      {/* Step-by-Step Installation */}
      <div className="space-y-6">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center text-xs font-black">
            A
          </span>
          <span>Quy Trình Cài Đặt TikTokFlow Extension (3 Bước)</span>
        </h3>

        {/* Step 1 */}
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-2.5 text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            <span className="w-6 h-6 rounded-full bg-pink-600 text-white flex items-center justify-center text-xs font-bold">1</span>
            <span>Bước 1: Tải File Gói Tiện Ích extension.zip</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 pl-8 leading-relaxed">
            Bấm nút tải ở trên để tải file <code className="text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 font-mono text-xs font-bold">extension.zip</code> về máy tính. <strong className="text-pink-600 dark:text-pink-400">Bạn KHÔNG CẦN giải nén file này</strong>, GPMLogin hỗ trợ nạp thẳng trực tiếp file zip cực kỳ tiện lợi và nhanh chóng.
          </p>
        </div>

        {/* Step 2: Add Extension to GPMLogin */}
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            <span className="w-6 h-6 rounded-full bg-pink-600 text-white flex items-center justify-center text-xs font-bold">2</span>
            <span>Bước 2: Nạp Trực Tiếp File Zip Vào GPMLogin (Không Cần Giải Nén)</span>
          </div>
          
          <div className="text-sm text-slate-600 dark:text-slate-400 pl-8 space-y-2 leading-relaxed">
            <p>
              1. Mở ứng dụng <strong>GPMLogin</strong> ➔ Vào menu <strong>Extensions (Tiện ích)</strong> ở thanh bên trái.
            </p>
            <p>
              2. Bấm nút màu xanh <strong className="text-blue-600 dark:text-blue-400">+ Thêm extension</strong> ➔ Chọn dòng <strong className="text-slate-900 dark:text-white">Từ thiết bị (.crx, .zip)</strong>.
            </p>
            <p>
              3. Chọn trực tiếp file <code className="text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-xs font-bold">extension.zip</code> vừa tải về.
            </p>
            <p>
              4. Gạt công tắc sang <strong className="text-blue-600 dark:text-blue-400">On</strong>. Tiện ích sẽ <strong>tự động kích hoạt trên toàn bộ profile</strong> GPMLogin mỗi khi bạn mở trình duyệt!
            </p>
          </div>

          {/* Real Screenshots Grid for Step 2 */}
          <div className="pl-0 sm:pl-8 grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-lg group">
                <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">1. Chọn Thêm extension ➔ Từ thiết bị (.crx, .zip)</span>
                  <span className="text-[11px] text-pink-400 font-mono">GPMLogin</span>
                </div>
                <ZoomableImage
                  src="/images/docs/extensions/anh-1.png"
                  alt="Thao tác thêm extension zip vào GPMLogin"
                  onZoom={(src, alt) => setZoomImage({ src, alt })}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic">
                Hình 1: Menu tiện ích GPMLogin và tùy chọn nạp file .zip trực tiếp
              </p>
            </div>

            <div className="space-y-2">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-lg group">
                <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">2. TikTokFlow Companion đã nạp & bật On</span>
                  <span className="text-[11px] text-emerald-400 font-mono">Đã kích hoạt</span>
                </div>
                <ZoomableImage
                  src="/images/docs/extensions/anh-2.png"
                  alt="TikTokFlow Companion hiển thị và bật On trên GPMLogin"
                  onZoom={(src, alt) => setZoomImage({ src, alt })}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic">
                Hình 2: Trạng thái Extension TikTokFlow Companion đã bật On sẵn sàng
              </p>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            <span className="w-6 h-6 rounded-full bg-pink-600 text-white flex items-center justify-center text-xs font-bold">3</span>
            <span>Bước 3: Tự Động Chạy Ngầm (Không Cần Bấm Vào Biểu Tượng)</span>
          </div>
          
          <div className="pl-0 sm:pl-8 space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <p>
              • <strong>Tự động 100%:</strong> Khi bạn mở bất kỳ profile GPMLogin nào, Extension sẽ <strong>tự động chạy ngầm</strong> ngay lập tức. Tiện ích tự động xác thực với hệ thống, tự động nhận diện phiên đăng nhập TikTok và tự động gửi dữ liệu về máy chủ theo lịch — <strong>bạn hoàn toàn không cần phải bấm vào biểu tượng tiện ích mỗi khi làm việc</strong>.
            </p>
            <p>
              • <strong>Khi nào mới cần bấm biểu tượng Tiện ích (Tùy chọn):</strong> Bạn chỉ cần bấm vào biểu tượng Extension ở góc phải trình duyệt khi muốn <em>xem kiểm tra nhanh</em> trạng thái kết nối, xem thông tin tài khoản TikTok đang đăng nhập, hoặc bấm nút đồng bộ thủ công ngay lập tức.
            </p>
          </div>
        </div>
      </div>

      {/* How to Update Token */}
      <div className="p-6 sm:p-7 rounded-3xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-400 text-base sm:text-lg font-bold">
            <Key className="w-5 h-5 shrink-0" />
            <span>Cách Cấp Lại & Cập Nhật Personal Token Mới (Extension)</span>
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
            Khi đổi sang máy tính mới hoặc cần cấp lại Personal Token, bạn vào <strong>Cài Đặt (Settings) ➔ tab Personal Token</strong> và bấm nút <strong className="text-amber-700 dark:text-amber-400">Cấp Lại Token Mới</strong> (hoặc xem/sao chép mã). Để tải file cài đặt Extension, bạn truy cập trang <Link href="/extensions" className="font-bold text-pink-600 dark:text-pink-400 hover:underline">Kho Tiện Ích (/extensions)</Link>.
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
                File cài đặt tải từ trang <Link href="/extensions" className="font-bold text-pink-600 dark:text-pink-400 hover:underline">Kho Tiện Ích (/extensions)</Link> <strong>đã tích hợp sẵn cơ chế xác thực và trao đổi Token tự động giữa Extension / Client Agent và hệ thống</strong>. Chỉ cần tải lại file <code className="text-pink-600 dark:text-pink-400 font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">extension.zip</code> và nạp đè vào GPMLogin (<em>+ Thêm extension ➔ Từ thiết bị .zip</em>) là xong!
              </p>
            </div>

            {/* Option 2 */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-900/60 space-y-2 shadow-xs">
              <div className="font-bold text-amber-700 dark:text-amber-400 text-sm sm:text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-300 flex items-center justify-center text-xs font-black">2</span>
                <span>Nhập Token trực tiếp trên Extension:</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-8">
                Bấm nút <strong>Sao chép</strong> Personal Token mới từ mục Cài đặt và dán trực tiếp vào tiện ích trên trình duyệt theo các bước bên dưới.
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
            <span>Các bước dán Token trực tiếp vào popup Extension:</span>
          </div>

          <ol className="list-decimal list-inside text-sm text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed pl-1">
            <li>Mở profile GPMLogin bất kỳ ➔ Bấm vào biểu tượng tiện ích <strong>TikTokFlow Companion</strong> ở góc trên bên phải trình duyệt.</li>
            <li>Dán mã Personal Token mới của bạn vào ô <strong>Personal Token</strong>.</li>
            <li>Bấm nút <strong>Kiểm tra</strong> để hệ thống test kết nối ngay với máy chủ (hoặc bấm <strong>Lưu</strong>, tiện ích sẽ tự động xác thực trước khi kích hoạt thành công!).</li>
          </ol>

          <div className="pl-0 sm:pl-4 max-w-2xl pt-1">
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-lg group">
              <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Giao diện Popup TikTokFlow Companion trên trình duyệt</span>
                <span className="text-[11px] text-pink-400 font-mono">Đổi Personal Token</span>
              </div>
              <ZoomableImage
                src="/images/docs/extensions/anh-3.png"
                alt="Popup TikTokFlow Companion với Personal Token và thông tin nhân sự"
                onZoom={(src, alt) => setZoomImage({ src, alt })}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic mt-1.5">
              Hình 4: Cửa sổ Popup Extension — vị trí dán mã Personal Token mới và bấm Kiểm tra / Lưu
            </p>
          </div>
        </div>
      </div>

      {/* How to Uninstall / Remove Extension */}
      <div className="p-6 rounded-3xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 space-y-4">
        <div className="flex items-center gap-2.5 text-rose-700 dark:text-rose-400 text-base font-bold">
          <Trash2 className="w-5 h-5 shrink-0" />
          <span>Cách Gỡ Bỏ (Uninstall) Tiện Ích Khỏi GPMLogin</span>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          Nếu bạn đổi máy, chuyển tài khoản hoặc không muốn sử dụng tiện ích nữa, việc gỡ bỏ rất đơn giản:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-950/80 border border-rose-200 dark:border-rose-900/40 space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span className="text-rose-600 dark:text-rose-400">Cách 1:</span> Gỡ trong phần mềm GPMLogin
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
              Mở ứng dụng GPMLogin ➔ Vào menu <strong>Extensions (Tiện ích)</strong> ➔ Tìm <strong>TikTokFlow Companion</strong> và bấm biểu tượng thùng rác / Xóa tiện ích khỏi danh sách.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-950/80 border border-rose-200 dark:border-rose-900/40 space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span className="text-rose-600 dark:text-rose-400">Cách 2:</span> Gỡ trực tiếp trên trình duyệt
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
              Mở trình duyệt GPMLogin ➔ Truy cập <code className="text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-xs">chrome://extensions</code> ➔ Tìm thẻ <strong>TikTokFlow Companion</strong> ➔ Bấm nút <strong className="text-rose-600 dark:text-rose-400">Remove (Xóa)</strong>.
            </p>
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

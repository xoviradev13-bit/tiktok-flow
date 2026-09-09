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
} from "lucide-react";
import { useSession } from "next-auth/react";
import { APP_ROUTES } from "@/constants/routes.config";
import { ImageLightbox, ZoomableImage } from "./ImageLightbox";

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
          Cách nạp tiện ích TikTokFlow Companion vào trình duyệt, kích hoạt đồng bộ số liệu và gỡ bỏ khi cần.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {session ? (
          <a
            href="/api/extension/download"
            download
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Tải Gói Tiện Ích Extension (.zip)</span>
          </a>
        ) : (
          <Link
            href={APP_ROUTES.SIGNIN}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-200/80 hover:bg-pink-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-pink-600 dark:hover:text-pink-400 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer"
          >
            <Lock className="w-4 h-4 text-pink-500" />
            <span>Đăng Nhập Để Tải Extension (.zip)</span>
          </Link>
        )}
        <Link
          href={session ? "/settings" : APP_ROUTES.SIGNIN}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition-colors"
        >
          <Key className="w-4 h-4 text-pink-600 dark:text-pink-400" />
          <span>{session ? "Lấy Personal Token" : "Đăng Nhập Để Lấy Token"}</span>
        </Link>
      </div>

      {/* Step-by-Step Installation */}
      <div className="space-y-6">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center text-xs font-black">
            A
          </span>
          <span>Quy Trình Cài Đặt Vào GPMLogin (3 Bước)</span>
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
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            <span className="w-6 h-6 rounded-full bg-pink-600 text-white flex items-center justify-center text-xs font-bold">3</span>
            <span>Bước 3: Bắt Đầu Sử Dụng</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 pl-8 leading-relaxed">
            Mở profile GPMLogin bất kỳ ➔ Bấm vào biểu tượng mảnh ghép Tiện ích ở góc phải trình duyệt ➔ Ghim và mở <strong>TikTokFlow Companion</strong>. <strong>Extension đã được hệ thống tự động tích hợp sẵn Personal Token định danh cá nhân của bạn</strong>, bạn hoàn toàn không cần phải nhập lại mã Token (trừ trường hợp khi đổi máy tính hoặc cần cấp đổi mã Token mới). Từ nay, mỗi khi bạn mở profile GPMLogin và đăng nhập tài khoản TikTok, toàn bộ số liệu TikTok Studio sẽ tự động được thu thập và gửi về máy chủ trung tâm!
          </p>

          {/* Real Screenshot for Step 3 */}
          <div className="pl-0 sm:pl-8 max-w-2xl">
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-xl group">
              <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Giao diện Popup TikTokFlow Companion trên trình duyệt</span>
                <span className="text-[11px] text-pink-400 font-mono">Đã xác minh phiên</span>
              </div>
              <ZoomableImage
                src="/images/docs/extensions/anh-3.png"
                alt="Popup TikTokFlow Companion với Personal Token và thông tin nhân sự"
                onZoom={(src, alt) => setZoomImage({ src, alt })}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic mt-2">
              Hình 3: Giao diện thực tế của Extension khi mở trong profile GPM với Token và thông tin định danh
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
              <span className="text-rose-600 dark:text-rose-400">Cách 1:</span> Gỡ trực tiếp trên trình duyệt
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
              Vào <code className="text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-xs">chrome://extensions</code> ➔ Tìm thẻ <strong>TikTokFlow Companion</strong> ➔ Bấm nút <strong className="text-rose-600 dark:text-rose-400">Remove (Xóa)</strong>. Tiện ích sẽ biến mất ngay lập tức.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-950/80 border border-rose-200 dark:border-rose-900/40 space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span className="text-rose-600 dark:text-rose-400">Cách 2:</span> Gỡ trong phần mềm GPMLogin
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
              Nếu bạn đã thêm vào danh sách tiện ích dùng chung của ứng dụng GPMLogin: Mở GPMLogin ➔ Menu <strong>Extensions</strong> ➔ Bỏ tích chọn hoặc bấm Xóa tiện ích khỏi danh sách.
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

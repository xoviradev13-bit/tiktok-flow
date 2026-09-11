"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Puzzle,
  Laptop,
  Download,
  ChevronRight,
  Key,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { APP_ROUTES } from "@/constants/routes.config";
import { ImageLightbox, ZoomableImage } from "./ImageLightbox";

interface QuickstartSectionProps {
  onNavigateSection: (sectionId: "extension" | "client_agent") => void;
}

export function QuickstartSection({ onNavigateSection }: QuickstartSectionProps) {
  const { data: session } = useSession();
  const [zoomImage, setZoomImage] = useState<{ src: string; alt?: string } | null>(null);
  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-5">
        <span className="text-xs font-bold text-pink-600 dark:text-pink-400 font-mono uppercase tracking-wider">
          Hướng Dẫn Nhập Môn
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
          Bắt Đầu Nhanh Với TikTokFlow
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
          Quy trình kết nối máy trạm và đồng bộ số liệu tài khoản TikTok về hệ thống quản trị trung tâm.
        </p>
      </div>

      {/* STEP 1: DOWNLOAD BOTH TOOLS (EXTENSION & CLIENT AGENT) */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-600 text-white flex items-center justify-center text-sm font-black shadow-md shadow-pink-600/30 shrink-0">
            1
          </span>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Bước 1: Tải Cả 2 Công Cụ Đồng Bộ (Extension & Client Agent)
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Vui lòng tải và cài đặt cả hai công cụ dưới đây để hệ thống tự động nhận diện và đồng bộ số liệu TikTok Studio toàn diện nhất:
            </p>
          </div>
        </div>

        {/* Guest Warning Banner */}
        {!session && (
          <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
              <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Yêu cầu đăng nhập:</strong> Chỉ nhân sự nội bộ trong hệ thống mới có thể tải công cụ (hệ thống đã tích hợp sẵn cơ chế xác thực và trao đổi Token tự động giữa Extension / Client Agent và hệ thống).
              </span>
            </div>
            <Link
              href={APP_ROUTES.SIGNIN}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shrink-0 self-start sm:self-auto transition-all shadow-xs"
            >
              Đăng Nhập Ngay
            </Link>
          </div>
        )}

        {/* Two Main Download Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
          {/* Method 1: Extension Download Card */}
          <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/70 border-2 border-pink-500/30 hover:border-pink-500 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-11 h-11 rounded-2xl bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center border border-pink-500/20">
                  <Puzzle className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-500/30">
                  Đồng Bộ Trực Tiếp • GPMLogin
                </span>
              </div>

              <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                TikTokFlow Extension (TikTokFlow Companion)
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                Tích hợp trực tiếp với GPMLogin thông qua tính năng Extension, tự động kích hoạt khi mở profile để nhận diện tài khoản TikTok đang đăng nhập trên từng profile. Hệ thống hỗ trợ tự động liên kết và bàn giao tài khoản giữa các nhân sự. Mỗi máy chỉ cài đặt một Extension, được cấu hình riêng cho từng nhân sự vận hành, nhằm đảm bảo dữ liệu được xử lý ổn định, chính xác và tránh xung đột trong quá trình vận hành.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 leading-snug text-center">
                File cài đặt là tài nguyên nội bộ, được cấp riêng cho từng nhân sự và chỉ sử dụng theo cấu hình được phân công.
              </p>
              {session ? (
                <a
                  href="/api/extension/download"
                  download
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/25 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải Extension (.zip)</span>
                </a>
              ) : (
                <Link
                  href={APP_ROUTES.SIGNIN}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-200/80 hover:bg-pink-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-pink-600 dark:hover:text-pink-400 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer"
                >
                  <Lock className="w-4 h-4 text-pink-500" />
                  <span>Đăng Nhập Để Tải (.zip)</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => onNavigateSection("extension")}
                className="w-full text-center text-sm font-semibold text-pink-600 dark:text-pink-400 hover:underline cursor-pointer flex items-center justify-center gap-1"
              >
                <span>Xem chi tiết cách cài đặt & gỡ bỏ</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Method 2: Client Agent Download Card */}
          <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-950/70 border-2 border-cyan-500/30 hover:border-cyan-500 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/20">
                  <Laptop className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30">
                  Tự Động Hóa 100% • Portable
                </span>
              </div>

              <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                TikTokFlow Client Agent Worker
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                Phần mềm Agent chạy trên máy Windows, tự động thu thập các số liệu TikTok như lượt xem, doanh thu và các dữ liệu liên quan, sau đó đồng bộ về hệ thống. Agent hoạt động nền theo lịch cấu hình sẵn, hạn chế tối đa việc chiếm dụng chuột và ảnh hưởng đến thao tác của người dùng. Mỗi máy chỉ chạy một Agent, được cấu hình riêng cho từng nhân sự vận hành, nhằm đảm bảo dữ liệu được xử lý ổn định, chính xác và tránh xung đột trong quá trình vận hành.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 leading-snug text-center">
                File cài đặt là tài nguyên nội bộ, được cấp riêng cho từng nhân sự và chỉ sử dụng theo cấu hình được phân công.              
              </p>
              {session ? (
                <a
                  href="/api/client-agent/download"
                  download
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/25 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải Client Agent (.zip)</span>
                </a>
              ) : (
                <Link
                  href={APP_ROUTES.SIGNIN}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-200/80 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-400 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer"
                >
                  <Lock className="w-4 h-4 text-cyan-500" />
                  <span>Đăng Nhập Để Tải (.zip)</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => onNavigateSection("client_agent")}
                className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer flex items-center justify-center gap-1"
              >
                <span>Xem chi tiết cách chạy & gỡ bỏ</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 2: QUICK SETUP SUMMARY */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-sm font-black shadow-md shadow-purple-600/30 shrink-0">
            2
          </span>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Bước 2: Cài Đặt Nhanh (Mất Chưa Đầy 1 Phút)
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Thao tác cực kỳ đơn giản để kích hoạt đồng bộ trên máy trạm của bạn:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-base font-bold text-pink-600 dark:text-pink-400 flex items-center gap-2">
                <Puzzle className="w-4 h-4 shrink-0" />
                <span>1. Cài Đặt Extension Vào GPMLogin:</span>
              </div>
              <ol className="list-decimal list-inside text-sm text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed pl-1">
                <li>Mở ứng dụng GPMLogin ➔ Menu <strong>Extensions (Tiện ích)</strong> ➔ Bấm <strong>+ Thêm extension</strong>.</li>
                <li>Chọn dòng <strong>Từ thiết bị (.crx, .zip)</strong> ➔ Chọn trực tiếp file <code className="text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-xs font-bold border border-slate-200 dark:border-slate-700">extension.zip</code> vừa tải về (không cần giải nén).</li>
                <li>Bật công tắc sang <strong>On</strong>. Extension sẽ tự động kích hoạt trên toàn bộ profile!</li>
              </ol>
            </div>

            <div className="pt-2">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-sm">
                <ZoomableImage
                  src="/images/docs/extensions/anh-2.png"
                  alt="Minh họa Extension TikTokFlow Companion bật On trên GPMLogin"
                  onZoom={(src, alt) => setZoomImage({ src, alt })}
                />
              </div>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-base font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
                <Laptop className="w-4 h-4 shrink-0" />
                <span>2. Chạy Client Agent Tự Động:</span>
              </div>
              <ol className="list-decimal list-inside text-sm text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed pl-1">
                <li>Giải nén file <code className="text-cyan-600 dark:text-cyan-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-xs font-bold border border-slate-200 dark:border-slate-700">client-agent.zip</code>.</li>
                <li>Nhấp đúp <code className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-cyan-200 dark:border-cyan-800">setup-agent.bat</code> để tự động chạy ngầm cùng Windows.</li>
                <li>Hoặc nhấp đúp vào file <code className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">run-agent.bat</code> để cào số liệu ngay.</li>
              </ol>
            </div>

            <div className="pt-2">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-sm">
                <ZoomableImage
                  src="/images/docs/clientagent/anh-1.png"
                  alt="Minh họa Menu setup-agent.bat chạy ngầm"
                  onZoom={(src, alt) => setZoomImage({ src, alt })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* IMPORTANT NOTES SECTION (Personal Token & GPMLogin API) */}
      <div className="space-y-4 pt-2">
        {/* Note 1: Personal Token Note */}
        <div className="p-5 sm:p-6 rounded-3xl bg-pink-50/70 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/40 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-pink-700 dark:text-pink-400 text-base font-bold">
              <Key className="w-4 h-4 shrink-0" />
              <span>Ghi Chú Quan Trọng Về Mã Khóa Bảo Mật (Personal Security Token)</span>
            </div>

            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-xs transition-all self-start sm:self-auto"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Xem Mã Token Trong Cài Đặt</span>
            </Link>
          </div>

          <div className="text-sm text-slate-700 dark:text-slate-300 space-y-3 leading-relaxed">
            <p>
              • <strong>Tự động cấu hình:</strong> Cả hai gói tải về (Extension & Client Agent) ở Bước 1 <strong>đều đã được hệ thống tích hợp sẵn cơ chế xác thực và trao đổi Token tự động giữa Extension / Client Agent và hệ thống</strong>. Bạn chỉ cần tải về và khởi chạy mà không cần cấu hình thủ công!
            </p>
            <p>
              • <strong>Khi đổi máy tính hoặc cần cấp lại Token:</strong> Bạn có thể chọn 1 trong 2 cách linh hoạt dưới đây:
            </p>

            <div className="space-y-3 pt-1">
              {/* Cách 1 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-pink-200 dark:border-pink-900/60 space-y-2 shadow-xs">
                <div className="font-bold text-pink-700 dark:text-pink-400 text-sm sm:text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-300 flex items-center justify-center text-xs font-black">1</span>
                  <span>Cách 1 (Tải lại file mới - Khuyên dùng):</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-8">
                  Tải lại gói Extension & Client Agent từ trang <Link href="/extensions" className="font-bold text-pink-600 dark:text-pink-400 hover:underline">Kho Tiện Ích (/extensions)</Link> (hệ thống đã tích hợp sẵn cơ chế xác thực và trao đổi Token tự động). Với Extension thì nạp trực tiếp file zip mới vào GPMLogin (<em>+ Thêm extension ➔ Từ thiết bị .zip</em>); với Client Agent thì giải nén và nhấp đúp file <code className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">setup-agent.bat</code> là xong!
                </p>
              </div>

              {/* Cách 2 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-cyan-200 dark:border-cyan-900/60 space-y-3 shadow-xs">
                <div className="font-bold text-cyan-700 dark:text-cyan-400 text-sm sm:text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-cyan-100 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300 flex items-center justify-center text-xs font-black">2</span>
                  <span>Cách 2 (Nhập Token trực tiếp không cần tải lại file):</span>
                </div>

                <div className="pl-0 sm:pl-8 space-y-3 text-sm text-slate-700 dark:text-slate-300">
                  {/* Client Agent sub-card */}
                  <div className="p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                        Client Agent
                      </span>
                      <span className="text-sm font-semibold">Thao tác trên máy tính:</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm pl-0.5">
                      Nhấp đúp file <code className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-slate-900 px-2 py-0.5 rounded border border-cyan-200 dark:border-cyan-800">setup-agent.bat</code> ➔ Nhấn phím <strong className="text-cyan-600 dark:text-cyan-400 font-bold">3</strong> và dán mã Token mới vào. Hệ thống sẽ tự động kết nối máy chủ để test và báo kết quả cụ thể ngay trên màn hình.
                    </p>
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black shadow-xs max-w-lg mt-1">
                      <ZoomableImage
                        src="/images/docs/clientagent/anh-3.png"
                        alt="Giao diện đổi Token và cấu hình Client Agent (setup-agent.bat phím 3)"
                        onZoom={(src, alt) => setZoomImage({ src, alt })}
                      />
                    </div>
                  </div>

                  {/* Extension sub-card */}
                  <div className="p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-pink-100 dark:bg-pink-900/50 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                        Extension
                      </span>
                      <span className="text-sm font-semibold">Thao tác trên trình duyệt:</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm pl-0.5">
                      Bấm biểu tượng Tiện ích trên trình duyệt ➔ Dán mã Token mới vào ô <strong>Personal Token</strong> ➔ Bấm <strong>Kiểm tra</strong> để test hoặc bấm <strong>Lưu</strong> (hệ thống sẽ tự động xác thực với server trước khi lưu).
                    </p>
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 shadow-xs max-w-lg mt-1">
                      <ZoomableImage
                        src="/images/docs/extensions/anh-3.png"
                        alt="Popup TikTokFlow Companion với ô Personal Token"
                        onZoom={(src, alt) => setZoomImage({ src, alt })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Note 2: Clarification on Port / Auto-detect API */}
        <div className="p-5 sm:p-6 rounded-3xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 space-y-2.5">
          <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-400 text-base font-bold">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Cơ Chế Đồng Bộ Hoàn Toàn Tự Động</span>
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed">
            <p>
              • <strong>Nhân viên máy trạm:</strong> Khi sử dụng Extension hoặc Client Agent, dữ liệu thu thập được sẽ tự động đồng bộ và gửi về hệ thống trung tâm để quản lý, xử lý và cập nhật theo phân quyền.
            </p>
            <p>
              • <strong>Cổng API GPMLogin:</strong> Hệ thống tự động nhận diện cổng hoạt động. Tính năng kết nối trực tiếp này chỉ dành riêng cho <strong>Quản Trị Viên (Admin)</strong> khi thiết lập server trung tâm.
            </p>
          </div>
        </div>
      </div>

      {/* Lightbox Modal for Full-Size Image Preview */}
      <ImageLightbox
        src={zoomImage?.src || null}
        alt={zoomImage?.alt}
        onClose={() => setZoomImage(null)}
      />
    </div>
  );
}


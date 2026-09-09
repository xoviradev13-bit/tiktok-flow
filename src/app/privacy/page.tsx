"use client";

import React from "react";
import Link from "next/link";
import { Zap, ShieldCheck, Lock, EyeOff, Server } from "lucide-react";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-pink-500 selection:text-white font-sans antialiased transition-colors">
      {/* Top Navbar */}
      <PublicHeader badge="Quyền Riêng Tư" />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <div className="space-y-3 pb-8 border-b border-slate-200 dark:border-slate-800">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-pink-600 dark:text-pink-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Chính Sách Bảo Vệ Quyền Riêng Tư Dữ Liệu</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Chính Sách Quyền Riêng Tư (Privacy Policy)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cập nhật lần cuối: 01 tháng 01 năm 2026 • Tuân thủ các nguyên tắc an toàn dữ liệu quốc tế
          </p>
        </div>

        {/* Section 1 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            1. Cam Kết Bảo Vệ Quyền Riêng Tư
          </h2>
          <p>
            Tại <strong>TikTokFlow Automation</strong>, chúng tôi coi trọng sự tin cậy và quyền riêng tư của từng khách hàng và studio. Chúng tôi cam kết không bán, không thương mại hóa và không chia sẻ dữ liệu kinh doanh, dàn kênh hoặc doanh thu của bạn cho bất kỳ bên thứ ba nào ngoài phạm vi cần thiết để cung cấp dịch vụ.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            2. Các Loại Dữ Liệu Được Thu Thập
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Thông tin tài khoản:</strong> Tên hiển thị, địa chỉ email, số điện thoại liên hệ và mật khẩu được mã hóa an toàn bằng Bcrypt.
            </li>
            <li>
              <strong>Dữ liệu định danh tự động hóa:</strong> Profile UUID của trình duyệt GPMLogin, Personal Token dùng xác thực cho Extension và Client Agent Worker.
            </li>
            <li>
              <strong>Số liệu phân tích kênh:</strong> Thống kê số lượt xem video, doanh thu Creator Rewards, tỷ lệ RPM và lịch sử chấm công nhân sự.
            </li>
            <li>
              <strong>Nhật ký kỹ thuật (Technical Logs):</strong> Địa chỉ IP, User Agent trình duyệt, nhật ký đồng bộ để phục vụ mục đích kiểm toán an ninh và truy vết lỗi Sentry.
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            3. Chính Sách Về Cookie & Phiên Làm Việc
          </h2>
          <p>
            Hệ thống chỉ sử dụng các cookie kỹ thuật cần thiết cho chức năng xác thực phiên làm việc an toàn (với tiền tố <code>__Secure-tiktokflow.session-token</code> có cờ <code>HttpOnly</code> và <code>SameSite=Lax</code>). Chúng tôi không sử dụng bất kỳ cookie theo dõi quảng cáo của bên thứ ba nào.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            4. Quyền Kiểm Soát Dữ Liệu & Quyền Được Xóa Bỏ
          </h2>
          <p>
            Bạn có toàn quyền yêu cầu xuất bản sao lưu trữ dữ liệu hoặc yêu cầu xóa vĩnh viễn tài khoản và toàn bộ lịch sử dàn kênh khỏi máy chủ TikTokFlow bất kỳ lúc nào. Quản trị viên hệ thống có thể thực hiện xóa dữ liệu an toàn thông qua trang Quản Lý Nhân Sự hoặc gửi yêu cầu tới đội ngũ kỹ thuật qua email <strong>privacy@tiktokflow.com</strong>.
          </p>
        </section>
      </main>

      {/* Shared Public Footer */}
      <PublicFooter />
    </div>
  );
}

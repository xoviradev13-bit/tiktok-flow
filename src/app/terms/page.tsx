"use client";

import React from "react";
import Link from "next/link";
import { Zap, Shield, FileText, ChevronRight, ArrowLeft } from "lucide-react";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-pink-500 selection:text-white font-sans antialiased transition-colors">
      {/* Top Navbar */}
      <PublicHeader badge="Điều Khoản" />

      {/* Main Document Body */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <div className="space-y-3 pb-8 border-b border-slate-200 dark:border-slate-800">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-pink-600 dark:text-pink-400">
            <FileText className="w-4 h-4" />
            <span>Thỏa Thuận Cấp Phép & Dịch Vụ Doanh Nghiệp</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Điều Khoản Dịch Vụ (Terms of Service)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Có hiệu lực từ ngày: 01 tháng 01 năm 2026 • Phiên bản: 2.1 (Enterprise)
          </p>
        </div>

        {/* Section 1 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            1. Phạm Vi Dịch Vụ & Chấp Thuận Điều Khoản
          </h2>
          <p>
            Chào mừng bạn đến với hệ sinh thái <strong>TikTokFlow Automation</strong>. Bằng việc truy cập hoặc sử dụng bảng điều khiển, tiện ích mở rộng Companion Extension, ứng dụng Client Agent Worker hoặc các API liên quan, bạn xác nhận đã đọc, hiểu và đồng ý bị ràng buộc bởi các Điều khoản này.
          </p>
          <p>
            Hệ thống cung cấp các giải pháp hỗ trợ quản trị dàn profile GPMLogin, tự động hóa kiểm tra dữ liệu Creator Rewards Program, chấm công vận hành hàng ngày và phân tích doanh thu nội bộ cho các Studio và Content Creator.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            2. Tài Khoản & Bảo Mật Khóa Định Danh (Personal Token)
          </h2>
          <p>
            Người dùng chịu trách nhiệm tuyệt đối đối với việc bảo mật thông tin đăng nhập, mật khẩu và <strong>Personal Security Token</strong> được cấp. Mọi thao tác được thực hiện thông qua Token hoặc tài khoản của bạn sẽ được coi là do chính bạn hoặc nhân sự được bạn ủy quyền thực hiện.
          </p>
          <p>
            Nghiêm cấm chia sẻ Personal Token công khai trên các nền tảng mạng xã hội hoặc môi trường không bảo đảm. Nếu phát hiện nghi vấn rò rỉ token, bạn có quyền và nghĩa vụ sử dụng chức năng <em>Cấp Lại Token Mới</em> trong mục Cài Đặt để vô hiệu hóa ngay lập tức token cũ.
          </p>
        </section>

        {/* Section 3 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            3. Cam Kết Mức Độ Dịch Vụ (SLA 99.9% Uptime)
          </h2>
          <p>
            Chúng tôi cam kết duy trì hệ thống máy chủ, cổng API và hạ tầng cơ sở dữ liệu với tỉ lệ hoạt động tối thiểu <strong>99.9%</strong> mỗi tháng, ngoại trừ các trường hợp bảo trì định kỳ đã được thông báo trước hoặc các sự cố bất khả kháng xuất phát từ các nhà cung cấp hạ tầng đám mây toàn cầu.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            4. Quyền Sở Hữu Trí Tuệ & Dữ Liệu Của Bạn
          </h2>
          <p>
            Bạn giữ toàn quyền sở hữu đối với tất cả dữ liệu tài khoản TikTok, số liệu doanh thu và nội dung video do bạn đưa vào hệ thống. TikTokFlow chỉ đóng vai trò xử lý, đồng bộ và hiển thị dữ liệu phục vụ mục đích quản trị nội bộ của bạn.
          </p>
          <p>
            Toàn bộ mã nguồn, giao diện, thuật toán điều phối GPMLogin, cấu trúc tiện ích Extension và thương hiệu TikTokFlow thuộc quyền sở hữu độc quyền của đội ngũ phát triển.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            5. Giới Hạn Trách Nhiệm Đối Với Nền Tảng Bên Thứ Ba
          </h2>
          <p>
            TikTokFlow là giải pháp độc lập và không có mối quan hệ liên kết trực tiếp, tài trợ hay bảo trợ bởi ByteDance Ltd. hoặc TikTok Inc. Người dùng có trách nhiệm tuân thủ Điều khoản cộng đồng của TikTok khi sản xuất và xuất bản nội dung. Chúng tôi không chịu trách nhiệm đối với các rủi ro phát sinh từ các biện pháp xử phạt thuật toán hoặc thay đổi chính sách từ phía TikTok.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            6. Liên Hệ Pháp Lý & Giải Quyết Tranh Chấp
          </h2>
          <p>
            Mọi thắc mắc liên quan đến Điều khoản Dịch vụ, xin vui lòng gửi về bộ phận pháp lý qua địa chỉ email hỗ trợ chính thức: <strong>legal@tiktokflow.com</strong>.
          </p>
        </section>
      </main>

      {/* Shared Public Footer */}
      <PublicFooter />
    </div>
  );
}

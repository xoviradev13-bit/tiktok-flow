import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 flex items-center justify-center transition-colors">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 md:p-12 rounded-2xl shadow-xl overflow-y-auto max-h-[90vh]">
        <div>
          <Link 
            href="/signin" 
            className="inline-flex items-center text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 px-3 py-1.5 -ml-3 rounded-lg transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Quay lại Đăng Nhập
          </Link>

          <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-6 tracking-tight">
            Chính Sách Bảo Mật
          </h1>

          <div className="prose dark:prose-invert prose-slate max-w-none text-slate-700 dark:text-slate-300 text-sm leading-relaxed space-y-4">
            <p className="text-slate-500 dark:text-slate-400">
              Cập nhật lần cuối: Tháng 1 năm 2026
            </p>

            <p>
              Tại <strong>TIKTOKFLOW</strong>, chúng tôi coi trọng sự riêng tư và bảo mật thông tin của bạn. Chính sách Bảo Mật này giải thích cách chúng tôi thu thập, sử dụng, tiết lộ và bảo vệ dữ liệu của bạn khi bạn sử dụng nền tảng và dịch vụ tự động hóa của chúng tôi.
            </p>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-8 mb-4">
              1. Thu Thập Thông Tin
            </h2>
            <p>
              Chúng tôi có thể thu thập thông tin của bạn thông qua các hình thức sau:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Dữ liệu cá nhân:</strong> Tên, địa chỉ email, thông tin đăng nhập và các thông tin liên lạc bạn cung cấp khi tạo tài khoản.
              </li>
              <li>
                <strong>Dữ liệu vận hành & tài khoản TikTok:</strong> Thông tin về số lượng tài khoản, trạng thái kiểm tra (checklist), thông số tương tác và doanh thu được đồng bộ phục vụ mục đích thống kê nội bộ.
              </li>
              <li>
                <strong>Dữ liệu kỹ thuật:</strong> Địa chỉ IP, loại trình duyệt, hệ điều hành, nhật ký hoạt động trên hệ thống và thời gian truy cập.
              </li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-8 mb-4">
              2. Mục Đích Sử Dụng Dữ Liệu
            </h2>
            <p>
              Thông tin được thu thập giúp chúng tôi duy trì, nâng cấp và cung cấp dịch vụ ổn định nhất:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Tạo và quản lý tài khoản thành viên trong hệ thống.</li>
              <li>Tự động hóa báo cáo, checklist công việc và thống kê doanh thu realtime.</li>
              <li>Gửi email xác thực, đặt lại mật khẩu và các thông báo kỹ thuật quan trọng.</li>
              <li>Bảo vệ an toàn tài khoản và ngăn chặn các hành vi gian lận hoặc truy cập trái phép.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-8 mb-4">
              3. Cam Kết Bảo Mật
            </h2>
            <p>
              Chúng tôi áp dụng các tiêu chuẩn mã hóa bảo mật công nghiệp hàng đầu để bảo vệ dữ liệu mật khẩu và phiên đăng nhập của người dùng. Chúng tôi không bao giờ bán dữ liệu của bạn cho bất kỳ bên thứ ba nào.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
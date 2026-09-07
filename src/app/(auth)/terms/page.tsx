import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
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
            Điều Khoản Dịch Vụ
          </h1>

          <div className="prose dark:prose-invert prose-slate max-w-none text-slate-700 dark:text-slate-300 text-sm leading-relaxed space-y-4">
            <p className="text-slate-500 dark:text-slate-400">
              Cập nhật lần cuối: Tháng 1 năm 2026
            </p>

            <p>
              Các Điều Khoản Dịch Vụ này ("Điều khoản") cấu thành một thỏa thuận pháp lý có giá trị ràng buộc giữa bạn và <strong>TIKTOKFLOW Inc.</strong> ("chúng tôi"), liên quan đến việc bạn truy cập và sử dụng hệ thống TIKTOKFLOW cũng như bất kỳ dịch vụ tự động hóa và tiện ích liên quan nào.
            </p>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-8 mb-4">
              1. Chấp Thuận Điều Khoản
            </h2>
            <p>
              Bằng việc truy cập hoặc sử dụng TIKTOKFLOW, bạn xác nhận rằng bạn đã đọc, hiểu và đồng ý bị ràng buộc bởi toàn bộ các Điều khoản này. Nếu bạn không đồng ý với bất kỳ điều khoản nào, vui lòng ngưng sử dụng dịch vụ ngay lập tức.
            </p>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-8 mb-4">
              2. Trách Nhiệm Của Người Dùng
            </h2>
            <p>
              Khi sử dụng dịch vụ, bạn cam kết và bảo đảm rằng:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Mọi thông tin đăng ký bạn cung cấp là chính xác, đầy đủ và cập nhật.</li>
              <li>Bạn chịu trách nhiệm duy trì tính bảo mật của tài khoản và mật khẩu của mình.</li>
              <li>Bạn chỉ sử dụng hệ thống phục vụ mục đích vận hành hợp pháp, không lạm dụng hoặc gây ảnh hưởng đến hệ thống chung.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-8 mb-4">
              3. Quyền Sở Hữu Trí Tuệ
            </h2>
            <p>
              Toàn bộ giao diện người dùng, mã nguồn, cơ sở dữ liệu, logo và thương hiệu TIKTOKFLOW đều thuộc quyền sở hữu hoặc được cấp phép cho TIKTOKFLOW Inc. và được bảo vệ theo pháp luật hiện hành.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
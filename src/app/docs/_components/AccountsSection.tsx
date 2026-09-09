"use client";

import React from "react";

export function AccountsSection() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-4">
        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono uppercase">
          Vận Hành Kênh
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
          Quản Trị Dàn Account & Phân Công Nhân Sự
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
          Cấu trúc vòng đời kênh, quy định phân quyền Admin/Lead/Staff và quản lý rủi ro kênh vi phạm.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
          1. Các Trạng Thái Kênh (Account Lifecycle)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
              ACTIVE (Đang Hoạt Động)
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Kênh sạch, đã bật kiếm tiền hoặc đăng bài bình thường mỗi ngày.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400">
              WARMING (Nuôi Kênh)
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Kênh mới tạo hoặc mới mua về, cần tương tác nhẹ để tăng trust IP.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="text-xs sm:text-sm font-bold text-orange-600 dark:text-orange-400">
              RESTRICTED (Hạn Chế)
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Kênh dính cảnh báo bản quyền, shadowban hoặc hủy Creator Rewards.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400">
              BANNED (Đã Bị Khóa)
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Tài khoản bị cấm vĩnh viễn, lưu vết lịch sử kiểm toán để giải trình.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
          2. Phân Cấp Quyền Hạn (RBAC)
        </h3>
        <ul className="list-disc pl-5 space-y-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <li>
            <strong className="text-slate-900 dark:text-white">Quản Trị Viên (Admin):</strong> Toàn quyền thêm, xóa, sửa, gán kênh, chỉnh sửa cấu hình hệ thống và lịch cron.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">Trưởng Nhóm (Lead):</strong> Quản lý danh sách thành viên trong Group, theo dõi dàn kênh và duyệt báo cáo sự cố.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">Vận Hành Viên (Staff):</strong> Chỉ xem và quản lý các kênh TikTok được gán trực tiếp cho bản thân.
          </li>
        </ul>
      </div>
    </div>
  );
}

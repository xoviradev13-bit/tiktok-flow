"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Crown, Users, ArrowRight, ShieldCheck } from "lucide-react";

interface TeamScopeBannerProps {
  pageTitle?: string;
  customMessage?: string;
  className?: string;
}

export function TeamScopeBanner({
  pageTitle,
  customMessage,
  className = "",
}: TeamScopeBannerProps) {
  const { data: session } = useSession();

  const role = session?.user?.role;
  if (role !== "LEAD") {
    return null;
  }

  const teamName = session?.user?.ledTeam?.name || session?.user?.teamName || "Đội Nhóm Của Bạn";
  const teamId = session?.user?.ledTeam?.id || session?.user?.teamId;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-purple-500/10 border border-amber-500/30 dark:border-amber-500/20 p-3.5 sm:p-4 shadow-xs transition-all ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-2xs">
            <Crown className="w-5 h-5 fill-amber-500/30" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Phạm Vi Trưởng Nhóm: {teamName}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300">
                <ShieldCheck className="w-3 h-3" />
                Dữ Liệu Đội Nhóm
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
              {customMessage ||
                `Dữ liệu và quyền thao tác trên trang này được tự động giới hạn trong phạm vi các thành viên và dàn kênh thuộc ${teamName}.`}
            </p>
          </div>
        </div>

        {teamId && (
          <Link
            href={`/teams/${teamId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all shadow-2xs shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-amber-500" />
            <span>Xem Đội Nhóm</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

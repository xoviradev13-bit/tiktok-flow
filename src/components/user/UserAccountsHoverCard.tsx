"use client";

import React from "react";
import Link from "next/link";
import { Video } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export interface AccountItem {
  id: string;
  uniqueId?: string | null;
  username?: string | null;
  nickname?: string | null;
  avatarThumb?: string | null;
  status?: string | null;
  totalRevenue?: number | string | any;
  totalViews?: number | string | bigint | any;
  totalFollowers?: number | string | any;
  [key: string]: any;
}

export interface UserAccountsHoverCardProps {
  userId?: string | null;
  userName?: string | null;
  accountsCount?: number | null;
  accounts?: AccountItem[] | any[];
  className?: string;
  linkToAccounts?: boolean;
}

export function UserAccountsHoverCard({
  userId,
  accountsCount = 0,
  accounts = [],
  className,
  linkToAccounts = true,
}: UserAccountsHoverCardProps) {
  const count = accountsCount ?? 0;
  const list = accounts || [];

  return (
    <HoverCard openDelay={120} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center px-2.5 h-7.5 rounded-xl text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shadow-2xs max-w-full truncate hover:bg-pink-500/20 hover:border-pink-500/40 transition-colors cursor-pointer select-none",
            className
          )}
        >
          {count} tài khoản
        </span>
      </HoverCardTrigger>

      <HoverCardContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-72 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-2 z-50"
      >
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
            <Video className="w-3.5 h-3.5 text-pink-500" />
            <span>Dàn tài khoản ({count})</span>
          </div>
          {userId && linkToAccounts && (
            <Link
              href={`/accounts?operatorId=${userId}`}
              className="text-[11px] font-semibold text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors no-underline"
            >
              Xem tất cả →
            </Link>
          )}
        </div>

        {list.length === 0 ? (
          <div className="py-2.5 text-center text-xs text-slate-400 italic">
            {count === 0
              ? "Chưa được phân công tài khoản nào"
              : "Đang cập nhật danh sách tài khoản..."}
          </div>
        ) : (
          <div className="max-h-52 overflow-y-auto space-y-1 pr-0.5">
            {list.map((acc) => {
              const handle =
                acc.username || acc.uniqueId || acc.nickname || "account";
              const status = (acc.status || "ACTIVE").toUpperCase();
              return (
                <Link
                  key={acc.id}
                  href={`/accounts/${acc.id}`}
                  className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/90 dark:hover:bg-slate-800/90 transition-colors text-xs group cursor-pointer no-underline"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-600 flex items-center justify-center shrink-0 font-bold text-[10px] overflow-hidden group-hover:border-pink-500/40 transition-colors">
                      {acc.avatarThumb ? (
                        <img
                          src={acc.avatarThumb}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>@</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors truncate max-w-[130px] no-underline">
                        @{handle}
                      </div>
                      {(acc.country || acc.nickname) && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[130px]">
                          {acc.country || acc.nickname}
                        </div>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 uppercase",
                      status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : status === "WARMING"
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    )}
                  >
                    {status}
                  </span>
                </Link>
              );
            })}
            {count > list.length && (
              <div className="text-center text-[10px] text-slate-400 italic pt-1">
                +{count - list.length} tài khoản khác...
              </div>
            )}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

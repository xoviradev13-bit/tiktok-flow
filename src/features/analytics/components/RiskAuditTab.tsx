"use client";

import React from "react";
import { AlertTriangle, ShieldAlert, History, CheckCircle2, Info } from "lucide-react";

interface RiskAuditTabProps {
  alertsBreakdown: {
    bySeverity: { CRITICAL: number; WARNING: number; INFO: number };
    byType: Record<string, number>;
    recentAlerts: Array<{
      id: string;
      alertType: string;
      severity: string;
      description: string;
      status: string;
      createdAt: string | Date;
      account: { username: string };
    }>;
  };
  recentLogs: Array<{
    id: string;
    oldStatus: string | null;
    newStatus: string;
    logType: string;
    message: string;
    actorName: string;
    createdAt: string | Date;
    account: { username: string };
  }>;
}

export default function RiskAuditTab({ alertsBreakdown, recentLogs }: RiskAuditTabProps) {
  return (
    <div className="space-y-6">
      {/* 1. Alerts Severity Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {alertsBreakdown.bySeverity.CRITICAL}
            </div>
            <div className="text-xs font-semibold text-rose-700/80 dark:text-rose-300/80">
              Cảnh Báo Nghiêm Trọng (Critical)
            </div>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {alertsBreakdown.bySeverity.WARNING}
            </div>
            <div className="text-xs font-semibold text-amber-700/80 dark:text-amber-300/80">
              Cảnh Báo Chú Ý (Warning)
            </div>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
              {alertsBreakdown.bySeverity.INFO}
            </div>
            <div className="text-xs font-semibold text-blue-700/80 dark:text-blue-300/80">
              Thông Tin Hệ Thống (Info)
            </div>
          </div>
        </div>
      </div>

      {/* 2. Recent Risk Alerts List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-500" />
          Danh Sách Cảnh Báo Gần Nhất
        </h3>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {alertsBreakdown.recentAlerts.length === 0 ? (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 py-6 text-center font-medium">
              Không có cảnh báo rủi ro nào được ghi nhận trong phạm vi này.
            </div>
          ) : (
            alertsBreakdown.recentAlerts.map((al) => (
              <div key={al.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      @{al.account.username}
                    </span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.2 rounded ${
                        al.severity === "CRITICAL"
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {al.alertType}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    {al.description}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(al.createdAt).toLocaleDateString("vi-VN")}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Recent Audit Logs Timeline */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-500" />
          Nhật Ký Thay Đổi Trạng Thái & Audit Trail
        </h3>

        <div className="space-y-3">
          {recentLogs.length === 0 ? (
            <div className="text-xs text-slate-400 py-6 text-center">
              Chưa có lịch sử thay đổi trạng thái nào gần đây.
            </div>
          ) : (
            recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-pink-500" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">
                      @{log.account.username}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 mx-1.5">:</span>
                    <span className="text-slate-700 dark:text-slate-300">{log.message}</span>
                  </div>
                </div>

                <div className="text-right text-xs text-slate-400 shrink-0">
                  <span>{log.actorName}</span> •{" "}
                  <span>{new Date(log.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

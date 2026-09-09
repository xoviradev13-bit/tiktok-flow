"use client";

import React from "react";
import Link from "next/link";
import { Zap, ShieldCheck } from "lucide-react";
import {
  APP_ROUTES,
  FOOTER_PRODUCT_LINKS,
  FOOTER_DOC_LINKS,
  FOOTER_LEGAL_LINKS,
} from "@/constants/routes.config";

export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-12">
          {/* Col 1 & 2: Brand & Overview */}
          <div className="lg:col-span-2 space-y-4 max-w-md">
            <Link href={APP_ROUTES.HOME} className="flex flex-row items-center flex-nowrap gap-3 w-fit shrink-0 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-md shrink-0 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[9px] flex items-center justify-center">
                  <Zap className="w-4 h-4 text-pink-500 fill-pink-500" />
                </div>
              </div>
              <div className="flex flex-row items-center flex-nowrap gap-2 shrink-0">
                <span className="font-black text-lg tracking-tight text-slate-900 dark:text-white shrink-0">
                  TIKTOK<span className="text-pink-500">FLOW</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap shrink-0">
                  Online 99.9%
                </span>
              </div>
            </Link>

            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Nền tảng tự động hóa và quản trị dàn tài khoản TikTok quy mô lớn. Đồng bộ GPMLogin, tự động cào số liệu Creator Rewards, views và phân quyền nhân sự an toàn tuyệt đối.
            </p>

            <div className="pt-1 text-xs text-slate-400 dark:text-slate-500 font-medium">
              Chuyên biệt cho Studio & MCN vận hành tài khoản US, UK, DE, VN.
            </div>
          </div>

          {/* Col 3, 4, 5: 3 Column Links Grid */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-8">
            {/* Col 3: Vận Hành & Sản Phẩm */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Vận Hành & Sản Phẩm
              </div>
              <ul className="space-y-2.5 text-sm">
                {FOOTER_PRODUCT_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 4: Tài Liệu & Kỹ Thuật */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Tài Liệu & Hướng Dẫn
              </div>
              <ul className="space-y-2.5 text-sm">
                {FOOTER_DOC_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 5: Bảo Mật & Pháp Lý */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Bảo Mật & Pháp Lý
              </div>
              <ul className="space-y-2.5 text-sm">
                {FOOTER_LEGAL_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom copyright bar */}
        <div className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} TIKTOKFLOW Automation. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-pink-500" />
              <span>Tiêu chuẩn bảo mật OWASP Top 10</span>
            </span>
            <span>•</span>
            <span className="text-xs">Next.js 16 Enterprise Platform</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

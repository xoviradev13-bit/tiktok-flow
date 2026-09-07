import React from "react";
import Link from "next/link";
import { Zap } from "lucide-react";

interface AuthContainerProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: React.ReactNode;
}

export const AuthContainer = ({ children, title, subtitle }: AuthContainerProps) => {
  return (
    <div
      suppressHydrationWarning
      className="w-full bg-white dark:bg-slate-900/90 rounded-2xl shadow-xl dark:shadow-2xl border border-slate-200 dark:border-slate-800/80 overflow-hidden transition-colors"
    >
      <div className="p-8 sm:p-10">
        {/* Mobile-only Logo */}
        <div className="lg:hidden flex justify-center mb-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-md shadow-pink-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[9px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-pink-400 fill-pink-400" />
              </div>
            </div>
            <span className="font-black text-xl tracking-tight text-slate-900 dark:text-white">
              TIKTOK<span className="text-pink-500">FLOW</span>
            </span>
          </Link>
        </div>

        <div className="w-full">
          {title && (
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-1.5">
              {title}
            </h1>
          )}
          {subtitle && (
            <div className="text-slate-600 dark:text-slate-400 mb-6 text-sm leading-relaxed">
              {subtitle}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
};

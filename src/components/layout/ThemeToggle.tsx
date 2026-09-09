"use client";

import * as React from "react";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PUBLIC_THEME_KEY = "tiktokflow_public_theme";
const APP_THEME_KEY = "tiktokflow_app_theme";

export function ThemeToggle({ forceScope }: { forceScope?: "public" | "app" }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  // Check if current route is a public page
  const isPublicPage =
    forceScope === "public" ||
    (!forceScope &&
      (pathname === "/" ||
        pathname?.startsWith("/docs") ||
        pathname?.startsWith("/api-docs") ||
        pathname?.startsWith("/security") ||
        pathname?.startsWith("/terms") ||
        pathname?.startsWith("/privacy") ||
        pathname?.startsWith("/signin") ||
        pathname?.startsWith("/signup")));

  React.useEffect(() => {
    setMounted(true);

    // Synchronize active theme with respective scope storage
    if (typeof window !== "undefined") {
      if (isPublicPage) {
        const savedPublicTheme = localStorage.getItem(PUBLIC_THEME_KEY);
        if (savedPublicTheme) {
          if (savedPublicTheme !== theme) {
            setTheme(savedPublicTheme);
          }
        } else {
          // Default to light theme for all public pages unless user explicitly changes it
          setTheme("light");
        }
      } else {
        const savedAppTheme = localStorage.getItem(APP_THEME_KEY);
        if (savedAppTheme && savedAppTheme !== theme) {
          setTheme(savedAppTheme);
        }
      }
    }
  }, [isPublicPage]);

  if (!mounted) {
    return (
      <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs" />
    );
  }

  const handleSelectTheme = (newTheme: "light" | "dark" | "system") => {
    if (typeof window !== "undefined") {
      if (isPublicPage) {
        localStorage.setItem(PUBLIC_THEME_KEY, newTheme);
      } else {
        localStorage.setItem(APP_THEME_KEY, newTheme);
      }
    }
    setTheme(newTheme);
  };

  const currentTheme = theme || "system";
  const isDark = resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-all active:scale-95 shadow-xs cursor-pointer focus:outline-none"
              aria-label="Tùy chỉnh giao diện"
            >
              {currentTheme === "system" ? (
                isDark ? (
                  <Moon className="w-4 h-4 text-slate-300 transition-transform duration-200" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-500 transition-transform duration-200" />
                )
              ) : currentTheme === "dark" ? (
                <Moon className="w-4 h-4 text-pink-400 transition-transform duration-200" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500 transition-transform duration-200" />
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-medium">
          Giao diện {isPublicPage ? "trang web" : "hệ thống"} ({currentTheme === "light" ? "Sáng" : currentTheme === "dark" ? "Tối" : "Tự động"})
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-44 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-0.5 z-50 animate-in fade-in-0 zoom-in-95"
      >
        <div className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800/60 mb-1">
          {isPublicPage ? "Giao Diện Website" : "Giao Diện Ứng Dụng"}
        </div>

        <DropdownMenuItem
          onClick={() => handleSelectTheme("light")}
          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
            currentTheme === "light"
              ? "bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 font-bold"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-500" />
            <span>Sáng (Light)</span>
          </div>
          {currentTheme === "light" && <Check className="w-3.5 h-3.5 text-pink-500" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSelectTheme("dark")}
          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
            currentTheme === "dark"
              ? "bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 font-bold"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-pink-400" />
            <span>Tối (Dark)</span>
          </div>
          {currentTheme === "dark" && <Check className="w-3.5 h-3.5 text-pink-500" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSelectTheme("system")}
          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
            currentTheme === "system"
              ? "bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 font-bold"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Tự động (Auto)</span>
          </div>
          {currentTheme === "system" && <Check className="w-3.5 h-3.5 text-pink-500" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeToggle;

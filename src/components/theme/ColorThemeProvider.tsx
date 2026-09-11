"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ColorTheme = "pink" | "purple" | "blue" | "emerald" | "amber" | "rose";

export interface ColorThemeConfig {
  id: ColorTheme;
  name: string;
  subName: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  badgeBg: string;
  badgeText: string;
  gradientClass: string;
  swatchBg: string;
}

export const COLOR_THEMES: ColorThemeConfig[] = [
  {
    id: "pink",
    name: "TikTok Neon Pink",
    subName: "Hồng Neon (Mặc Định)",
    description: "Sắc hồng neon đặc trưng thương hiệu TikTok, trẻ trung và năng động.",
    primaryColor: "#db2777",
    secondaryColor: "#e11d48",
    badgeBg: "bg-pink-500/10 dark:bg-pink-500/20",
    badgeText: "text-pink-600 dark:text-pink-400",
    gradientClass: "from-pink-600 to-rose-600",
    swatchBg: "bg-gradient-to-tr from-pink-600 to-rose-600",
  },
  {
    id: "purple",
    name: "Cyber Violet",
    subName: "Tím Neon Cyber",
    description: "Tone tím công nghệ cao, hiện đại, bí ẩn và chiều sâu ấn tượng.",
    primaryColor: "#9333ea",
    secondaryColor: "#7c3aed",
    badgeBg: "bg-purple-500/10 dark:bg-purple-500/20",
    badgeText: "text-purple-600 dark:text-purple-400",
    gradientClass: "from-purple-600 to-indigo-600",
    swatchBg: "bg-gradient-to-tr from-purple-600 to-indigo-600",
  },
  {
    id: "blue",
    name: "Electric Ocean",
    subName: "Xanh Biển Điện Tử",
    description: "Màu xanh công nghệ mát mắt, tối ưu tập trung khi phân tích số liệu & tài chính.",
    primaryColor: "#0284c7",
    secondaryColor: "#2563eb",
    badgeBg: "bg-sky-500/10 dark:bg-sky-500/20",
    badgeText: "text-sky-600 dark:text-sky-400",
    gradientClass: "from-sky-600 to-blue-600",
    swatchBg: "bg-gradient-to-tr from-sky-600 to-blue-600",
  },
  {
    id: "emerald",
    name: "Matrix Emerald",
    subName: "Xanh Ngọc Lục Bảo",
    description: "Sắc xanh ngọc tươi sáng, mang lại cảm giác đột phá & sinh lời mạnh mẽ.",
    primaryColor: "#059669",
    secondaryColor: "#0d9488",
    badgeBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    gradientClass: "from-emerald-600 to-teal-600",
    swatchBg: "bg-gradient-to-tr from-emerald-600 to-teal-600",
  },
  {
    id: "amber",
    name: "Electric Gold",
    subName: "Vàng Hổ Phách",
    description: "Tông vàng ánh kim sang trọng, biểu trưng cho doanh thu và vận hành thịnh vượng.",
    primaryColor: "#d97706",
    secondaryColor: "#ea580c",
    badgeBg: "bg-amber-500/10 dark:bg-amber-500/20",
    badgeText: "text-amber-600 dark:text-amber-400",
    gradientClass: "from-amber-500 to-orange-600",
    swatchBg: "bg-gradient-to-tr from-amber-500 to-orange-600",
  },
  {
    id: "rose",
    name: "Crimson Flame",
    subName: "Đỏ Ruby Quyến Rũ",
    description: "Gam đỏ ruby rực lửa, nhiệt huyết, tạo cảm giác mạnh mẽ và quyết đoán.",
    primaryColor: "#e11d48",
    secondaryColor: "#dc2626",
    badgeBg: "bg-rose-500/10 dark:bg-rose-500/20",
    badgeText: "text-rose-600 dark:text-rose-400",
    gradientClass: "from-rose-600 to-red-600",
    swatchBg: "bg-gradient-to-tr from-rose-600 to-red-600",
  },
];

interface ColorThemeContextValue {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
  activeConfig: ColorThemeConfig;
}

const ColorThemeContext = createContext<ColorThemeContextValue>({
  colorTheme: "pink",
  setColorTheme: () => {},
  activeConfig: COLOR_THEMES[0],
});

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>("pink");

  useEffect(() => {
    try {
      const saved = (localStorage.getItem("tiktokflow_color_theme") as ColorTheme) || "pink";
      if (COLOR_THEMES.some((t) => t.id === saved)) {
        setColorThemeState(saved);
        document.documentElement.setAttribute("data-color-theme", saved);
      } else {
        document.documentElement.setAttribute("data-color-theme", "pink");
      }
    } catch {
      // ignore
    }
  }, []);

  const setColorTheme = (newTheme: ColorTheme) => {
    setColorThemeState(newTheme);
    try {
      localStorage.setItem("tiktokflow_color_theme", newTheme);
      document.documentElement.setAttribute("data-color-theme", newTheme);
    } catch {
      // ignore
    }
  };

  const activeConfig = COLOR_THEMES.find((t) => t.id === colorTheme) || COLOR_THEMES[0];

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme, activeConfig }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  return useContext(ColorThemeContext);
}

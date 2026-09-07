import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "@/components/providers/Providers";
import { mergeOpenGraph } from "@/utils/utilities/mergeOpenGraph";
import { getServerSideURL } from "@/utils/utilities/getURL";
import { auth } from "@/lib/auth";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TIKTOKFLOW – TikTok Fleet Automation & Creator Rewards Operations",
    template: "%s | TIKTOKFLOW",
  },

  description:
    "Nền tảng tự động hóa và quản trị dàn tài khoản TikTok quy mô lớn. Tích hợp GPMLogin API, kiểm soát checklist chấm công, theo dõi doanh thu và tối ưu RPM.",

  metadataBase: new URL(getServerSideURL()),
  manifest: "/site.webmanifest",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TIKTOKFLOW",
  },

  openGraph: mergeOpenGraph({
    title: "TIKTOKFLOW – TikTok Fleet Automation & Creator Rewards Operations",
    description:
      "Nền tảng tự động hóa và quản trị dàn tài khoản TikTok quy mô lớn. Tích hợp GPMLogin API, kiểm soát checklist chấm công, theo dõi doanh thu và tối ưu RPM.",
    siteName: "TIKTOKFLOW",
    locale: "vi_VN",
    type: "website",
  }),

  twitter: {
    card: "summary_large_image",
    site: "@tiktokflow",
    creator: "@tiktokflow",
    title: "TIKTOKFLOW – TikTok Fleet Automation & Creator Rewards Operations",
    description:
      "Nền tảng tự động hóa và quản trị dàn tài khoản TikTok quy mô lớn. Tích hợp GPMLogin API, kiểm soát checklist chấm công, theo dõi doanh thu và tối ưu RPM.",
    images: ["/images/og-image.png"],
  },

  icons: {
    icon: [
      {
        url: "/favicon.ico",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicon.ico",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    shortcut: "/favicon.ico",
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased bg-slate-950 text-slate-100 min-h-screen`}
        suppressHydrationWarning
      >
        <Providers session={session}>
          {children}
          <PwaInstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
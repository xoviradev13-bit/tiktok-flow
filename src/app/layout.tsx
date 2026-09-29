import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "@/components/providers/Providers";
import { mergeOpenGraph } from "@/utils/utilities/mergeOpenGraph";
import { getServerSideURL } from "@/utils/utilities/getURL";
import { auth } from "@/lib/auth";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import JsonLd from "@/components/seo/JsonLd";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "StreamDash – Video Fleet Operations & Creator Management Platform",
    template: "%s | StreamDash",
  },

  description:
    "Nền tảng tự động hóa và quản trị vận hành kênh video quy mô lớn. Tích hợp GPMLogin API, kiểm soát checklist chấm công, theo dõi doanh thu và tối ưu RPM.",

  keywords: [
    "StreamDash",
    "Video Fleet Automation",
    "Quản trị dàn kênh",
    "GPM-Login API",
    "Creator Rewards Management",
    "Checklist vận hành",
    "Tối ưu RPM",
    "Automation Operations",
    "MCN Operations Tool",
  ],

  authors: [{ name: "StreamDash Team", url: getServerSideURL() }],
  creator: "StreamDash",
  publisher: "StreamDash Technologies",
  category: "technology",

  metadataBase: new URL(getServerSideURL()),
  alternates: {
    canonical: "/",
  },
  manifest: "/site.webmanifest",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StreamDash",
  },

  openGraph: mergeOpenGraph({
    title: "StreamDash – Video Fleet Operations & Management Platform",
    description:
      "Nền tảng tự động hóa và quản trị vận hành kênh video quy mô lớn. Tích hợp GPMLogin API, kiểm soát checklist chấm công, theo dõi doanh thu và tối ưu RPM.",
    siteName: "StreamDash",
    locale: "vi_VN",
    type: "website",
  }),

  twitter: {
    card: "summary_large_image",
    site: "@streamdash",
    creator: "@streamdash",
    title: "StreamDash – Video Fleet Operations & Management Platform",
    description:
      "Nền tảng tự động hóa và quản trị vận hành kênh video quy mô lớn. Tích hợp GPMLogin API, kiểm soát checklist chấm công, theo dõi doanh thu và tối ưu RPM.",
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
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
      <head>
        <JsonLd />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var p = window.location.pathname;
                var isPublic = p === '/' || p.startsWith('/docs') || p.startsWith('/api-docs') || p.startsWith('/security') || p.startsWith('/terms') || p.startsWith('/privacy') || p.startsWith('/signin') || p.startsWith('/signup');
                if (isPublic) {
                  var saved = localStorage.getItem('streamdash_public_theme') || localStorage.getItem('tiktokflow_public_theme');
                  if (!saved || saved === 'light') {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.classList.add('light');
                    document.documentElement.style.colorScheme = 'light';
                  } else if (saved === 'dark') {
                    document.documentElement.classList.remove('light');
                    document.documentElement.classList.add('dark');
                    document.documentElement.style.colorScheme = 'dark';
                  }
                }
                var colorTheme = localStorage.getItem('streamdash_color_theme') || localStorage.getItem('tiktokflow_color_theme') || 'pink';
                document.documentElement.setAttribute('data-color-theme', colorTheme);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen transition-colors duration-200`}
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
import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tài Liệu Hướng Dẫn & Vận Hành Hệ Thống | TIKTOKFLOW Docs",
  description:
    "Tài liệu kỹ thuật và vận hành toàn diện: Hướng dẫn kết nối GPMLogin API local 9495, vận hành Chrome Extension, cài đặt Client Agent và quy trình checklist hàng ngày.",
  keywords: [
    "TIKTOKFLOW Docs",
    "Hướng dẫn GPMLogin",
    "Kết nối Port 9495",
    "TikTok Chrome Extension",
    "TikTok Client Agent",
    "Quy trình checklist TikTok",
  ],
  alternates: {
    canonical: "/docs",
  },
  openGraph: {
    title: "Tài Liệu Hướng Dẫn & Vận Hành Hệ Thống | TIKTOKFLOW Docs",
    description:
      "Tài liệu kỹ thuật và vận hành toàn diện: Hướng dẫn kết nối GPMLogin API local 9495, vận hành Chrome Extension, cài đặt Client Agent.",
    url: "/docs",
    type: "article",
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

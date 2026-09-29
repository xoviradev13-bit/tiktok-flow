import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tài Liệu Hướng Dẫn & Vận Hành Hệ Thống | StreamDash Docs",
  description:
    "Tài liệu kỹ thuật và vận hành toàn diện: Cơ chế tự động nhận diện GPMLogin API local, vận hành Chrome Extension, cài đặt Client Agent và quy trình checklist hàng ngày.",
  keywords: [
    "StreamDash Docs",
    "Hướng dẫn GPMLogin",
    "Tự động nhận diện GPMLogin API",
    "StreamDash Chrome Extension",
    "StreamDash Client Agent",
    "Quy trình checklist",
  ],
  alternates: {
    canonical: "/docs",
  },
  openGraph: {
    title: "Tài Liệu Hướng Dẫn & Vận Hành Hệ Thống | StreamDash Docs",
    description:
      "Tài liệu kỹ thuật và vận hành toàn diện: Cơ chế tự động nhận diện GPMLogin API local, vận hành Chrome Extension, cài đặt Client Agent.",
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

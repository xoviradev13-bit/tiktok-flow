import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Reference & Developer SDKs | TIKTOKFLOW API",
  description:
    "Tài liệu REST API chuẩn OpenAPI 3.0: Quản trị tài khoản, trigger profile GPM-Login, đồng bộ checklist và tích hợp Webhook cho hệ thống tự động hóa TikTok.",
  keywords: [
    "TIKTOKFLOW API",
    "TikTok Automation API",
    "GPMLogin API",
    "REST API TikTok",
    "OpenAPI 3.0",
    "TikTok Webhook",
  ],
  alternates: {
    canonical: "/api-docs",
  },
  openGraph: {
    title: "API Reference & Developer SDKs | TIKTOKFLOW API",
    description:
      "Tài liệu REST API chuẩn OpenAPI 3.0: Quản trị tài khoản, trigger profile GPM-Login, đồng bộ checklist.",
    url: "/api-docs",
    type: "article",
  },
};

export default function ApiDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

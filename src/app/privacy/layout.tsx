import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính Sách Quyền Riêng Tư | TIKTOKFLOW Privacy Policy",
  description:
    "Chính sách bảo vệ dữ liệu và quyền riêng tư tại TIKTOKFLOW. Cam kết không bán dữ liệu, cookie __Secure- và quyền xóa dữ liệu theo chuẩn GDPR/CCPA.",
  keywords: [
    "Chính sách quyền riêng tư",
    "TIKTOKFLOW Privacy",
    "Bảo mật thông tin",
    "GDPR",
    "CCPA",
  ],
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Chính Sách Quyền Riêng Tư | TIKTOKFLOW Privacy Policy",
    description: "Chính sách bảo vệ dữ liệu và quyền riêng tư tại TIKTOKFLOW.",
    url: "/privacy",
    type: "website",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

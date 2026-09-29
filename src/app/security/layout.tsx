import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bảo Mật & Tiêu Chuẩn Tuân Thủ | StreamDash Trust Center",
  description:
    "Trung tâm bảo mật StreamDash: Mã hóa AES-256 & TLS 1.3, xác thực an toàn OWASP Top 10, phân quyền RBAC đa lớp và chính sách Safe Harbor Bug Bounty.",
  keywords: [
    "StreamDash Security",
    "Bảo mật tài khoản",
    "OWASP Top 10",
    "Mã hóa AES-256",
    "Safe Harbor Bug Bounty",
    "Trust Center",
  ],
  alternates: {
    canonical: "/security",
  },
  openGraph: {
    title: "Bảo Mật & Tiêu Chuẩn Tuân Thủ | StreamDash Trust Center",
    description:
      "Trung tâm bảo mật StreamDash: Mã hóa AES-256 & TLS 1.3, xác thực an toàn OWASP Top 10.",
    url: "/security",
    type: "article",
  },
};

export default function SecurityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Điều Khoản Dịch Vụ | TIKTOKFLOW Terms of Service",
  description:
    "Điều khoản sử dụng dịch vụ nền tảng TIKTOKFLOW, cam kết chất lượng SLA 99.9%, chính sách quyền sở hữu tài khoản và trách nhiệm tuân thủ TikTok Policy.",
  keywords: [
    "Điều khoản dịch vụ",
    "TIKTOKFLOW Terms",
    "SLA 99.9%",
    "Chính sách sử dụng",
  ],
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Điều Khoản Dịch Vụ | TIKTOKFLOW Terms of Service",
    description: "Điều khoản sử dụng dịch vụ nền tảng TIKTOKFLOW và cam kết SLA 99.9%.",
    url: "/terms",
    type: "website",
  },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

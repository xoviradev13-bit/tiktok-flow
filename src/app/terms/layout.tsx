import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Điều Khoản Dịch Vụ | StreamDash Terms of Service",
  description:
    "Điều khoản sử dụng dịch vụ nền tảng StreamDash, cam kết chất lượng SLA 99.9%, chính sách quyền sở hữu tài khoản và tính độc lập của nền tảng.",
  keywords: [
    "Điều khoản dịch vụ",
    "StreamDash Terms",
    "SLA 99.9%",
    "Chính sách sử dụng",
  ],
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Điều Khoản Dịch Vụ | StreamDash Terms of Service",
    description: "Điều khoản sử dụng dịch vụ nền tảng StreamDash và cam kết SLA 99.9%.",
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

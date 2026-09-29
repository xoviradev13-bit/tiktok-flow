import React from "react";
import { getServerSideURL } from "@/utils/utilities/getURL";

export default function JsonLd() {
  const baseUrl = getServerSideURL();

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "StreamDash",
    alternateName: "StreamDash Fleet Operations",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Windows, macOS, Linux, Chrome",
    url: baseUrl,
    description:
      "Nền tảng tự động hóa và quản trị vận hành kênh video quy mô lớn. Tích hợp GPMLogin API, kiểm soát checklist chấm công, theo dõi doanh thu và tối ưu RPM.",
    softwareVersion: "2.4.0",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      ratingCount: "128",
      bestRating: "5",
      worstRating: "1",
    },
    featureList: [
      "Quản lý dàn kênh video tập trung",
      "Tích hợp GPMLogin API Local Port 9495",
      "Checklist quy trình & chấm công tự động",
      "Báo cáo doanh thu & tối ưu RPM",
      "Chrome Extension & Native Client Agent tự động hóa",
    ],
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "StreamDash",
    url: baseUrl,
    logo: `${baseUrl}/icons/icon-512x512.png`,
    description:
      "Giải pháp tự động hóa vận hành Media Agency và Creator Rewards chuyên nghiệp.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "huynhphihung0403@gmail.com",
      availableLanguage: ["Vietnamese", "English"],
    },
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "StreamDash",
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/docs?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
      />
    </>
  );
}

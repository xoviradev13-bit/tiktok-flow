"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Code2,
  Zap,
  Key,
  Copy,
  Check,
  Globe,
  Lock,
  ChevronRight,
  Server,
  ShieldCheck,
  ExternalLink,
  Terminal,
  Layers,
  ArrowRight,
} from "lucide-react";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import { APP_ROUTES } from "@/constants/routes.config";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

type EndpointId =
  | "client_sync"
  | "extension_report"
  | "gpm_scan"
  | "gpm_sync"
  | "sweeper"
  | "cron_cutoff"
  | "cron_sync";

interface ApiEndpoint {
  id: EndpointId;
  method: "GET" | "POST";
  path: string;
  title: string;
  desc: string;
  auth: "Personal Token" | "CRON_SECRET" | "Session / Secret";
  headers: { name: string; type: string; required: boolean; desc: string }[];
  bodyParams?: { name: string; type: string; required: boolean; desc: string }[];
  snippets: {
    curl: string;
    typescript: string;
    python: string;
  };
  responseExample: string;
}

const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: "client_sync",
    method: "POST",
    path: "/api/gpm/client-sync",
    title: "Client Agent Profile Sync",
    desc: "Được gọi từ TikTokFlow Client Agent Worker chạy ngầm trên máy trạm để đồng bộ danh sách profile GPMLogin lên máy chủ trung tâm.",
    auth: "Personal Token",
    headers: [
      { name: "Authorization", type: "string", required: true, desc: "Bearer <personalToken>" },
      { name: "Content-Type", type: "string", required: true, desc: "application/json" },
    ],
    bodyParams: [
      { name: "profiles", type: "array", required: true, desc: "Danh sách profiles GPMLogin ({ id, name, rawGroup })" },
      { name: "agentVersion", type: "string", required: false, desc: "Phiên bản Client Agent (VD: 1.0.0)" },
    ],
    snippets: {
      curl: `curl -X POST "https://your-domain.com/api/gpm/client-sync" \\
  -H "Authorization: Bearer ttf_sec_9876543210abcdef" \\
  -H "Content-Type: application/json" \\
  -d '{
    "profiles": [
      { "id": "uuid-1234", "name": "tiktok_us_01", "rawGroup": "TeamA" }
    ],
    "agentVersion": "1.0.0"
  }'`,
      typescript: `const response = await fetch("https://your-domain.com/api/gpm/client-sync", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ttf_sec_9876543210abcdef",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    profiles: [
      { id: "uuid-1234", name: "tiktok_us_01", rawGroup: "TeamA" }
    ],
    agentVersion: "1.0.0"
  }),
});
const data = await response.json();
console.log(data);`,
      python: `import requests

url = "https://your-domain.com/api/gpm/client-sync"
headers = {
    "Authorization": "Bearer ttf_sec_9876543210abcdef",
    "Content-Type": "application/json"
}
payload = {
    "profiles": [
        {"id": "uuid-1234", "name": "tiktok_us_01", "rawGroup": "TeamA"}
    ],
    "agentVersion": "1.0.0"
}

res = requests.post(url, json=payload, headers=headers)
print(res.json())`,
    },
    responseExample: `{
  "success": true,
  "synced": 1,
  "message": "Đã đồng bộ 1 profile GPMLogin thành công."
}`,
  },
  {
    id: "extension_report",
    method: "POST",
    path: "/api/extension/report",
    title: "Extension Revenue & Metrics Report",
    desc: "Được gọi tự động từ TikTokFlow Companion Extension để đẩy dữ liệu doanh thu Creator Rewards, lượt xem và RPM về máy chủ.",
    auth: "Personal Token",
    headers: [
      { name: "Authorization", type: "string", required: true, desc: "Bearer <personalToken>" },
      { name: "Content-Type", type: "string", required: true, desc: "application/json" },
    ],
    bodyParams: [
      { name: "username", type: "string", required: true, desc: "Handle TikTok không kèm ký tự @" },
      { name: "totalRevenue", type: "number", required: false, desc: "Tổng doanh thu tích lũy (USD)" },
      { name: "totalViews", type: "number", required: false, desc: "Tổng số lượt xem video hợp lệ" },
      { name: "rpm", type: "number", required: false, desc: "Chỉ số RPM trung bình" },
      { name: "date", type: "string", required: false, desc: "Ngày báo cáo (YYYY-MM-DD)" },
    ],
    snippets: {
      curl: `curl -X POST "https://your-domain.com/api/extension/report" \\
  -H "Authorization: Bearer ttf_sec_9876543210abcdef" \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "creator_studio_us",
    "totalRevenue": 1250.50,
    "totalViews": 2400000,
    "rpm": 0.85
  }'`,
      typescript: `const response = await fetch("https://your-domain.com/api/extension/report", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ttf_sec_9876543210abcdef",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    username: "creator_studio_us",
    totalRevenue: 1250.50,
    totalViews: 2400000,
    rpm: 0.85
  }),
});
const data = await response.json();`,
      python: `import requests

url = "https://your-domain.com/api/extension/report"
headers = {
    "Authorization": "Bearer ttf_sec_9876543210abcdef",
    "Content-Type": "application/json"
}
data = {
    "username": "creator_studio_us",
    "totalRevenue": 1250.50,
    "totalViews": 2400000,
    "rpm": 0.85
}
res = requests.post(url, json=data, headers=headers)
print(res.json())`,
    },
    responseExample: `{
  "success": true,
  "accountId": "clxyz12345",
  "updated": true,
  "message": "Cập nhật số liệu tài khoản thành công."
}`,
  },
  {
    id: "gpm_scan",
    method: "GET",
    path: "/api/gpm/scan",
    title: "GPMLogin Port 9495 Health & Discovery",
    desc: "Kiểm tra tình trạng hoạt động của API local GPM-Login và phát hiện danh sách profile hiện có trên máy tính.",
    auth: "Session / Secret",
    headers: [
      { name: "Content-Type", type: "string", required: true, desc: "application/json" },
    ],
    snippets: {
      curl: `curl -X GET "https://your-domain.com/api/gpm/scan"`,
      typescript: `const res = await fetch("https://your-domain.com/api/gpm/scan");
const data = await res.json();`,
      python: `import requests
res = requests.get("https://your-domain.com/api/gpm/scan")
print(res.json())`,
    },
    responseExample: `{
  "isOnline": true,
  "port": 9495,
  "totalProfiles": 45,
  "message": "Kết nối GPMLogin local thành công."
}`,
  },
  {
    id: "cron_cutoff",
    method: "POST",
    path: "/api/cron/cutoff",
    title: "10:00 AM KPI Workday Cutoff",
    desc: "Job tự động hóa kích hoạt chốt sổ chấm công lúc 10:00 sáng hàng ngày để đánh giá tỷ lệ hoàn thành checklist của từng nhân sự.",
    auth: "CRON_SECRET",
    headers: [
      { name: "Authorization", type: "string", required: true, desc: "Bearer <CRON_SECRET>" },
    ],
    snippets: {
      curl: `curl -X POST "https://your-domain.com/api/cron/cutoff" \\
  -H "Authorization: Bearer my_cron_secret_key"`,
      typescript: `const res = await fetch("https://your-domain.com/api/cron/cutoff", {
  method: "POST",
  headers: { "Authorization": "Bearer my_cron_secret_key" },
});`,
      python: `import requests
res = requests.post(
    "https://your-domain.com/api/cron/cutoff",
    headers={"Authorization": "Bearer my_cron_secret_key"}
)
print(res.json())`,
    },
    responseExample: `{
  "success": true,
  "date": "2026-09-09",
  "evaluatedUsers": 12,
  "message": "Chốt sổ ngày công 10:00 AM thành công."
}`,
  },
];

export default function ApiDocsPage() {
  const { data: session } = useSession();
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint>(API_ENDPOINTS[0]);
  const [selectedLang, setSelectedLang] = useState<"curl" | "typescript" | "python">("curl");
  const [copied, setCopied] = useState(false);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Đã sao chép đoạn mã mẫu!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-pink-500 selection:text-white font-sans antialiased transition-colors">
      {/* Top Navbar */}
      <PublicHeader badge="API Reference v1" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mobile Endpoint Quick Switcher Tabs (lg:hidden) */}
        <div className="lg:hidden mb-6 -mx-4 px-4 sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-2">
            {API_ENDPOINTS.map((ep) => {
              const isSelected = selectedEndpoint.id === ep.id;
              return (
                <button
                  key={ep.id}
                  onClick={() => setSelectedEndpoint(ep)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? "bg-pink-600 text-white shadow-md shadow-pink-600/20"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-black font-mono ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : ep.method === "POST"
                        ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                        : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span>{ep.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          {/* Left Endpoints List (Desktop) */}
          <aside className="hidden lg:block lg:col-span-1 space-y-4 lg:sticky lg:top-24">
            <div className="space-y-1">
              <div className="px-3 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Xác Thực & Tích Hợp
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-xs">
                <div className="flex items-center gap-2 text-pink-600 dark:text-pink-400 font-bold text-sm">
                  <Key className="w-4 h-4" />
                  <span>Personal Token</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Lấy token trong mục <em>Cài Đặt ➔ Tab Personal Token</em> và gửi qua Header:
                </p>
                <code className="text-xs bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-lg block font-mono text-slate-800 dark:text-slate-300 select-all">
                  Authorization: Bearer ttf_sec_...
                </code>
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <div className="px-3 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                RESTful Endpoints
              </div>
              <div className="space-y-1 bg-white dark:bg-slate-900/60 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-xs">
                {API_ENDPOINTS.map((ep) => {
                  const isSelected = selectedEndpoint.id === ep.id;
                  return (
                    <button
                      key={ep.id}
                      onClick={() => setSelectedEndpoint(ep)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                        isSelected
                          ? "border-pink-500/60 bg-pink-50 dark:bg-pink-950/20 text-pink-700 dark:text-white shadow-xs font-bold"
                          : "border-transparent text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{ep.title}</div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {ep.path}
                        </div>
                      </div>
                      <span
                        className={`ml-2 px-1.5 py-0.5 rounded text-xs font-black font-mono ${
                          ep.method === "POST" ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {ep.method}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Right Main API Detail */}
          <main className="lg:col-span-3 bg-white dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800/80 rounded-3xl p-6 sm:p-10 shadow-md space-y-8 transition-colors">
            {/* Endpoint Header */}
            <div className="space-y-3 pb-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-black font-mono ${
                    selectedEndpoint.method === "POST"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {selectedEndpoint.method}
                </span>
                <span className="font-mono text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {selectedEndpoint.path}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Auth: {selectedEndpoint.auth}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{selectedEndpoint.title}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                {selectedEndpoint.desc}
              </p>
            </div>

            {/* Request Headers */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Request Headers
              </h3>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950/60 shadow-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Header</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Bắt Buộc</th>
                      <th className="px-4 py-3">Mô Tả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-sm">
                    {selectedEndpoint.headers.map((h, i) => (
                      <tr key={i} className="text-slate-800 dark:text-slate-300">
                        <td className="px-4 py-3 font-mono font-bold text-pink-600 dark:text-pink-400 text-xs sm:text-sm">{h.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{h.type}</td>
                        <td className="px-4 py-3 text-xs">
                          {h.required ? (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">Có</span>
                          ) : (
                            <span className="text-slate-500">Tùy chọn</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{h.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Request Body Parameters */}
            {selectedEndpoint.bodyParams && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Request Body JSON
                </h3>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950/60 shadow-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Field</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Bắt Buộc</th>
                        <th className="px-4 py-3">Mô Tả</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-sm">
                      {selectedEndpoint.bodyParams.map((b, i) => (
                        <tr key={i} className="text-slate-800 dark:text-slate-300">
                          <td className="px-4 py-3 font-mono font-bold text-cyan-600 dark:text-cyan-400 text-xs sm:text-sm">{b.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{b.type}</td>
                          <td className="px-4 py-3 text-xs">
                            {b.required ? (
                              <span className="text-rose-600 dark:text-rose-400 font-bold">Có</span>
                            ) : (
                              <span className="text-slate-500">Không</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{b.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Code Samples with Multi-Language Switcher */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Mã Nguồn Mẫu (Code Snippet)
                </h3>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
                  <button
                    onClick={() => setSelectedLang("curl")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedLang === "curl"
                        ? "bg-pink-600 text-white shadow-xs"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    cURL
                  </button>
                  <button
                    onClick={() => setSelectedLang("typescript")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedLang === "typescript"
                        ? "bg-pink-600 text-white shadow-xs"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    TypeScript
                  </button>
                  <button
                    onClick={() => setSelectedLang("python")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedLang === "python"
                        ? "bg-pink-600 text-white shadow-xs"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Python
                  </button>
                </div>
              </div>

              {/* Code Box */}
              <div className="relative rounded-2xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs sm:text-sm text-slate-200 overflow-x-auto shadow-inner leading-relaxed">
                <button
                  onClick={() => handleCopy(selectedEndpoint.snippets[selectedLang])}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                  title="Sao chép mã"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <pre className="pr-12">{selectedEndpoint.snippets[selectedLang]}</pre>
              </div>
            </div>

            {/* Response Example */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Response Mẫu (200 OK)
              </h3>
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs sm:text-sm text-emerald-400 overflow-x-auto leading-relaxed">
                <pre>{selectedEndpoint.responseExample}</pre>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Shared Public Footer */}
      <PublicFooter />
    </div>
  );
}

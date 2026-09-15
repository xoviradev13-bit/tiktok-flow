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
  | "extension_challenge"
  | "extension_pair"
  | "extension_session"
  | "client_sync"
  | "extension_report"
  | "verify_token"
  | "gpm_scan"
  | "gpm_sync"
  | "sweeper"
  | "cron_cutoff"
  | "cron_sync"
  | "cron_extension_purge";

interface ApiEndpoint {
  id: EndpointId;
  method: "GET" | "POST";
  path: string;
  title: string;
  desc: string;
  auth: "Personal Token" | "Mã phiên" | "Mã kích hoạt" | "CRON_SECRET" | "Session / Secret" | "Không cần";
  headers: { name: string; type: string; required: boolean; desc: string }[];
  bodyParams?: { name: string; type: string; required: boolean; desc: string }[];
  errorNotes?: string[];
  snippets: {
    curl: string;
    typescript: string;
    python: string;
  };
  responseExample: string;
}

const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: "extension_challenge",
    method: "GET",
    path: "/api/extension/challenge",
    title: "Lấy mốc thời gian kích hoạt",
    desc: "Extension/Agent gọi API này để lấy mốc thời gian trước khi kích hoạt gói hoặc tạo phiên. Không cần token. Đảm bảo Client Agent đang chạy trên máy trước khi Extension kích hoạt lần đầu.",
    auth: "Không cần",
    headers: [],
    errorNotes: [
      "429 — Gọi quá nhiều từ cùng IP, đợi rồi thử lại",
    ],
    snippets: {
      curl: `curl "https://your-domain.com/api/extension/challenge"`,
      typescript: `const res = await fetch("/api/extension/challenge");
const { challengeTs } = await res.json();`,
      python: `import requests
print(requests.get("https://your-domain.com/api/extension/challenge").json())`,
    },
    responseExample: `{ "challengeTs": 1735689600000 }`,
  },
  {
    id: "extension_pair",
    method: "POST",
    path: "/api/extension/pair",
    title: "Kích hoạt gói vừa tải",
    desc: "Khi bạn tải Extension hoặc Client Agent, trong file cấu hình có một mã kích hoạt dùng một lần (khoảng 10 phút). Extension/Agent tự gọi API này lần đầu để liên kết với tài khoản — bạn không cần dán mã thủ công nếu còn hạn. Extension cần Client Agent đang chạy trên cùng máy khi kích hoạt lần đầu.",
    auth: "Mã kích hoạt",
    headers: [
      { name: "Content-Type", type: "string", required: true, desc: "application/json" },
    ],
    bodyParams: [
      {
        name: "pairingCode",
        type: "string",
        required: true,
        desc: "Mã kích hoạt trong config.json (bắt đầu bằng ttf_pair_)",
      },
    ],
    errorNotes: [
      "401 — Mã sai, đã dùng, hoặc hết hạn — tải lại file Zip hoặc dán Personal Token trong Settings",
      "403 — Admin đã khóa quyền Extension, hoặc thiếu Client Agent đang chạy trên máy",
      "429 — Thử quá nhiều lần, đợi rồi thử lại",
    ],
    snippets: {
      curl: `curl -X POST "https://your-domain.com/api/extension/pair" \\
  -H "Content-Type: application/json" \\
  -d '{ "pairingCode": "ttf_pair_xxxxxxxx" }'`,
      typescript: `const res = await fetch("/api/extension/pair", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pairingCode: "ttf_pair_xxxxxxxx" }),
});`,
      python: `import requests
print(requests.post("https://your-domain.com/api/extension/pair", json={"pairingCode": "ttf_pair_xxxxxxxx"}).json())`,
    },
    responseExample: `{
  "success": true,
  "personalToken": "ttf_sec_...",
  "accessToken": "<jwt>",
  "expiresIn": 900,
  "refreshToken": "ttf_rt_..."
}`,
  },
  {
    id: "extension_session",
    method: "POST",
    path: "/api/extension/session",
    title: "Tạo / gia hạn phiên làm việc",
    desc: "Đổi Personal Token thành mã phiên ngắn hạn (khoảng 15 phút) để gọi các API đồng bộ. Extension và Client Agent tự làm bước này. Lần tạo phiên mới (Personal Token) cần Client Agent đang chạy trên máy; gia hạn bằng refreshToken thì không cần.",
    auth: "Personal Token",
    headers: [
      {
        name: "Authorization",
        type: "string",
        required: false,
        desc: "Bearer kèm Personal Token khi tạo phiên mới",
      },
      { name: "Content-Type", type: "string", required: true, desc: "application/json" },
    ],
    bodyParams: [
      {
        name: "refreshToken",
        type: "string",
        required: false,
        desc: "Mã làm mới phiên (khi phiên cũ sắp hết hạn)",
      },
    ],
    errorNotes: [
      "401 — Token sai hoặc phiên đã bị hủy — xác thực lại / tải gói mới",
      "403 — Admin đã khóa quyền Extension, hoặc thiếu Client Agent đang chạy (khi tạo phiên mới)",
      "500 — Máy chủ chưa cấu hình secret phiên (môi trường production)",
    ],
    snippets: {
      curl: `curl -X POST "https://your-domain.com/api/extension/session" \\
  -H "Authorization: Bearer ttf_sec_..." \\
  -H "Content-Type: application/json" -d '{}'`,
      typescript: `await fetch("/api/extension/session", {
  method: "POST",
  headers: { Authorization: "Bearer ttf_sec_...", "Content-Type": "application/json" },
  body: "{}",
});`,
      python: `import requests
requests.post("https://your-domain.com/api/extension/session", headers={"Authorization": "Bearer ttf_sec_..."}, json={})`,
    },
    responseExample: `{ "success": true, "accessToken": "<jwt>", "expiresIn": 900, "refreshToken": "ttf_rt_..." }`,
  },
  {
    id: "client_sync",
    method: "POST",
    path: "/api/gpm/client-sync",
    title: "Đồng bộ profile GPMLogin",
    desc: "Client Agent gửi danh sách profile GPMLogin trên máy lên hệ thống. Cần mã phiên hợp lệ (lấy từ bước tạo phiên ở trên).",
    auth: "Mã phiên",
    headers: [
      {
        name: "Authorization",
        type: "string",
        required: true,
        desc: "Bearer kèm mã phiên (access token)",
      },
      { name: "Content-Type", type: "string", required: true, desc: "application/json" },
    ],
    bodyParams: [
      {
        name: "profiles",
        type: "array",
        required: true,
        desc: "Danh sách profile GPM (id, tên, nhóm…). Chỉ gửi tài khoản đã xác minh, không lấy handle từ lịch sử duyệt web.",
      },
      {
        name: "userEmail",
        type: "string",
        required: false,
        desc: "Email/username nhân sự (tuỳ chọn). Nếu gửi phải đúng chủ token.",
      },
    ],
    errorNotes: [
      "401 — Chưa đăng nhập / phiên hết hạn / token đã bị thu hồi",
      "403 — Quyền bị khóa, hoặc email không khớp tài khoản",
    ],
    snippets: {
      curl: `curl -X POST "https://your-domain.com/api/gpm/client-sync" \\
  -H "Authorization: Bearer <accessToken>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userEmail": "staff@company.com",
    "profiles": [
      { "id": "uuid-1234", "name": "tiktok_us_01", "group_id": "TeamA" }
    ]
  }'`,
      typescript: `const response = await fetch("https://your-domain.com/api/gpm/client-sync", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <accessToken>",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    userEmail: "staff@company.com",
    profiles: [
      { id: "uuid-1234", name: "tiktok_us_01", group_id: "TeamA" }
    ],
  }),
});
if (response.status === 401 || response.status === 403) {
  // Token revoked — Client Agent clears local token and requires re-auth
}
const data = await response.json();
console.log(data);`,
      python: `import requests

url = "https://your-domain.com/api/gpm/client-sync"
headers = {
    "Authorization": "Bearer <accessToken>",
    "Content-Type": "application/json"
}
payload = {
    "userEmail": "staff@company.com",
    "profiles": [
        {"id": "uuid-1234", "name": "tiktok_us_01", "group_id": "TeamA"}
    ]
}

res = requests.post(url, json=payload, headers=headers)
print(res.status_code, res.json())`,
    },
    responseExample: `{
  "success": true,
  "message": "Đồng bộ hoàn tất cho Staff Name: 1 tạo mới, 0 cập nhật.",
  "totalScanned": 1,
  "newImportedCount": 1,
  "updatedCount": 0
}`,
  },
  {
    id: "extension_report",
    method: "POST",
    path: "/api/extension/report",
    title: "Gửi báo cáo tài khoản TikTok",
    desc: "Extension hoặc Client Agent gửi thông tin tài khoản về máy chủ (cần mã phiên hợp lệ). Extension thường chỉ gửi danh tính / đăng nhập / gắn GPM (source: extension). Client Agent gửi số liệu đầy đủ như lượt xem, doanh thu (source: agent). Không gửi Personal Token trong nội dung JSON.",
    auth: "Mã phiên",
    headers: [
      {
        name: "Authorization",
        type: "string",
        required: true,
        desc: "Bearer kèm mã phiên (access token)",
      },
      { name: "Content-Type", type: "string", required: true, desc: "application/json" },
    ],
    bodyParams: [
      { name: "username", type: "string", required: true, desc: "Handle TikTok đang đăng nhập" },
      { name: "isLoggedIn", type: "boolean", required: true, desc: "true nếu đã đăng nhập TikTok" },
      { name: "source", type: "string", required: false, desc: "\"extension\" (chỉ danh tính) hoặc \"agent\" (có số liệu)" },
      { name: "gpmProfileId", type: "string", required: false, desc: "ID profile GPM gắn với tài khoản (nếu có)" },
      { name: "totalRevenue", type: "number", required: false, desc: "Tổng doanh thu (thường từ Client Agent)" },
      { name: "currency", type: "string", required: false, desc: "Đơn vị tiền ($, £, €, ₫, …)" },
      { name: "totalViews", type: "number", required: false, desc: "Tổng lượt xem (thường từ Client Agent)" },
      { name: "followersCount", type: "number", required: false, desc: "Số người theo dõi (thường từ Client Agent)" },
      { name: "rpm", type: "number", required: false, desc: "RPM trung bình (thường từ Client Agent)" },
      { name: "creatorRewardsRevenue", type: "number", required: false, desc: "Doanh thu Creator Rewards" },
      { name: "liveRewardsRevenue", type: "number", required: false, desc: "Doanh thu LIVE Rewards" },
      { name: "tiktokShopRevenue", type: "number", required: false, desc: "Doanh thu TikTok Shop" },
    ],
    errorNotes: [
      "401 — Phiên hết hạn hoặc token bị thu hồi — Extension hiện yêu cầu đăng nhập lại",
      "403 — Admin đã tắt quyền Extension / Agent",
    ],
    snippets: {
      curl: `curl -X POST "https://your-domain.com/api/extension/report" \\
  -H "Authorization: Bearer <accessToken>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "creator_studio_us",
    "isLoggedIn": true,
    "source": "agent",
    "totalRevenue": 1250.50,
    "currency": "$",
    "totalViews": 2400000,
    "followersCount": 18500,
    "rpm": 0.85
  }'`,
      typescript: `const response = await fetch("https://your-domain.com/api/extension/report", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <accessToken>",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    username: "creator_studio_us",
    isLoggedIn: true,
    source: "agent",
    totalRevenue: 1250.50,
    currency: "$",
    totalViews: 2400000,
    followersCount: 18500,
    rpm: 0.85,
  }),
});
if (response.status === 401 || response.status === 403) {
  // Clear local token and show re-auth UI
}
const data = await response.json();`,
      python: `import requests

url = "https://your-domain.com/api/extension/report"
headers = {
    "Authorization": "Bearer <accessToken>",
    "Content-Type": "application/json"
}
data = {
    "username": "creator_studio_us",
    "isLoggedIn": True,
    "source": "agent",
    "totalRevenue": 1250.50,
    "currency": "$",
    "totalViews": 2400000,
    "followersCount": 18500,
    "rpm": 0.85
}
res = requests.post(url, json=data, headers=headers)
print(res.status_code, res.json())`,
    },
    responseExample: `{
  "success": true,
  "accountId": "clxyz12345",
  "updated": true,
  "message": "Cập nhật số liệu tài khoản thành công."
}`,
  },
  {
    id: "verify_token",
    method: "POST",
    path: "/api/extension/verify-token",
    title: "Kiểm tra Personal Token",
    desc: "Kiểm tra Personal Token còn dùng được trước khi lưu vào popup Extension hoặc Client Agent (setup-agent.bat phím 3). Hữu ích sau khi Admin thu hồi hoặc cấp lại token.",
    auth: "Personal Token",
    headers: [
      {
        name: "Authorization",
        type: "string",
        required: false,
        desc: "Bearer kèm Personal Token (khuyến nghị)",
      },
      { name: "Content-Type", type: "string", required: true, desc: "application/json" },
    ],
    bodyParams: [
      {
        name: "token",
        type: "string",
        required: true,
        desc: "Personal Token cần kiểm tra (bắt đầu bằng ttf_sec_)",
      },
    ],
    errorNotes: [
      "400 — Sai định dạng token",
      "401 — Token không tồn tại hoặc đã bị thay bằng token mới",
      "403 — Tài khoản bị khóa / quyền Extension bị tắt",
    ],
    snippets: {
      curl: `curl -X POST "https://your-domain.com/api/extension/verify-token" \\
  -H "Authorization: Bearer ttf_sec_9876543210abcdef" \\
  -H "Content-Type: application/json" \\
  -d '{ "token": "ttf_sec_9876543210abcdef" }'`,
      typescript: `const response = await fetch("https://your-domain.com/api/extension/verify-token", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ttf_sec_9876543210abcdef",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ token: "ttf_sec_9876543210abcdef" }),
});
const data = await response.json();
// { valid: true, user: { name, email, role } }`,
      python: `import requests

res = requests.post(
    "https://your-domain.com/api/extension/verify-token",
    headers={
        "Authorization": "Bearer ttf_sec_9876543210abcdef",
        "Content-Type": "application/json",
    },
    json={"token": "ttf_sec_9876543210abcdef"},
)
print(res.json())`,
    },
    responseExample: `{
  "success": true,
  "valid": true,
  "user": {
    "id": "cluser123",
    "name": "Dat Nguyen",
    "email": "staff@company.com",
    "role": "STAFF"
  },
  "message": "Xác thực thành công cho nhân sự: Dat Nguyen"
}`,
  },
  {
    id: "gpm_scan",
    method: "GET",
    path: "/api/gpm/scan",
    title: "Kiểm tra GPMLogin trên máy",
    desc: "Xem GPMLogin trên máy có đang chạy không và có bao nhiêu profile.",
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
    title: "Chốt sổ chấm công 10:00",
    desc: "Job tự động chốt checklist ngày công lúc 10:00 sáng (chỉ dành cho hệ thống / lịch chạy nội bộ).",
    auth: "CRON_SECRET",
    headers: [
      { name: "Authorization", type: "string", required: true, desc: "Bearer kèm mã bí mật cron của máy chủ" },
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
  {
    id: "cron_extension_purge",
    method: "POST",
    path: "/api/cron/extension-auth-purge",
    title: "Dọn dữ liệu phiên cũ",
    desc: "Job nội bộ xóa mã phiên / mã kích hoạt đã hết hạn và nhật ký sự cố xác thực cũ (chỉ dành cho lịch chạy máy chủ).",
    auth: "CRON_SECRET",
    headers: [
      { name: "Authorization", type: "string", required: true, desc: "Bearer kèm mã bí mật cron của máy chủ" },
    ],
    snippets: {
      curl: `curl -X POST "https://your-domain.com/api/cron/extension-auth-purge" \\
  -H "Authorization: Bearer my_cron_secret_key"`,
      typescript: `await fetch("/api/cron/extension-auth-purge", {
  method: "POST",
  headers: { Authorization: "Bearer my_cron_secret_key" },
});`,
      python: `import requests
print(requests.post("https://your-domain.com/api/cron/extension-auth-purge", headers={"Authorization": "Bearer my_cron_secret_key"}).json())`,
    },
    responseExample: `{ "success": true, "refreshDeleted": 3, "eventsDeleted": 0, "pairingDeleted": 1 }`,
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
                  <span>Cách Extension / Agent kết nối</span>
                </div>
                <ol className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed list-decimal pl-4 space-y-1.5">
                  <li>Tải file ZIP từ Kho Tiện Ích — trong gói có mã liên kết dùng một lần (khoảng 10 phút).</li>
                  <li>Chạy Client Agent trước (<code className="font-mono text-xs">setup-agent.bat</code> phím 1), rồi nạp Extension vào GPMLogin.</li>
                  <li>Lần đầu kích hoạt: tự gắn với tài khoản của bạn (Agent phải đang chạy trên máy).</li>
                  <li>Extension nhận biết tài khoản đang đăng nhập; Client Agent gửi số liệu TikTok về hệ thống.</li>
                  <li>Mã hết hạn hoặc Admin thu hồi? Tải lại Zip, hoặc copy Personal Token trong Cài đặt rồi dán vào Extension / setup-agent phím 3.</li>
                </ol>
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <div className="px-3 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Danh sách API
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
                Headers yêu cầu
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
                  Tham số body (JSON)
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

            {/* Auth / revoke error notes */}
            {selectedEndpoint.errorNotes && selectedEndpoint.errorNotes.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Lỗi Xác Thực Thường Gặp
                </h3>
                <ul className="rounded-2xl border border-rose-200/80 dark:border-rose-900/40 bg-rose-50/80 dark:bg-rose-950/20 p-4 space-y-2 text-sm text-rose-800 dark:text-rose-300">
                  {selectedEndpoint.errorNotes.map((note, i) => (
                    <li key={i} className="leading-relaxed flex gap-2">
                      <span className="font-bold shrink-0">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Code Samples with Multi-Language Switcher */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Ví dụ gọi API
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
                Ví dụ phản hồi thành công
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

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding default extensions & client agents...");

  // 1. TikTokFlow Companion (Chrome Extension)
  const companion = await prisma.extension.upsert({
    where: { slug: "tiktokflow-companion" },
    create: {
      slug: "tiktokflow-companion",
      name: "TikTokFlow Companion",
      version: "1.0.0",
      category: "AUTOMATION",
      shortDesc: "Tự động phát hiện phiên đăng nhập TikTok và đồng bộ GPMLogin với TikTokFlow",
      description:
        "Extension Chrome chính thức dành cho nhân sự TikTokFlow. Tự động kiểm tra trạng thái đăng nhập tài khoản TikTok trong trình duyệt GPMLogin, thống kê video đã đăng tải, lượng view và doanh thu realtime để tự động chấm công hàng ngày.",
      folderPath: "extension",
      author: "TikTokFlow Team",
      isFeatured: true,
      isActive: true,
      changelog: "• Phiên bản 1.0.0 phát hành chính thức.\n• Hỗ trợ phát hiện TikTok Web và TikTok Studio.\n• Tự động cấu hình Machine-Wide Token không cần gõ thủ công.\n• Bổ sung cơ chế Heartbeat chẩn đoán kết nối.",
      permissions: ["cookies", "storage", "alarms", "tabs", "https://*.tiktok.com/*"],
      supportedBrowsers: ["Chrome", "Brave", "Edge", "GPMLogin Chromium"],
    },
    update: {
      name: "TikTokFlow Companion",
      version: "1.0.0",
      category: "AUTOMATION",
      shortDesc: "Tự động phát hiện phiên đăng nhập TikTok và đồng bộ GPMLogin với TikTokFlow",
      isFeatured: true,
      isActive: true,
      folderPath: "extension",
    },
  });
  console.log("Seeded extension:", companion.name, "(slug:", companion.slug, ")");

  // 2. TikTokFlow Client Agent (Deep Sweeper Daemon)
  const clientAgent = await prisma.extension.upsert({
    where: { slug: "tiktokflow-client-agent" },
    create: {
      slug: "tiktokflow-client-agent",
      name: "TikTokFlow Client Agent (Deep Sweeper)",
      version: "1.1.0",
      category: "SCRAPER",
      shortDesc: "Công cụ chạy ngầm cào số liệu chuyên sâu TikTok Studio (views, doanh thu quỹ, TikTok Shop, RPM) bằng snapshot cách ly an toàn.",
      description:
        "Bộ công cụ Client Agent chính thức chạy độc lập trên máy trạm nhân viên (Windows). Hỗ trợ tự động quét vét toàn bộ dàn profile GPMLogin qua cơ chế snapshot cách ly (100% không đụng chạm profile gốc, chỉ đọc), cào số liệu TikTok Studio chi tiết ngay cả khi tắt profile và đẩy thẳng về cơ sở dữ liệu Cloud TikTokFlow.",
      folderPath: "client-agent",
      author: "TikTokFlow Core Team",
      isFeatured: true,
      isActive: true,
      changelog: "• Phiên bản 1.1.0: Bổ sung hàng rào Ironclad Temp Guard bảo vệ an toàn 100% tệp tin.\n• Khử tải Media thông minh: Tiết kiệm 85% băng thông và chỉ tốn ~60MB RAM.\n• Cơ chế Anti-Zombie: Tự động diệt tiến trình Chrome ngầm và dọn dẹp bộ nhớ đệm khi tắt.\n• Đi kèm run-agent.bat và setup-agent.bat hỗ trợ Windows Task Scheduler.",
      permissions: ["Playwright-Core Headless", "Local GPMLogin Storage (Read-Only)", "Windows Task Scheduler", "Snapshot Isolation (%TEMP%)"],
      supportedBrowsers: ["Windows 10/11", "GPMLogin Global", "Chrome", "Chromium"],
    },
    update: {
      name: "TikTokFlow Client Agent (Deep Sweeper)",
      version: "1.1.0",
      category: "SCRAPER",
      shortDesc: "Công cụ chạy ngầm cào số liệu chuyên sâu TikTok Studio (views, doanh thu quỹ, TikTok Shop, RPM) bằng snapshot cách ly an toàn.",
      description:
        "Bộ công cụ Client Agent chính thức chạy độc lập trên máy trạm nhân viên (Windows). Hỗ trợ tự động quét vét toàn bộ dàn profile GPMLogin qua cơ chế snapshot cách ly (100% không đụng chạm profile gốc, chỉ đọc), cào số liệu TikTok Studio chi tiết ngay cả khi tắt profile và đẩy thẳng về cơ sở dữ liệu Cloud TikTokFlow.",
      folderPath: "client-agent",
      isFeatured: true,
      isActive: true,
      changelog: "• Phiên bản 1.1.0: Bổ sung hàng rào Ironclad Temp Guard bảo vệ an toàn 100% tệp tin.\n• Khử tải Media thông minh: Tiết kiệm 85% băng thông và chỉ tốn ~60MB RAM.\n• Cơ chế Anti-Zombie: Tự động diệt tiến trình Chrome ngầm và dọn dẹp bộ nhớ đệm khi tắt.\n• Đi kèm run-agent.bat và setup-agent.bat hỗ trợ Windows Task Scheduler.",
    },
  });
  console.log("Seeded extension:", clientAgent.name, "(slug:", clientAgent.slug, ")");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

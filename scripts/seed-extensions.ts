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

  const companion = await prisma.extension.upsert({
    where: { slug: "tiktokflow-companion" },
    create: {
      slug: "tiktokflow-companion",
      name: "TikTokFlow Companion",
      version: "1.0.14",
      category: "AUTOMATION",
      shortDesc:
        "Nhận biết tài khoản TikTok đang đăng nhập và hỗ trợ gắn / bàn giao tài khoản trên GPM.",
      description:
        "Tiện ích cho nhân sự TikTokFlow trên GPMLogin. Giúp nhận diện tài khoản đang đăng nhập, hỗ trợ gắn và bàn giao tài khoản. Cửa sổ Extension cũng cho biết Client Agent trên máy đang chạy hay chưa. Số liệu như lượt xem và doanh thu do Client Agent cập nhật khi Agent chạy trên máy.",
      folderPath: "extension",
      author: "TikTokFlow Team",
      isFeatured: true,
      isActive: true,
      changelog:
        "• v1.0.14: Thu hẹp quyền host (bỏ all_urls); bảo mật token/API phía máy chủ.\n• v1.0.13: Extension tập trung nhận diện tài khoản; số liệu chi tiết do Client Agent cập nhật.\n• Hỗ trợ mã liên kết lần đầu + Personal Token khi cần.\n• Đồng bộ danh sách GPM và hiện trạng thái Agent trên máy.",
      permissions: ["cookies", "storage", "alarms", "tabs", "https://*.tiktok.com/*", "https://*/*"],
      supportedBrowsers: ["Chrome", "Brave", "Edge", "GPMLogin Chromium"],
    },
    update: {
      name: "TikTokFlow Companion",
      version: "1.0.14",
      category: "AUTOMATION",
      shortDesc:
        "Nhận biết tài khoản TikTok đang đăng nhập và hỗ trợ gắn / bàn giao tài khoản trên GPM.",
      description:
        "Tiện ích cho nhân sự TikTokFlow trên GPMLogin. Giúp nhận diện tài khoản đang đăng nhập, hỗ trợ gắn và bàn giao tài khoản. Cửa sổ Extension cũng cho biết Client Agent trên máy đang chạy hay chưa. Số liệu như lượt xem và doanh thu do Client Agent cập nhật khi Agent chạy trên máy.",
      changelog:
        "• v1.0.14: Thu hẹp quyền host (bỏ all_urls); bảo mật token/API phía máy chủ.\n• v1.0.13: Extension tập trung nhận diện tài khoản; số liệu chi tiết do Client Agent cập nhật.\n• Hỗ trợ mã liên kết lần đầu + Personal Token khi cần.\n• Đồng bộ danh sách GPM và hiện trạng thái Agent trên máy.",
      isFeatured: true,
      isActive: true,
      folderPath: "extension",
    },
  });
  console.log("Seeded extension:", companion.name, "(slug:", companion.slug, ")");

  const clientAgent = await prisma.extension.upsert({
    where: { slug: "tiktokflow-client-agent" },
    create: {
      slug: "tiktokflow-client-agent",
      name: "TikTokFlow Client Agent (Deep Sweeper)",
      version: "1.2.0",
      category: "SCRAPER",
      shortDesc:
        "Tự động lấy số liệu TikTok trên máy của bạn và gửi về hệ thống. Mỗi máy chỉ mở một Agent.",
      description:
        "Phần mềm chạy trên máy Windows để tự động lấy số liệu TikTok (lượt xem, doanh thu…) và gửi về TikTokFlow. Chạy êm, không chiếm chuột. Mỗi máy chỉ nên mở một Agent — nếu muốn chạy lại, hãy dừng Agent cũ bằng stop-agent.bat trước.",
      folderPath: "client-agent",
      author: "TikTokFlow Core Team",
      isFeatured: true,
      isActive: true,
      changelog:
        "• v1.2.0: Mỗi máy chỉ cho phép một Agent chạy cùng lúc; dừng bằng stop-agent.bat rồi mới mở lại.\n• Chạy êm, tự dọn file tạm, an toàn với profile GPM.\n• Đi kèm run-agent.bat, setup-agent.bat, stop-agent.bat.",
      permissions: [
        "Chạy trên Windows",
        "Đọc dữ liệu GPM (không sửa)",
        "Tự chạy khi mở máy (tùy chọn)",
      ],
      supportedBrowsers: ["Windows 10/11", "GPMLogin Global", "Chrome", "Chromium"],
    },
    update: {
      name: "TikTokFlow Client Agent (Deep Sweeper)",
      version: "1.2.0",
      category: "SCRAPER",
      shortDesc:
        "Tự động lấy số liệu TikTok trên máy của bạn và gửi về hệ thống. Mỗi máy chỉ mở một Agent.",
      description:
        "Phần mềm chạy trên máy Windows để tự động lấy số liệu TikTok (lượt xem, doanh thu…) và gửi về TikTokFlow. Chạy êm, không chiếm chuột. Mỗi máy chỉ nên mở một Agent — nếu muốn chạy lại, hãy dừng Agent cũ bằng stop-agent.bat trước.",
      folderPath: "client-agent",
      isFeatured: true,
      isActive: true,
      changelog:
        "• v1.2.0: Mỗi máy chỉ cho phép một Agent chạy cùng lúc; dừng bằng stop-agent.bat rồi mới mở lại.\n• Chạy êm, tự dọn file tạm, an toàn với profile GPM.\n• Đi kèm run-agent.bat, setup-agent.bat, stop-agent.bat.",
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

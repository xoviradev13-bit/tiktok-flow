import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createPairingCodeForUser,
  ensureAgentAttestSecretPlain,
} from "@/lib/extension-auth";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để tải gói Client Agent." },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        extensionAccessEnabled: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Không tìm thấy người dùng." },
        { status: 404 }
      );
    }

    if (user.extensionAccessEnabled === false) {
      return NextResponse.json(
        {
          error:
            "Quyền Extension/Client Agent đã bị thu hồi. Vui lòng liên hệ Quản trị viên để mở khóa và cấp Token mới trước khi tải lại.",
        },
        { status: 403 }
      );
    }

    const host = req.headers.get("host") || "localhost:3000";
    const proto =
      req.headers.get("x-forwarded-proto") ||
      (host.startsWith("localhost") ? "http" : "https");
    const serverUrl = `${proto}://${host}`;

    const url = new URL(req.url);
    const rotateAttest =
      url.searchParams.get("rotateAttest") === "1" && user.role === "ADMIN";

    const pairingCode = await createPairingCodeForUser(user.id);
    const agentAttestSecret = await ensureAgentAttestSecretPlain(user.id, {
      rotate: rotateAttest,
    });

    const downloadId = randomUUID();

    const configContent = JSON.stringify(
      {
        serverUrl,
        memberEmail: user.email || user.username || "member@company.com",
        pairingCode,
        agentAttestSecret,
        concurrency: "auto",
        headless: true,
        tokenRevoked: false,
        tokenRevokedReason: "",
      },
      null,
      2
    );

    const baseZipPath = path.join(process.cwd(), "client-agent-base.zip");
    if (!fs.existsSync(baseZipPath)) {
      return NextResponse.json(
        {
          error:
            "client-agent-base.zip chưa được pack trên server. Chạy scripts/pack-client-agent-base.ps1 rồi deploy lại.",
        },
        { status: 500 }
      );
    }

    try {
      const zip = new AdmZip(baseZipPath);
      zip.addFile("config.json", Buffer.from(configContent, "utf-8"));
      const zipBuffer = zip.toBuffer();

      return new Response(new Uint8Array(zipBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="TikTokFlow-ClientAgent-${downloadId}.zip"`,
          "Content-Length": zipBuffer.length.toString(),
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    } catch (zipErr) {
      console.error("[ClientAgentDownload] base zip corrupt:", zipErr);
      return NextResponse.json(
        {
          error:
            "client-agent-base.zip lỗi hoặc không đọc được. Pack lại trước khi tải.",
        },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Lỗi tải Client Agent";
    console.error("[ClientAgentDownload] Error generating zip:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

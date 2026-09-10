import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createZipBuffer, ZipEntry } from "@/lib/zip";
import { createPairingCodeForUser } from "@/lib/extension-auth";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

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
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
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

    // Determine current Server URL from host header
    const host = req.headers.get("host") || "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const serverUrl = `${proto}://${host}`;

    const pairingCode = await createPairingCodeForUser(user.id);

    const sanitizedName = (user.username || user.name || "member")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");

    // Pairing only — no personalToken in redistributable zip
    const configContent = JSON.stringify(
      {
        serverUrl,
        memberEmail: user.email || user.username || "member@company.com",
        pairingCode,
        concurrency: "auto",
        headless: true,
        tokenRevoked: false,
        tokenRevokedReason: "",
      },
      null,
      2
    );

    // 1. FAST PATH: Check pre-packaged base zip containing portable Node.js & Playwright-core
    const baseZipPath = path.join(process.cwd(), "client-agent-base.zip");
    if (fs.existsSync(baseZipPath)) {
      try {
        const zip = new AdmZip(baseZipPath);
        // Replace or add personalized config.json
        zip.addFile("config.json", Buffer.from(configContent, "utf-8"));
        const zipBuffer = zip.toBuffer();

        return new Response(new Uint8Array(zipBuffer), {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="TikTokFlow-ClientAgent-${sanitizedName}.zip"`,
            "Content-Length": zipBuffer.length.toString(),
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      } catch (zipErr) {
        console.warn("[ClientAgentDownload] Fallback to directory packing:", zipErr);
      }
    }

    // 2. FALLBACK PATH: Directory packing
    const agentDir = path.join(process.cwd(), "client-agent");
    if (!fs.existsSync(agentDir)) {
      return NextResponse.json(
        { error: "Thư mục Client Agent không tồn tại trên server." },
        { status: 500 }
      );
    }

    const entries: ZipEntry[] = [];
    function addDirRecursive(dir: string, prefix = "") {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.startsWith(".")) continue;
        const fullPath = path.join(dir, f);
        const relPath = prefix ? `${prefix}/${f}` : f;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          addDirRecursive(fullPath, relPath);
        } else {
          if (relPath === "config.json") continue;
          entries.push({
            name: relPath,
            data: fs.readFileSync(fullPath),
          });
        }
      }
    }

    addDirRecursive(agentDir);
    entries.push({
      name: "config.json",
      data: Buffer.from(configContent, "utf-8"),
    });

    const zipBuffer = createZipBuffer(entries);

    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="TikTokFlow-ClientAgent-${sanitizedName}.zip"`,
        "Content-Length": zipBuffer.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("[ClientAgentDownload] Error generating zip:", err);
    return NextResponse.json({ error: err.message || "Lỗi tải Client Agent" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createZipBuffer, ZipEntry } from "@/lib/zip";
import { createPairingCodeForUser } from "@/lib/extension-auth";
import fs from "fs";
import path from "path";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để tải Extension." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get("userId");

    // Only Admins can download on behalf of other members
    const targetUserId =
      requestedUserId && (session.user as any).role === "ADMIN"
        ? requestedUserId
        : session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
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
        { error: "Quyền sử dụng Extension của bạn đã bị Quản trị viên vô hiệu hóa." },
        { status: 403 }
      );
    }

    // Determine current Server URL
    const host = req.headers.get("host") || "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const serverUrl = `${proto}://${host}`;

    const pairingCode = await createPairingCodeForUser(user.id);

    // Read base files from extension/ folder
    const extensionDir = path.join(process.cwd(), "extension");
    if (!fs.existsSync(extensionDir)) {
      return NextResponse.json({ error: "Thư mục Extension không tồn tại trên server." }, { status: 500 });
    }

    const entries: ZipEntry[] = [];

    function addDirRecursive(dir: string, prefix = "") {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const fullPath = path.join(dir, f);
        const relPath = prefix ? `${prefix}/${f}` : f;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          addDirRecursive(fullPath, relPath);
        } else {
          // Skip any old config.json
          if (relPath === "config.json") continue;
          entries.push({
            name: relPath,
            data: fs.readFileSync(fullPath),
          });
        }
      }
    }

    addDirRecursive(extensionDir);

    // Pairing only — no long-lived personalToken in redistributable zip
    const configContent = JSON.stringify(
      {
        serverUrl,
        pairingCode,
        memberName: user.name || user.username || user.email,
        userEmail: user.email,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    );

    entries.push({
      name: "config.json",
      data: Buffer.from(configContent, "utf-8"),
    });

    const zipBuffer = createZipBuffer(entries);
    const sanitizedName = (user.username || user.name || "member")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");

    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="TikTokFlow-Extension-${sanitizedName}.zip"`,
        "Content-Length": zipBuffer.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("[ExtensionDownload] Error generating zip:", err);
    return NextResponse.json({ error: err.message || "Lỗi tải Extension" }, { status: 500 });
  }
}

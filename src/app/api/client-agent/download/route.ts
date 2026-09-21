import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createPairingCodeForUser,
  ensureAgentAttestSecretPlain,
} from "@/lib/extension-auth";
import { checkRateLimit, getClientIp } from "@/lib/extension-auth";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// FIX: rate limit — this endpoint creates a fresh pairing code (and possibly
// rotates the attest secret) on every call. A logged-in user could spam it
// to churn secrets or fill the DB with pairing-code rows.
const DOWNLOAD_RATE_LIMIT_PER_USER = 10;   // per minute
const DOWNLOAD_RATE_LIMIT_PER_IP = 20;     // per minute

// FIX: base zip cache. AdmZip parses + decompresses the entire archive on
// every call, which blocks the event loop for large bundles. The base zip
// never changes between deploys, so cache it in-process.
let baseZipCache: { mtimeMs: number; zip: AdmZip } | null = null;

function loadBaseZip(baseZipPath: string): AdmZip {
  const st = fs.statSync(baseZipPath);
  if (baseZipCache && baseZipCache.mtimeMs === st.mtimeMs) {
    return baseZipCache.zip;
  }
  const zip = new AdmZip(baseZipPath);
  baseZipCache = { mtimeMs: st.mtimeMs, zip };
  return zip;
}

// FIX: only trust the Host header when it resolves to a known origin.
// Previously the entire serverUrl baked into config.json came straight from
// `req.headers.get("host")` — a spoofed Host header would make the agent
// point at an attacker-controlled server and happily hand it the pairing
// code + attest secret.
function resolveServerUrl(req: Request): string | null {
  const configuredBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "";

  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }

  const host = (req.headers.get("host") || "").toLowerCase();
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  // Without an explicit APP_URL, only localhost is trusted. Production
  // deployments must set NEXT_PUBLIC_APP_URL (or NEXTAUTH_URL).
  const isLoopback =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");

  if (!isLoopback) return null;

  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  try {
    // FIX: auth() can throw in standalone contexts (missing AsyncLocalStorage).
    const session = await auth().catch(() => null);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để tải gói Client Agent." },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // FIX: rate limit before any DB writes or secret operations.
    const ip = getClientIp(req) || "unknown";
    const ipLimit = checkRateLimit(`agent-dl:ip:${ip}`, DOWNLOAD_RATE_LIMIT_PER_IP);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }
    const userLimit = checkRateLimit(`agent-dl:user:${userId}`, DOWNLOAD_RATE_LIMIT_PER_USER);
    if (!userLimit.ok) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSec) } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    // FIX: resolve serverUrl from configured origin, not from a spoofable
    // Host header. If no trusted origin can be determined, refuse.
    const serverUrl = resolveServerUrl(req);
    if (!serverUrl) {
      console.error(
        "[ClientAgentDownload] Refusing download: no trusted server URL. " +
        "Set NEXT_PUBLIC_APP_URL or NEXTAUTH_URL."
      );
      return NextResponse.json(
        {
          error:
            "Server chưa cấu hình URL công khai (NEXT_PUBLIC_APP_URL / NEXTAUTH_URL). Liên hệ Quản trị viên.",
        },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const requestedRotate = url.searchParams.get("rotateAttest") === "1";
    const rotateAttest = requestedRotate && user.role === "ADMIN";

    // FIX: audit-log secret rotations. Silent rotations make incident
    // investigation impossible. Log only when the flag is set AND the caller
    // has permission — no log spam for regular downloads.
    if (requestedRotate && !rotateAttest) {
      console.warn(
        JSON.stringify({
          event: "agent_download_rotate_attest_denied",
          userId: user.id,
          role: user.role,
        })
      );
    } else if (rotateAttest) {
      console.warn(
        JSON.stringify({
          event: "agent_download_rotate_attest",
          userId: user.id,
          role: user.role,
        })
      );
    }

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
      // FIX: reuse a cached AdmZip instance instead of re-parsing the base
      // zip on every request. AdMZip is not thread-safe but Node is
      // single-threaded, so we clone the zip before mutating.
      const cachedZip = loadBaseZip(baseZipPath);
      // AdmZip has no clone() method; copy entries into a fresh instance.
      // For typical bundles this is still much faster than re-reading the
      // base zip from disk + decompressing.
      const zip = new AdmZip();
      for (const entry of cachedZip.getEntries()) {
        if (entry.isDirectory) {
          zip.addFile(entry.entryName, Buffer.alloc(0));
        } else {
          zip.addFile(entry.entryName, entry.getData());
        }
      }
      zip.addFile("config.json", Buffer.from(configContent, "utf-8"));
      const zipBuffer = zip.toBuffer();

      return new Response(new Uint8Array(zipBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="TikTokFlow-ClientAgent-${downloadId}.zip"`,
          "Content-Length": zipBuffer.length.toString(),
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          // FIX: prevent browsers/proxies from caching the zip contents
          // (contains a fresh pairing code and attest secret).
          Pragma: "no-cache",
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
    const message = err instanceof Error ? err.message : "Lỗi tải Client Agent";
    console.error("[ClientAgentDownload] Error generating zip:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
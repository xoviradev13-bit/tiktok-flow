import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createZipBuffer, ZipEntry } from "@/lib/zip";
import { createPairingCodeForUser, resolvePublicAppUrl, checkRateLimit, getClientIp } from "@/lib/extension-auth";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// FIX: rate limit. Every call mints a fresh pairing code and (in the target
// case) reads the entire extension directory from disk. A logged-in user
// looping this endpoint can churn pairing codes and pin CPU.
const DOWNLOAD_RATE_LIMIT_PER_USER = 15;   // per minute
const DOWNLOAD_RATE_LIMIT_PER_IP = 30;     // per minute

// FIX: cache the extension directory contents. The directory is static between
// deploys; re-reading every file on every request is pure waste. Cache is
// invalidated by a cheap stat-only fingerprint.
const EXT_CACHE_TTL_MS = 60_000;
let extensionCache: {
  fingerprint: string;
  entries: ZipEntry[];
  at: number;
} | null = null;

/**
 * Compute a stat-only fingerprint of every file under `dir`.
 * Cheap: one readdir + one stat per file. Never reads contents.
 */
function fingerprintDir(dir: string): string {
  const parts: string[] = [];
  const walk = (d: string, prefix: string) => {
    const files = fs.readdirSync(d).sort();
    for (const f of files) {
      const full = path.join(d, f);
      const rel = prefix ? `${prefix}/${f}` : f;
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) {
        // FIX: refuse to follow symlinks. A symlink inside the extension
        // directory could point at /etc/passwd or a private key on the host.
        // The fingerprint records it as skipped so cache invalidation still
        // triggers if the link target changes.
        parts.push(`${rel}|symlink|${st.mtimeMs}`);
        continue;
      }
      if (st.isDirectory()) {
        walk(full, rel);
      } else if (st.isFile()) {
        parts.push(`${rel}|${st.size}|${st.mtimeMs}`);
      }
    }
  };
  walk(dir, "");
  return parts.join("\n");
}

/**
 * Read extension entries, following symlinks only if they stay inside `dir`.
 * Reads are async to avoid blocking the event loop during the request.
 */
async function readExtensionEntries(dir: string): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];

  const walk = async (d: string, prefix: string) => {
    const files = await fs.promises.readdir(d);
    for (const f of files) {
      const full = path.join(d, f);
      const rel = prefix ? `${prefix}/${f}` : f;

      // FIX: resolve symlinks and confirm they stay inside the extension dir.
      // A symlink pointing outside (e.g. ../.env) is skipped, not followed.
      let realPath: string;
      try {
        realPath = await fs.promises.realpath(full);
      } catch {
        continue;
      }
      const relToRoot = path.relative(dir, realPath);
      if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
        console.warn(
          `[ExtensionDownload] Skipping out-of-tree path: ${rel} -> ${realPath}`
        );
        continue;
      }

      const st = await fs.promises.stat(full);
      if (st.isDirectory()) {
        await walk(full, rel);
      } else {
        if (rel === "config.json") continue; // skip stale config
        const data = await fs.promises.readFile(full);
        entries.push({ name: rel, data });
      }
    }
  };

  await walk(dir, "");
  return entries;
}

export async function GET(req: Request) {
  try {
    // FIX: guard auth() for standalone contexts.
    const session = await auth().catch(() => null);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để tải Extension." },
        { status: 401 }
      );
    }

    const callerId = session.user.id;
    const callerRole = (session.user as { role?: string } | undefined)?.role || null;

    // FIX: rate limit before any DB write or disk read.
    const ip = getClientIp(req) || "unknown";
    const ipLimit = checkRateLimit(`ext-dl:ip:${ip}`, DOWNLOAD_RATE_LIMIT_PER_IP);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }
    const userLimit = checkRateLimit(`ext-dl:user:${callerId}`, DOWNLOAD_RATE_LIMIT_PER_USER);
    if (!userLimit.ok) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSec) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get("userId");

    // FIX: only ADMIN can download on behalf of others (unchanged), but log
    // the attempt when a non-admin passes the param so we can detect probing.
    let targetUserId = callerId;
    if (requestedUserId && requestedUserId !== callerId) {
      if (callerRole !== "ADMIN") {
        console.warn(
          JSON.stringify({
            event: "ext_download_cross_user_denied",
            callerId,
            callerRole,
            requestedUserId,
          })
        );
        // Fall through with target = caller; do not leak existence of other users.
      } else {
        targetUserId = requestedUserId;
        console.log(
          JSON.stringify({
            event: "ext_download_on_behalf",
            callerId,
            targetUserId,
          })
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        extensionAccessEnabled: true,
        isActive: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Không tìm thấy người dùng." },
        { status: 404 }
      );
    }

    // FIX: also block inactive users. Previously a disabled account could
    // still receive a fresh pairing code via an admin-initiated download.
    if (user.isActive === false) {
      return NextResponse.json(
        { error: "Tài khoản đã bị vô hiệu hóa." },
        { status: 403 }
      );
    }

    if (user.extensionAccessEnabled === false) {
      return NextResponse.json(
        {
          error:
            "Quyền sử dụng Extension của bạn đã bị Quản trị viên vô hiệu hóa.",
        },
        { status: 403 }
      );
    }

    // FIX: resolve serverUrl BEFORE minting a pairing code. If the URL
    // resolver fails, no code is wasted and no DB writes happen.
    const serverUrl = resolvePublicAppUrl(req);
    if (!serverUrl) {
      console.error(
        "[ExtensionDownload] No public app URL could be resolved. " +
        "Set NEXT_PUBLIC_APP_URL or NEXTAUTH_URL."
      );
      return NextResponse.json(
        {
          error:
            "Server chưa cấu hình URL công khai. Liên hệ Quản trị viên.",
        },
        { status: 500 }
      );
    }

    // FIX: check the extension dir exists BEFORE minting a pairing code.
    // Previously a missing directory wasted a code (they're single-use and
    // rate-limited on the server side).
    const extensionDir = path.join(process.cwd(), "extension");
    if (!fs.existsSync(extensionDir)) {
      return NextResponse.json(
        { error: "Thư mục Extension không tồn tại trên server." },
        { status: 500 }
      );
    }

    // FIX: cache extension entries by directory fingerprint. Cache survives
    // until the fingerprint changes (deploy) or the TTL expires.
    let entries: ZipEntry[];
    try {
      const fingerprint = fingerprintDir(extensionDir);
      const cached = extensionCache;
      const cacheValid =
        cached &&
        cached.fingerprint === fingerprint &&
        Date.now() - cached.at < EXT_CACHE_TTL_MS;

      if (cacheValid) {
        entries = cached!.entries;
      } else {
        entries = await readExtensionEntries(extensionDir);
        extensionCache = {
          fingerprint,
          entries,
          at: Date.now(),
        };
      }
    } catch (readErr: any) {
      console.error("[ExtensionDownload] Failed to read extension dir:", readErr);
      return NextResponse.json(
        { error: "Không đọc được thư mục Extension trên server." },
        { status: 500 }
      );
    }

    // Only mint the pairing code after everything else has succeeded.
    const pairingCode = await createPairingCodeForUser(user.id);

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

    // FIX: do not mutate the cached entries array. Build a fresh array.
    const finalEntries: ZipEntry[] = [
      ...entries,
      {
        name: "config.json",
        data: Buffer.from(configContent, "utf-8"),
      },
    ];

    const zipBuffer = createZipBuffer(finalEntries);
    const downloadId = randomUUID();

    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="TikTokFlow-Extension-${downloadId}.zip"`,
        "Content-Length": zipBuffer.length.toString(),
        // FIX: belt-and-suspenders cache defeat. The zip contains a fresh
        // pairing code; no proxy or CDN may cache it.
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (err: any) {
    console.error("[ExtensionDownload] Error generating zip:", err);
    // FIX: generic message. Previously err.message went straight to the caller,
    // which could leak filesystem paths, DB error text, or internal state.
    return NextResponse.json(
      { error: "Lỗi tải Extension. Vui lòng thử lại hoặc liên hệ Quản trị viên." },
      { status: 500 }
    );
  }
}

// FIX: reject non-GET methods explicitly. A misconfigured CDN or a crawler
// issuing POST should not reach the GET handler and should not be cached.
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } }
  );
}
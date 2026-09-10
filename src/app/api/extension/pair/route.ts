/**
 * POST /api/extension/pair
 * Redeem one-time pairing code from download zip.
 * Do NOT log request/response bodies — they carry personalToken + session secrets.
 */
import { NextResponse } from "next/server";
import {
  checkRateLimit,
  generatePersonalToken,
  getClientIp,
  getClientUserAgent,
  hashOpaqueToken,
  issueSessionBundle,
} from "@/lib/extension-auth";
import { prisma } from "@/lib/prisma";

function isDbConnectivityError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || "");
  return /timeout|terminat|ECONNRESET|ECONNREFUSED|Can't reach database|Connection/i.test(
    msg
  );
}

export async function POST(req: Request) {
  // Intentionally no body logging on this route (secrets in JSON response).
  const ip = getClientIp(req) || "unknown";
  const userAgent = getClientUserAgent(req);

  const ipOverall = checkRateLimit(`pair:ip:${ip}`, 120);
  if (!ipOverall.ok) {
    return NextResponse.json(
      { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
      { status: 429, headers: { "Retry-After": String(ipOverall.retryAfterSec) } }
    );
  }

  let pairingCode: string | undefined;
  try {
    const body = await req.json();
    pairingCode = typeof body?.pairingCode === "string" ? body.pairingCode.trim() : undefined;
  } catch {
    return NextResponse.json(
      { success: false, error: "Body JSON không hợp lệ." },
      { status: 400 }
    );
  }

  if (!pairingCode || !pairingCode.startsWith("ttf_pair_")) {
    const failedIp = checkRateLimit(`pair:failip:${ip}`, 30);
    if (!failedIp.ok) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(failedIp.retryAfterSec) } }
      );
    }
    console.info(JSON.stringify({ event: "pair_redeem", outcome: "invalid", ip }));
    return NextResponse.json(
      { success: false, error: "Mã pairing không hợp lệ hoặc đã hết hạn." },
      { status: 401 }
    );
  }

  const codeHash = hashOpaqueToken(pairingCode);
  const codeFail = checkRateLimit(`pair:code:${codeHash.slice(0, 16)}`, 10);
  if (!codeFail.ok) {
    return NextResponse.json(
      { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
      { status: 429, headers: { "Retry-After": String(codeFail.retryAfterSec) } }
    );
  }

  try {
    const now = new Date();
    const claimed = await prisma.extensionPairingCode.updateMany({
      where: {
        codeHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (claimed.count !== 1) {
      checkRateLimit(`pair:failip:${ip}`, 30);
      console.info(JSON.stringify({ event: "pair_redeem", outcome: "expired_or_used", ip }));
      return NextResponse.json(
        { success: false, error: "Mã pairing không hợp lệ hoặc đã hết hạn." },
        { status: 401 }
      );
    }

    const row = await prisma.extensionPairingCode.findUnique({
      where: { codeHash },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            isActive: true,
            extensionAccessEnabled: true,
            extensionToken: true,
            extensionSessionVersion: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!row?.user || row.user.deletedAt || !row.user.isActive) {
      console.info(JSON.stringify({ event: "pair_redeem", outcome: "user_blocked", ip }));
      return NextResponse.json(
        { success: false, error: "Mã pairing không hợp lệ hoặc đã hết hạn." },
        { status: 401 }
      );
    }

    if (row.user.extensionAccessEnabled === false) {
      console.info(JSON.stringify({ event: "pair_redeem", outcome: "user_blocked", ip }));
      return NextResponse.json(
        { success: false, error: "Quyền Extension đã bị thu hồi. Liên hệ Quản trị viên." },
        { status: 403 }
      );
    }

    let personalToken = row.user.extensionToken;
    if (!personalToken) {
      personalToken = generatePersonalToken();
      await prisma.user.update({
        where: { id: row.user.id },
        data: { extensionToken: personalToken, extensionAccessEnabled: true },
      });
    }

    const freshUser = {
      ...row.user,
      extensionToken: personalToken,
    };

    const session = await issueSessionBundle(freshUser, { ip, userAgent });

    const host = req.headers.get("host") || "localhost:3000";
    const proto =
      req.headers.get("x-forwarded-proto") ||
      (host.startsWith("localhost") ? "http" : "https");
    const serverUrl = `${proto}://${host}`;

    console.info(
      JSON.stringify({ event: "pair_redeem", outcome: "ok", userId: row.user.id, ip })
    );

    return NextResponse.json({
      success: true,
      personalToken,
      serverUrl,
      user: {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        username: row.user.username,
      },
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      refreshToken: session.refreshToken,
    });
  } catch (err) {
    console.error("[extension/pair] DB error:", (err as Error)?.message || err);
    if (isDbConnectivityError(err)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Không kết nối được cơ sở dữ liệu (timeout). Thử lại sau vài giây hoặc kiểm tra DATABASE_URL / mạng tới Postgres.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Lỗi máy chủ khi kích hoạt pairing." },
      { status: 500 }
    );
  }
}

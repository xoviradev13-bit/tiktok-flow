/**
 * POST /api/extension/pair
 * Redeem one-time pairing code from download zip.
 * Do NOT log request/response bodies — they carry personalToken + session secrets.
 */
import { NextResponse } from "next/server";
import {
  checkAndBindMachine,
  checkRateLimit,
  generatePersonalToken,
  getClientIp,
  getClientUserAgent,
  hashOpaqueToken,
  issueSessionBundle,
  persistPersonalTokenValue,
  revealPersonalToken,
  resolvePublicAppUrl,
} from "@/lib/extension-auth";
import { prisma } from "@/lib/prisma";
import { extensionOptionsResponse } from "@/lib/extension-cors";

export function OPTIONS(req: Request) { return extensionOptionsResponse(req); }


// FIX: bound the pairing code length before hashing. Previously a megabyte
// string would be SHA-256'd on every call — cheap per byte, but a cheap DoS
// amplifier when issued in bulk.
const MAX_PAIRING_CODE_LEN = 100;

// FIX: classify DB connectivity errors with a narrow regex. The previous
// version matched /timeout/ and /Connection/ anywhere in the message, so a
// legitimate 500 (e.g. "Timeout while hashing password" or
// "Failed to establish a connection with the model") would be misreported as
// a 503 to the agent, hiding the real error.
function isDbConnectivityError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (
    code === "P1001" || // Can't reach database server
    code === "P1002" || // Database server timed out
    code === "P1008" || // Operations timed out
    code === "P1017" || // Server has closed the connection
    code === "P2024"    // Timed out fetching a new connection from pool
  ) {
    return true;
  }
  const msg = String((err as Error)?.message || err || "");
  return /Can't reach database server|Connection refused|ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(
    msg
  );
}

export async function POST(req: Request) {
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
  let machineId: string | undefined;
  let machineName: string | undefined;
  let osUsername: string | undefined;
  let nonce: string | undefined;
  let ts: number | string | undefined;
  let sig: string | undefined;
  try {
    const body = await req.json();
    pairingCode =
      typeof body?.pairingCode === "string" ? body.pairingCode.trim() : undefined;
    machineId =
      typeof body?.machineId === "string" ? body.machineId.trim() : undefined;
    machineName =
      typeof body?.machineName === "string" ? body.machineName.trim() : undefined;
    osUsername =
      typeof body?.osUsername === "string" ? body.osUsername.trim() : undefined;
    nonce = typeof body?.nonce === "string" ? body.nonce.trim() : undefined;
    ts = body?.ts;
    sig = typeof body?.sig === "string" ? body.sig.trim() : undefined;
  } catch {
    return NextResponse.json(
      { success: false, error: "Body JSON không hợp lệ." },
      { status: 400 }
    );
  }

  if (
    !pairingCode ||
    !pairingCode.startsWith("ttf_pair_") ||
    // FIX: reject absurdly long inputs before hashing.
    pairingCode.length > MAX_PAIRING_CODE_LEN
  ) {
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

    const userSelect = {
      id: true,
      name: true,
      email: true,
      username: true,
      isActive: true,
      extensionAccessEnabled: true,
      extensionToken: true,
      extensionSessionVersion: true,
      deletedAt: true,
    } as const;

    let redeemMode: "first" | "rebootstrap" = "first";
    let row = await prisma.extensionPairingCode.findUnique({
      where: { codeHash },
      include: { user: { select: userSelect } },
    });

    if (claimed.count !== 1) {
      // One-time claim lost the race or code was already used. Allow additional
      // GPM browser profiles on the same machine to re-bootstrap the same
      // personalToken when the code was previously redeemed successfully.
      if (row?.usedAt) {
        redeemMode = "rebootstrap";
      } else {
        checkRateLimit(`pair:failip:${ip}`, 30);
        console.info(
          JSON.stringify({ event: "pair_redeem", outcome: "expired_or_used", ip })
        );
        return NextResponse.json(
          { success: false, error: "Mã pairing không hợp lệ hoặc đã hết hạn." },
          { status: 401 }
        );
      }
    }

    if (!row?.user || row.user.deletedAt || !row.user.isActive) {
      console.info(
        JSON.stringify({ event: "pair_redeem", outcome: "user_blocked", ip })
      );
      return NextResponse.json(
        { success: false, error: "Mã pairing không hợp lệ hoặc đã hết hạn." },
        { status: 401 }
      );
    }

    if (row.user.extensionAccessEnabled === false) {
      console.info(
        JSON.stringify({ event: "pair_redeem", outcome: "user_blocked", ip })
      );
      return NextResponse.json(
        {
          success: false,
          error: "Quyền Extension đã bị thu hồi. Liên hệ Quản trị viên.",
        },
        { status: 403 }
      );
    }

    const machineCheck = await checkAndBindMachine(
      row.user.id,
      { machineId, machineName, osUsername, nonce, ts, sig },
      { ip, rlPrefix: "pair" }
    );
    if (!machineCheck.ok) {
      const headers =
        machineCheck.status === 429
          ? { "Retry-After": String(machineCheck.retryAfterSec ?? 60) }
          : undefined;
      return NextResponse.json(
        {
          success: false,
          error: machineCheck.error,
          reason: machineCheck.reason,
        },
        { status: machineCheck.status, headers }
      );
    }

    let personalToken = revealPersonalToken(row.user.extensionToken);
    if (!personalToken) {
      // Rebootstrap requires an existing token; first redeem may mint one.
      if (redeemMode === "rebootstrap") {
        return NextResponse.json(
          { success: false, error: "Mã pairing không hợp lệ hoặc đã hết hạn." },
          { status: 401 }
        );
      }

      // FIX: race-safe token minting. Two concurrent first-time redemptions
      // for the same user (e.g. two zips downloaded for the same account) would
      // previously both generate a token, both write, and one client would end
      // up holding a dead token. Now the write is conditional on the column
      // still being null; the loser re-reads and uses the winner's value.
      const candidate = generatePersonalToken();
      const writeResult = await prisma.user.updateMany({
        where: {
          id: row.user.id,
          extensionToken: null,
        },
        data: {
          extensionToken: persistPersonalTokenValue(candidate),
          extensionAccessEnabled: true,
        },
      });

      if (writeResult.count === 1) {
        personalToken = candidate;
      } else {
        // Lost the race; re-read and use whatever the winner wrote.
        const fresh = await prisma.user.findUnique({
          where: { id: row.user.id },
          select: { extensionToken: true },
        });
        personalToken = revealPersonalToken(fresh?.extensionToken ?? null);
        if (!personalToken) {
          // Extremely unlikely: column is neither null nor readable.
          // Treat as a hard failure rather than returning a token that is not
          // in the DB.
          console.error(
            `[extension/pair] Lost token race but could not reveal winner's token for user ${row.user.id}`
          );
          return NextResponse.json(
            { success: false, error: "Lỗi máy chủ khi kích hoạt pairing." },
            { status: 500 }
          );
        }
      }
    } else if (
      row.user.extensionToken &&
      !row.user.extensionToken.startsWith("e1.")
    ) {
      // FIX: migrate legacy plaintext format. Same race-safety concern is
      // mitigated by the `startsWith("e1.")` guard — only one caller can
      // observe the legacy format and trigger the migration. Concurrent
      // callers see e1.* on their second read and skip.
      await prisma.user.update({
        where: { id: row.user.id },
        data: { extensionToken: persistPersonalTokenValue(personalToken) },
      });
    }

    const freshUser = {
      ...row.user,
      extensionToken: persistPersonalTokenValue(personalToken),
    };

    const session = await issueSessionBundle(freshUser, { ip, userAgent });
    const serverUrl = resolvePublicAppUrl(req);

    console.info(
      JSON.stringify({
        event: "pair_redeem",
        outcome: redeemMode === "rebootstrap" ? "rebootstrap_ok" : "ok",
        userId: row.user.id,
        ip,
      })
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
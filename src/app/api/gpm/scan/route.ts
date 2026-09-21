import { NextResponse } from "next/server";
import { gpmClient } from "@/lib/gpm-api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/extension-auth";

// FIX: bound the GPM probe so a hung TCP socket can't stall the request
// until Node's default fetch timeout (which is measured in minutes).
const GPM_PROBE_TIMEOUT_MS = 4000;

// FIX: single source of truth for heartbeat freshness (was a magic number
// duplicated in the original).
const GPM_HEARTBEAT_FRESH_MS = 5 * 60 * 1000;

// FIX: cap polling so a misbehaving UI tab cannot hammer the endpoint.
const GPM_STATUS_RATE_LIMIT = 240; // ~4/sec burst, comfortable for a 10s poll

/** Race a promise against a labelled timeout. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function GET() {
  try {
    // FIX: require authentication. This endpoint reveals the GPM port and
    // online state of a workstation — that is tenant infrastructure data and
    // should not be readable by an anonymous caller.
    const session = await auth().catch(() => null);
    if (!session?.user?.id) {
      return NextResponse.json(
        { isOnline: false, message: "Yêu cầu đăng nhập.", baseUrl: null, port: null },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // FIX: per-user rate limit.
    const limit = checkRateLimit(`gpm-status:user:${userId}`, GPM_STATUS_RATE_LIMIT);
    if (!limit.ok) {
      return NextResponse.json(
        {
          isOnline: false,
          message: "Quá nhiều yêu cầu. Thử lại sau.",
          baseUrl: null,
          port: null,
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    let preferredPort: number | null = null;
    let dbOnline = false;

    // 1. Per-user heartbeat: the freshest signal we have (the client agent
    //    just polled client-sync and updated this row).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gpmPort: true, gpmIsOnline: true, gpmLastSeenAt: true },
    });

    if (user?.gpmPort) {
      preferredPort = user.gpmPort;
      const seenAtMs = user.gpmLastSeenAt ? user.gpmLastSeenAt.getTime() : 0;
      const isFresh = seenAtMs > 0 && Date.now() - seenAtMs < GPM_HEARTBEAT_FRESH_MS;
      dbOnline = !!user.gpmIsOnline && isFresh;
    }

    // 2. Fall back to the fleet-wide config (admin heartbeat) when this user
    //    has never reported a port of their own.
    if (!preferredPort) {
      const cfg = await prisma.systemConfig
        .findUnique({ where: { key: "gpm_config" } })
        .catch(() => null);
      if (cfg?.value) {
        try {
          const parsed = JSON.parse(cfg.value);
          if (parsed?.port) preferredPort = Number(parsed.port);

          // FIX: only trust the fleet-wide heartbeat when it is itself fresh.
          // Without this, a stale gpm_config row from days ago would keep
          // reporting "online" forever.
          const cfgSeenAt = parsed?.lastSeenAt
            ? new Date(parsed.lastSeenAt).getTime()
            : 0;
          if (
            !dbOnline &&
            parsed?.isOnline !== false &&
            cfgSeenAt > 0 &&
            Date.now() - cfgSeenAt < GPM_HEARTBEAT_FRESH_MS
          ) {
            dbOnline = true;
          }
        } catch {
          // ignore malformed config
        }
      }
    }

    // 3. Live probe of the local GPM HTTP API (bounded so a hung socket
    //    cannot stall the endpoint).
    let status: {
      isOnline: boolean;
      message?: string;
      baseUrl?: string | null;
      port?: number | null;
    };
    try {
      status = await withTimeout(
        gpmClient.checkConnection(preferredPort),
        GPM_PROBE_TIMEOUT_MS,
        "gpm_probe_timeout"
      );
    } catch (probeErr: any) {
      // FIX: a probe timeout/failure must not 500 the endpoint. The DB
      // heartbeat may still be authoritative (VPS ← client agent case).
      status = {
        isOnline: false,
        message: probeErr?.message || "Không thể kết nối GPMLogin",
        baseUrl: preferredPort
          ? `http://127.0.0.1:${preferredPort}/api/v1`
          : gpmClient.getBaseUrl(),
        port: preferredPort ?? null,
      };
    }

    // 4. Local probe failed but the client agent reported online recently:
    //    trust the heartbeat. This is the normal case when this API runs on a
    //    VPS and the GPM instance lives on the operator's workstation.
    if (!status.isOnline && dbOnline && preferredPort) {
      return NextResponse.json({
        isOnline: true,
        message: `GPMLogin online qua Client Agent (cổng ${preferredPort})`,
        baseUrl: `http://127.0.0.1:${preferredPort}/api/v1`,
        port: preferredPort,
        viaClientAgent: true,
      });
    }

    return NextResponse.json({
      ...status,
      port: status.port || preferredPort || null,
    });
  } catch (err: any) {
    // FIX: don't leak internal error text to the caller. Log server-side and
    // return a generic message. Keep HTTP 200 so the UI renders "offline"
    // instead of tripping a global error boundary on every poll.
    console.error("[GPM Status] Unhandled error:", err);
    return NextResponse.json(
      {
        isOnline: false,
        message: "Không thể kết nối GPMLogin",
        baseUrl: null,
        port: null,
      },
      { status: 200 }
    );
  }
}
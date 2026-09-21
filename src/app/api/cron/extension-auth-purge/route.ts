import { NextResponse } from "next/server";
import { purgeExpiredExtensionAuthData, timingSafeEqualStrings } from "@/lib/extension-auth";

// FIX: bound the purge. This function walks multiple tables (refresh tokens,
// auth events, stale pairing codes) and can exceed the platform request
// timeout under load without an explicit ceiling.
const PURGE_TIMEOUT_MS = 60_000;

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

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // FIX: constant-time comparison (see note in the nonce-purge file).
    if (!cronSecret || !authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const provided = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;
    if (!timingSafeEqualStrings(provided, cronSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startedAt = Date.now();
    const result = await withTimeout(
      purgeExpiredExtensionAuthData(),
      PURGE_TIMEOUT_MS,
      "purge_timeout"
    );

    // FIX: normalize the response. Previously `...result` spread whatever
    // shape `purgeExpiredExtensionAuthData()` returned — if that ever changed
    // to include internals (PII counts, IDs), it would leak to the caller.
    // Whitelist known fields instead.
    const safe = {
      refreshTokens: Number(result?.refreshDeleted ?? 0),
      authEvents: Number(result?.eventsDeleted ?? 0),
      pairingCodes: Number(result?.pairingDeleted ?? 0),
      attestNonces: Number(result?.attestNoncesDeleted ?? 0),
    };

    console.log(
      JSON.stringify({
        event: "cron_extension_auth_purge",
        ...safe,
        durationMs: Date.now() - startedAt,
      })
    );

    return NextResponse.json(
      { success: true, ...safe },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("[/api/cron/extension-auth-purge] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Purge failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  if (process.env.CRON_ALLOW_GET !== "1") {
    return NextResponse.json(
      { error: "Method not allowed. Use POST." },
      { status: 405, headers: { Allow: "POST" } }
    );
  }
  return POST(req);
}
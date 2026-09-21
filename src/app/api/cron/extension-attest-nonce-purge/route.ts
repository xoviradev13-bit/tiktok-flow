import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeEqualStrings } from "@/lib/extension-auth";

// FIX: bound the purge so a slow DB does not hang the request past the
// platform timeout (Vercel Hobby = 10s, Pro = 60s, Enterprise = 300s).
const PURGE_TIMEOUT_MS = 30_000;

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

    // FIX: constant-time comparison. String `===` leaks secret length and
    // prefix information via response timing. Timing attacks over a network
    // are noisy, but a cron endpoint is internet-reachable and a dedicated
    // attacker can average out the noise. Cheap to fix, so fix it.
    if (!cronSecret || !authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const provided = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;
    if (!timingSafeEqualStrings(provided, cronSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // FIX: bounded delete + structured log so operational dashboards can
    // see how many rows each run purged.
    const startedAt = Date.now();
    const result = await withTimeout(
      prisma.extensionAttestNonce.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      }),
      PURGE_TIMEOUT_MS,
      "purge_timeout"
    );

    console.log(
      JSON.stringify({
        event: "cron_extension_attest_nonce_purge",
        deleted: result.count,
        durationMs: Date.now() - startedAt,
      })
    );

    return NextResponse.json(
      { success: true, deleted: result.count },
      {
        // FIX: a GET alias on a mutating endpoint can be cached by a misconfigured
        // CDN and replay the delete on subsequent callers. Explicitly forbid.
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Purge failed";
    console.error("[/api/cron/extension-attest-nonce-purge] Error:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// FIX: GET is retained for compatibility with cron services that only issue
// GET, but it is disabled by default when CRON_ALLOW_GET is unset. Set
// CRON_ALLOW_GET=1 in production only if your scheduler requires it.
export async function GET(req: Request) {
  if (process.env.CRON_ALLOW_GET !== "1") {
    return NextResponse.json(
      { error: "Method not allowed. Use POST." },
      { status: 405, headers: { Allow: "POST" } }
    );
  }
  return POST(req);
}
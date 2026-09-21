import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrSyncExchangeRates } from "@/lib/currency";
import { auth } from "@/lib/auth";

/**
 * GET / POST /api/cron/exchange-rates
 * Daily cron job to sync foreign exchange rates (USD, VND, GBP, EUR)
 * Protected by CRON_SECRET or Admin session.
 */
async function handleSync(req: Request) {
  try {
    // FIX: auth() can throw in standalone / cron contexts where
    // NextAsyncLocalStorage is not available. Wrap so the cron secret path
    // still works instead of 500-ing.
    const session = await auth().catch(() => null);

    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

    // FIX: allow LEAD in addition to ADMIN, consistent with the rest of the
    // role hierarchy used across the app.
    const role = (session?.user as { role?: string } | undefined)?.role || null;
    const isPrivileged = role === "ADMIN" || role === "LEAD";

    if (!isCronAuthorized && !isPrivileged) {
      return NextResponse.json(
        { error: "Unauthorized: Yêu cầu quyền Quản trị viên hoặc CRON_SECRET hợp lệ." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const forceLive = searchParams.get("force") === "true";

    // FIX: the original expression `forceLive: true || forceLive` always
    // evaluated to `true`, making the query param dead code. Now the flag is
    // honored: `?force=true` forces a live fetch; otherwise the caller lets
    // `getOrSyncExchangeRates` decide based on its own cache/staleness rules.
    const rates = await getOrSyncExchangeRates(prisma, { forceLive });

    // FIX: defensive — the rate fetcher may return partial data (some APIs
    // return only the pairs they have cached). Do not assume all keys exist.
    const safeNum = (v: unknown, fallback = "n/a"): string => {
      const n = Number(v);
      return Number.isFinite(n) ? n.toLocaleString("vi-VN") : fallback;
    };
    const gbp = safeNum(rates?.GBP_USD);
    const eur = safeNum(rates?.EUR_USD);
    const vnd = safeNum(rates?.USD_VND);
    console.log(
      `[ExchangeRates] Synced: 1 USD = ${vnd} ₫, 1 GBP = $${gbp}, 1 EUR = $${eur}`
    );

    return NextResponse.json({
      success: true,
      message: "Đồng bộ tỷ giá hối đoái thành công.",
      rates,
      forceLive,
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[/api/cron/exchange-rates] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Sync failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handleSync(req);
}

export async function POST(req: Request) {
  return handleSync(req);
}
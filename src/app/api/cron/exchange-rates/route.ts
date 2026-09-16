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
    const session = await auth();
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
    const isAdmin = session?.user?.role === "ADMIN";

    if (!isCronAuthorized && !isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized: Yêu cầu quyền Quản trị viên hoặc CRON_SECRET hợp lệ." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const forceLive = searchParams.get("force") === "true";

    // Fetch fresh exchange rates and update PostgreSQL SystemConfig
    const rates = await getOrSyncExchangeRates(prisma, { forceLive: true || forceLive });

    console.log(
      `[ExchangeRates] Synced: 1 USD = ${rates.USD_VND.toLocaleString("vi-VN")} ₫, 1 GBP = $${rates.GBP_USD}, 1 EUR = $${rates.EUR_USD}`
    );

    return NextResponse.json({
      success: true,
      message: "Đồng bộ tỷ giá hối đoái thành công.",
      rates,
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

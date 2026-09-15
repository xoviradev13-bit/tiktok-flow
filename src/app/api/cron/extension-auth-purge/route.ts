import { NextResponse } from "next/server";
import { purgeExpiredExtensionAuthData } from "@/lib/extension-auth";

/**
 * POST /api/cron/extension-auth-purge
 * Purge expired refresh rows (PII), auth events (90d), and stale pairing codes.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = Boolean(
      cronSecret && authHeader === `Bearer ${cronSecret}`
    );
    if (!isCronAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await purgeExpiredExtensionAuthData();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[/api/cron/extension-auth-purge] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Purge failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}

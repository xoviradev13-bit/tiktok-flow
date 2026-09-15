/**
 * POST /api/cron/extension-attest-nonce-purge
 * Delete expired ExtensionAttestNonce rows (also covered by extension-auth-purge).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    const result = await prisma.extensionAttestNonce.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return NextResponse.json({
      success: true,
      deleted: result.count,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Purge failed";
    console.error("[/api/cron/extension-attest-nonce-purge] Error:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}

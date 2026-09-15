/**
 * GET /api/extension/challenge
 * Server clock for Agent HMAC attest (challengeTs).
 */
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/extension-auth";

export async function GET(req: Request) {
  const ip = getClientIp(req) || "unknown";
  const lim = checkRateLimit(`challenge:ip:${ip}`, 600);
  if (!lim.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(lim.retryAfterSec) },
      }
    );
  }
  return NextResponse.json({ challengeTs: Date.now() });
}

import { NextResponse } from "next/server";
import { gpmClient } from "@/lib/gpm-api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    let preferredPort: number | null = null;
    let dbOnline = false;

    // Check user session
    const session = await auth().catch(() => null);
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { gpmPort: true, gpmIsOnline: true, gpmLastSeenAt: true },
      });
      if (user?.gpmPort) {
        preferredPort = user.gpmPort;
        // If seen within 5 minutes, client agent is actively connected
        const isFresh =
          user.gpmLastSeenAt &&
          Date.now() - user.gpmLastSeenAt.getTime() < 5 * 60 * 1000;
        dbOnline = !!user.gpmIsOnline && !!isFresh;
      }
    }

    // Check system config fallback if no preferred port
    if (!preferredPort) {
      const cfg = await prisma.systemConfig
        .findUnique({
          where: { key: "gpm_config" },
        })
        .catch(() => null);
      if (cfg?.value) {
        try {
          const parsed = JSON.parse(cfg.value);
          if (parsed?.port) preferredPort = Number(parsed.port);
        } catch {}
      }
    }

    const status = await gpmClient.checkConnection(preferredPort);

    // If local check failed (e.g. on remote VPS), but DB reports client agent actively reported online recently:
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
    return NextResponse.json(
      {
        isOnline: false,
        message: err?.message || "Không thể kết nối GPMLogin",
        baseUrl: gpmClient.getBaseUrl(),
        port: null,
      },
      { status: 200 }
    );
  }
}

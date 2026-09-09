import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gpmClient } from "@/lib/gpm-api";
import { findTikTokHandleInProfile, detectTikTokAccountFromGpm } from "@/lib/tiktok-extractor";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await auth();
    const url = new URL(req.url);
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
    const isAdmin = session?.user?.role === "ADMIN";

    if (!isCronAuthorized && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized: Yêu cầu quyền Quản trị viên hoặc CRON_SECRET hợp lệ." }, { status: 401 });
    }

    const health = await gpmClient.checkConnection();
    if (!health.isOnline) {
      return NextResponse.json({
        success: false,
        message: "GPMLogin is currently offline",
      });
    }

    const gpmResult = await gpmClient.listProfiles(1, 200);
    const profiles = gpmResult?.data || [];

    let newCount = 0;
    let updatedCount = 0;

    for (const p of profiles) {
      const realHandle = findTikTokHandleInProfile(p.id);
      let extractedUsername = realHandle || p.name.toLowerCase().replace(/[^a-z0-9_.]/g, "_");
      if (extractedUsername.startsWith("tiktok_")) {
        extractedUsername = extractedUsername.replace(/^tiktok_/, "");
      }
      if (!extractedUsername) {
        extractedUsername = `profile_${p.id.slice(0, 8)}`;
      }

      const existing = await prisma.tiktokAccount.findFirst({
        where: {
          OR: [{ gpmProfileId: p.id }, { username: extractedUsername }],
        },
      });

      if (!existing) {
        let country = "US";
        const lowerName = p.name.toLowerCase();
        const lowerGroup = (p.group_id || "").toLowerCase();
        if (lowerName.includes("uk") || lowerGroup.includes("uk")) country = "UK";
        else if (lowerName.includes("vn") || lowerGroup.includes("vn")) country = "VN";
        else if (lowerName.includes("de")) country = "DE";
        else if (lowerName.includes("fr")) country = "FR";

        let followers = 0;
        let videos = 0;
        let views = 0;
        if (realHandle) {
          try {
            const detected = await detectTikTokAccountFromGpm(p.id);
            if (detected) {
              followers = detected.followersCount;
              videos = detected.videoCount;
              views = detected.totalViews;
            }
          } catch (e) { }
        }

        const newAccount = await prisma.tiktokAccount.create({
          data: {
            username: extractedUsername,
            country,
            groupName: p.group_id || "GPM Fleet",
            gpmProfileId: p.id,
            status: "ACTIVE",
            totalViews: BigInt(views),
            totalFollowers: followers,
            totalVideos: videos,
            totalRevenue: 0,
            lastSyncedAt: new Date(),
          },
        });

        await prisma.accountLog.create({
          data: {
            accountId: newAccount.id,
            newStatus: "ACTIVE",
            logType: "STATUS_CHANGE",
            message: `Tự động đồng bộ theo lịch trình Cron từ GPMLogin Profile "${p.name}"`,
            actorName: "Cron Scheduler",
          },
        });

        newCount++;
      } else {
        const updateData: any = {
          gpmProfileId: p.id,
          groupName: p.group_id || existing.groupName,
          lastSyncedAt: new Date(),
        };
        if (realHandle && existing.username !== realHandle) {
          updateData.username = realHandle;
        }

        await prisma.tiktokAccount.update({
          where: { id: existing.id },
          data: updateData,
        });

        updatedCount++;
      }
    }

    // Update system config last run
    const now = new Date();
    const config = await prisma.systemConfig.findUnique({
      where: { key: "sync_schedule" },
    });
    if (config) {
      try {
        const parsed = JSON.parse(config.value);
        parsed.lastRunAt = now.toISOString();
        await prisma.systemConfig.update({
          where: { key: "sync_schedule" },
          data: { value: JSON.stringify(parsed) },
        });
      } catch (e) { }
    }

    return NextResponse.json({
      success: true,
      scanned: profiles.length,
      imported: newCount,
      updated: updatedCount,
      timestamp: now.toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}

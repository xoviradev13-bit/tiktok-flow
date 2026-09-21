import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gpmClient } from "@/lib/gpm-api";
import { auth } from "@/lib/auth";
import { detectCountryFromText } from "@/lib/country-name";

// FIX: bound the paginated GPM profile fetch.
const GPM_PER_PAGE = 100;
const GPM_MAX_PAGES = 50; // up to 5000 profiles

export async function GET(req: Request) {
  try {
    // FIX: auth() safety wrap for cron / standalone contexts.
    const session = await auth().catch(() => null);
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

    const role = (session?.user as { role?: string } | undefined)?.role || null;
    // FIX: allow LEAD, matching the role hierarchy used elsewhere.
    const isPrivileged = role === "ADMIN" || role === "LEAD";

    if (!isCronAuthorized && !isPrivileged) {
      return NextResponse.json(
        { error: "Unauthorized: Yêu cầu quyền Quản trị viên hoặc CRON_SECRET hợp lệ." },
        { status: 401 }
      );
    }

    // FIX: resolve a real requester ID. Previously `requestedById: u.id`
    // made it look like the target user initiated their own job, losing the
    // audit trail. For cron we fall back to the first active ADMIN.
    let requesterId: string | null = session?.user?.id || null;
    if (!requesterId) {
      const admin = await prisma.user.findFirst({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      requesterId = admin?.id || null;
    }
    if (!requesterId) {
      return NextResponse.json(
        { success: false, error: "Không tìm được người dùng hợp lệ để gán yêu cầu." },
        { status: 500 }
      );
    }

    const health = await gpmClient.checkConnection();

    // ---------------------------------------------------------------
    // VPS mode: GPM is on staff machines. Delegate via SyncQueue.
    // ---------------------------------------------------------------
    if (!health.isOnline) {
      // FIX: only enqueue for users whose Client Agent can actually poll.
      // Previously every user got a job — disabled users or users with the
      // extension disabled would leave jobs stuck in PENDING until timeout.
      const activeUsers = await prisma.user.findMany({
        where: {
          isActive: true,
          extensionAccessEnabled: { not: false },
        },
        select: { id: true },
      });

      let queuedCount = 0;
      const queuedJobIds: string[] = [];

      for (const u of activeUsers) {
        // FIX: race-safe enqueue + dedupe. Create unconditionally, then
        // cancel older PENDING jobs for the same scope. Matches the pattern
        // used by the sweeper endpoint.
        const job = await prisma.syncQueue.create({
          data: {
            requestedById: requesterId,
            targetScope: u.id,
            status: "PENDING",
          },
        });
        queuedCount++;
        queuedJobIds.push(job.id);

        try {
          await prisma.syncQueue.updateMany({
            where: {
              targetScope: u.id,
              status: "PENDING",
              id: { not: job.id },
            },
            data: {
              status: "CANCELLED",
              errorMessage: "Thay thế bởi yêu cầu kiểm kê Fleet mới hơn",
              completedAt: new Date(),
            },
          });
        } catch (dedupeErr) {
          console.warn("[/api/gpm/sync] Dedupe pass failed:", dedupeErr);
        }
      }

      return NextResponse.json({
        success: true,
        mode: "SYNC_QUEUE_DELEGATED",
        message: `GPMLogin không kết nối trực tiếp trên server VPS. Đã giao ${queuedCount} tác vụ vào SyncQueue cho các Client Agent.`,
        queuedCount,
        queuedJobIds,
      });
    }

    // ---------------------------------------------------------------
    // Local mode: GPM is reachable. Pull profiles directly.
    // ---------------------------------------------------------------

    // FIX: paginate. The previous code hardcoded a single call for 200
    // profiles and silently dropped anything past the first page.
    const profiles: any[] = [];
    for (let page = 1; page <= GPM_MAX_PAGES; page++) {
      let result: any;
      try {
        result = await gpmClient.listProfiles(page, GPM_PER_PAGE);
      } catch (pageErr) {
        console.warn(`[/api/gpm/sync] listProfiles page ${page} failed:`, pageErr);
        break;
      }
      const pageRows = result?.data || [];
      if (!Array.isArray(pageRows) || pageRows.length === 0) break;
      profiles.push(...pageRows);
      if (pageRows.length < GPM_PER_PAGE) break;
    }

    // FIX: cache group_id → group_name for the duration of this request.
    // Previously resolveGroupName was called up to 3 times per profile for
    // profiles sharing a group, causing an N+1 storm.
    const groupNameCache = new Map<string, string>();
    async function resolveGroupNameCached(groupId: string | null | undefined): Promise<string> {
      if (!groupId) return "";
      const key = String(groupId);
      if (groupNameCache.has(key)) return groupNameCache.get(key)!;
      let name = "";
      try {
        name = (await gpmClient.resolveGroupName(groupId)) || "";
      } catch {
        name = "";
      }
      groupNameCache.set(key, name);
      return name;
    }

    let newCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const p of profiles) {
      try {
        // FIX: p.name may be null/undefined; the previous code called
        // .toLowerCase() directly and would throw on malformed rows.
        const rawName = String(p?.name || "");
        let extractedUsername = rawName.toLowerCase().replace(/[^a-z0-9_.]/g, "_");
        if (extractedUsername.startsWith("tiktok_")) {
          extractedUsername = extractedUsername.replace(/^tiktok_/, "");
        }
        if (!extractedUsername) {
          extractedUsername = `profile_${String(p.id).slice(0, 8)}`;
        }

        const existing = await prisma.tiktokAccount.findFirst({
          where: {
            OR: [{ gpmProfileId: p.id }, { username: extractedUsername }],
          },
        });

        if (!existing) {
          const resolvedGroupName = await resolveGroupNameCached(p.group_id);
          const country =
            detectCountryFromText(rawName) ||
            detectCountryFromText(resolvedGroupName) ||
            null;

          const newAccount = await prisma.tiktokAccount.create({
            data: {
              username: extractedUsername,
              country: country || undefined,
              gpmProfileName: rawName || null,
              groupName: resolvedGroupName || "GPM Fleet",
              gpmProfileId: p.id,
              status: "ACTIVE",
              totalViews: BigInt(0),
              totalFollowers: 0,
              totalVideos: 0,
              totalRevenue: 0,
              // FIX: do NOT set lastSyncedAt on fleet inventory. That field
              // is the metrics-freshness marker used by the sweeper to find
              // stale accounts. Setting it here makes every account look
              // freshly-metrics-synced and prevents the sweeper from ever
              // scheduling a metrics refresh. Newly created accounts get
              // null so they'll be picked up by the next sweeper run.
              lastSyncedAt: null,
            },
          });

          await prisma.accountLog.create({
            data: {
              accountId: newAccount.id,
              newStatus: "ACTIVE",
              logType: "STATUS_CHANGE",
              message: `Tự động đồng bộ kiểm kê Fleet từ GPMLogin Profile "${rawName}" (ID: ${p.id})`,
              actorName: isCronAuthorized ? "Cron Scheduler" : (session?.user?.name || "Admin"),
            },
          });

          newCount++;
        } else {
          const resolvedGroupName = await resolveGroupNameCached(p.group_id);

          const updateData: any = {
            gpmProfileId: p.id,
            gpmProfileName: rawName || existing.gpmProfileName || null,
            groupName: resolvedGroupName || existing.groupName,
            // FIX: do NOT touch lastSyncedAt (see comment above).
          };

          // FIX: upgrade country on update too, when we have a specific
          // detection and the current value is default/unset.
          const detectedCountry =
            detectCountryFromText(rawName) ||
            detectCountryFromText(resolvedGroupName);
          if (
            detectedCountry &&
            (!existing.country || existing.country === "US" || existing.country === "Unknown")
          ) {
            updateData.country = detectedCountry;
          }

          await prisma.tiktokAccount.update({
            where: { id: existing.id },
            data: updateData,
          });

          updatedCount++;
        }
      } catch (profileErr: any) {
        failedCount++;
        console.warn(
          `[/api/gpm/sync] Profile ${p?.id} failed:`,
          profileErr?.message || profileErr
        );
      }
    }

    // Update system config last run
    const now = new Date();
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { key: "sync_schedule" },
      });
      if (config) {
        const parsed = JSON.parse(config.value);
        parsed.lastRunAt = now.toISOString();
        await prisma.systemConfig.update({
          where: { key: "sync_schedule" },
          data: { value: JSON.stringify(parsed) },
        });
      }
    } catch (e) {
      console.warn("[/api/gpm/sync] Could not update sync_schedule lastRunAt:", e);
    }

    return NextResponse.json({
      success: true,
      mode: "LOCAL_DIRECT",
      scanned: profiles.length,
      imported: newCount,
      updated: updatedCount,
      failedCount,
      timestamp: now.toISOString(),
    });
  } catch (err: any) {
    console.error("[/api/gpm/sync] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
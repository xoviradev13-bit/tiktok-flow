import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  checkRateLimit,
  getClientIp,
  resolveExtensionBearerAuth,
} from "@/lib/extension-auth";
import { toStandardCountryCode } from "@/lib/country-name";
import { splitGpmNameFields } from "@/lib/gpm-profile-fields";

export interface VideoItemMetric {
  id?: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  postDate?: string;
  privacy?: string;
  coverUrl?: string;
}

export interface TopVideoItem {
  rank?: number;
  title: string;
  viewsInRange: number;
  allViews?: number;
  postedOn?: string;
}

export interface ExtensionReportPayload {
  username: string;
  nickname?: string;
  avatarUrl?: string;
  followersCount?: number;
  followingCount?: number;
  totalLikes?: number;
  videoCount?: number;
  totalVideos?: number;
  totalViews?: number;
  totalRevenue?: number;
  rpm?: number;
  currency?: string;
  country?: string;
  isLoggedIn: boolean;
  personalToken?: string;
  memberEmail?: string;
  gpmProfileId?: string;
  gpmProfileName?: string;
  gpmGroupName?: string;
  /** Explicit client origin: extension = identity only; agent = full metrics */
  source?: "extension" | "agent";
  metricsSource?: string;

  // Per-video Metrics (views, likes, comments for each video)
  videosList?: VideoItemMetric[];

  // Most views video in 7, 28, 60, 365 days
  topVideos?: {
    past7d?: TopVideoItem[];
    past28d?: TopVideoItem[];
    past60d?: TopVideoItem[];
    past365d?: TopVideoItem[];
  };

  // Structured JSON summaries & breakdowns
  sumRevenue?: {
    revenue7d: number;
    revenue28d: number;
    revenue60d: number;
    revenue365d: number;
    totalRevenue: number;
  } | null;
  sumViews?: {
    views7d: number;
    views28d: number;
    views60d: number;
    views365d: number;
    totalViews: number;
  } | null;
  sumLikes?: {
    likes7d: number;
    likes28d: number;
    likes60d: number;
    likes365d: number;
    totalLikes: number;
  } | null;
  sumComments?: {
    comments7d: number;
    comments28d: number;
    comments60d: number;
    comments365d: number;
  } | null;
  sumShares?: {
    shares7d: number;
    shares28d: number;
    shares60d: number;
    shares365d: number;
  } | null;
  sumProfileViews?: {
    profileViews7d: number;
    profileViews28d: number;
    profileViews60d: number;
    profileViews365d: number;
  } | null;
  revenueBreakdown?: {
    totalRevenue?: any;
    tiktokShop?: any;
    activePrograms?: any[];
  } | null;
  dailyRevenueBreakdown?: Array<{ date: string; revenue: number }> | null;
  insightsHistory?: Record<string, any> | null;
  postRewards?: Array<{
    title: string;
    views: number;
    reward: number;
    currency?: string;
    coverUrl?: string;
    postDate?: string;
    programName?: string;
    duration?: string;
    rpm?: number | string;
  }> | null;
  creatorRewardsMissing?: boolean;
  bannedReason?: string;
  metadata?: Record<string, any> | null;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req) || "unknown";
    const authHeaderEarly = req.headers.get("authorization");
    const isBearer = authHeaderEarly?.startsWith("Bearer ");
    const ipLimit = checkRateLimit(`report:ip:${ip}`, isBearer ? 2400 : 180);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }

    const body = (await req.json()) as ExtensionReportPayload;
    const {
      username,
      nickname,
      avatarUrl,
      followersCount = 0,
      followingCount,
      totalLikes,
      videoCount = 0,
      totalVideos,
      totalViews,
      totalRevenue,
      rpm,
      currency,
      country,
      isLoggedIn,
      personalToken,
      memberEmail,
      gpmProfileId,
      gpmProfileName,
      gpmGroupName,
      source,
      metricsSource,
      videosList,
      topVideos,
      sumRevenue,
      sumViews,
      sumLikes,
      sumComments,
      sumShares,
      sumProfileViews,
      revenueBreakdown,
      dailyRevenueBreakdown,
      insightsHistory,
    } = body;

    // Extension = identity/GPM/assignment only. Agent writes metrics.
    const isIdentityOnly =
      source === "extension" || metricsSource === "identity";
    const applyMetrics =
      !isIdentityOnly &&
      (source === "agent" ||
        metricsSource === "agent" ||
        metricsSource === "studio" ||
        followersCount > 0 ||
        !!sumRevenue ||
        !!sumViews ||
        (totalRevenue !== undefined && totalRevenue > 0) ||
        (totalViews !== undefined && totalViews > 0) ||
        !!(videosList && videosList.length));

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing required 'username' parameter." },
        { status: 400 }
      );
    }

    const cleanUsername = username.replace(/^@/, "").trim().toLowerCase();
    if (!cleanUsername) {
      return NextResponse.json(
        { success: false, error: "Invalid username format." },
        { status: 400 }
      );
    }

    // 1. Authenticate via Authorization Bearer (access JWT preferred; legacy personalToken until sunset)
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const activeToken = (bearerToken || personalToken)?.trim();

    if (!activeToken) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu Authorization: Bearer <accessToken|personalToken> để gửi dữ liệu báo cáo Extension." },
        { status: 401 }
      );
    }

    const authResult = await resolveExtensionBearerAuth(activeToken, "/api/extension/report");
    if (!authResult.ok) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      );
    }

    const memberUser = authResult.user;

    const isAgentSource = body.source === "agent" || body.metricsSource === "agent";
    const userLimitMax = isAgentSource ? 1200 : 120;
    const userLimit = checkRateLimit(`report:user:${memberUser.id}`, userLimitMax);
    if (!userLimit.ok) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSec) } }
      );
    }

    const actorName =
      memberUser.name || memberUser.email || memberUser.username || "Companion Extension";

    // Auto-resolve GPM profile when Extension did not send one (disk scan on workstation)
    let resolvedGpmProfileId =
      typeof gpmProfileId === "string" && gpmProfileId.trim() ? gpmProfileId.trim() : null;
    let resolvedGpmProfileName =
      typeof gpmProfileName === "string" && gpmProfileName.trim()
        ? gpmProfileName.trim()
        : null;
    let resolvedGpmGroupName =
      typeof gpmGroupName === "string" && gpmGroupName.trim()
        ? gpmGroupName.trim()
        : null;
    let gpmMatchedVia: string | null = resolvedGpmProfileId ? "client" : null;

    if (!resolvedGpmProfileId) {
      const existingAccount = await prisma.tiktokAccount.findUnique({
        where: { username: cleanUsername },
        select: { gpmProfileId: true, gpmProfileName: true, groupName: true },
      });
      if (existingAccount?.gpmProfileId) {
        resolvedGpmProfileId = existingAccount.gpmProfileId;
        resolvedGpmProfileName = existingAccount.gpmProfileName || resolvedGpmProfileName;
        resolvedGpmGroupName = existingAccount.groupName || resolvedGpmGroupName;
        gpmMatchedVia = "db:matched";
      }
    }

    // If a GPM id is claimed, refuse to steal it from a different TikTok username
    if (resolvedGpmProfileId) {
      const conflict = await prisma.tiktokAccount.findFirst({
        where: {
          gpmProfileId: resolvedGpmProfileId,
          NOT: { username: cleanUsername },
        },
        select: { id: true, username: true },
      });
      if (conflict) {
        console.warn(
          `[ExtensionReport] GPM ${resolvedGpmProfileId} already linked to @${conflict.username}; skipping attach for @${cleanUsername}`
        );
        resolvedGpmProfileId = null;
        gpmMatchedVia = null;
      }
    }

    // 2. Find existing account by username or gpmProfileId
    let account: any = await prisma.tiktokAccount.findFirst({
      where: {
        OR: [
          { username: cleanUsername },
          ...(resolvedGpmProfileId ? [{ gpmProfileId: resolvedGpmProfileId }] : []),
        ],
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true, username: true } },
      },
    });

    // Ensure profileName and groupName are properly separated and not cross-stored
    const nameFields = splitGpmNameFields({
      profileName: resolvedGpmProfileName,
      groupName: resolvedGpmGroupName,
      existingProfileName: account?.gpmProfileName,
      existingGroupName: account?.groupName,
    });

    const targetStatus = isLoggedIn ? "ACTIVE" : "WARMING";
    const previousStatus = account?.status || null;

    if (!account) {
      // Create new account
      const assignedUserId = memberUser?.id || null;
      account = await prisma.tiktokAccount.create({
        data: {
          username: cleanUsername,
          gpmProfileId: resolvedGpmProfileId || null,
          gpmProfileName: nameFields.gpmProfileName || null,
          groupName: nameFields.groupName || null,
          status: body.creatorRewardsMissing ? "BANNED" : targetStatus,
          bannedReason: body.creatorRewardsMissing ? (body.bannedReason || "Bị ngừng chương trình TikTok Beta (Creator Rewards Program)") : null,
          metadata: body.metadata || (body.creatorRewardsMissing ? { creatorRewardsStatus: "BANNED" } : undefined),
          isOnline: isLoggedIn === true,
          country: toStandardCountryCode(country) || undefined,
          assignedUserId,
          isAssignmentLocked: false,
          totalFollowers: applyMetrics && typeof followersCount === "number" ? followersCount : 0,
          totalVideos: applyMetrics ? (totalVideos ?? videoCount ?? 0) : 0,
          totalViews: applyMetrics && totalViews !== undefined && totalViews !== null ? BigInt(totalViews) : BigInt(0),
          totalRevenue:
            applyMetrics && totalRevenue !== undefined && totalRevenue !== null
              ? totalRevenue
              : 0,
          lastSyncedAt: new Date(),
        },
        include: {
          assignedUser: { select: { id: true, name: true, email: true, username: true } },
        },
      });

      await prisma.accountLog.create({
        data: {
          accountId: account.id,
          newStatus: targetStatus,
          logType: "STATUS_CHANGE",
          message: isIdentityOnly
            ? `Tài khoản TikTok @${cleanUsername} được phát hiện qua Extension (${actorName}). Trạng thái: ${isLoggedIn ? "Đã đăng nhập" : "Chưa đăng nhập"}.${resolvedGpmProfileId
              ? ` Gắn GPM Profile ${resolvedGpmProfileId} (${gpmMatchedVia}).`
              : ""
            } Số liệu sẽ do Client Agent cập nhật.`
            : `Tài khoản TikTok @${cleanUsername} được phát hiện trực tiếp qua Extension (${actorName}). Trạng thái: ${isLoggedIn ? "Đã đăng nhập" : "Chưa đăng nhập"}.${resolvedGpmProfileId
              ? ` Gắn GPM Profile ${resolvedGpmProfileId} (${gpmMatchedVia}).`
              : ""
            }`,
          actorName,
        },
      });
    } else {
      const updateData: any = {
        lastSyncedAt: new Date(),
      };

      if (typeof isLoggedIn === "boolean") {
        updateData.isOnline = isLoggedIn;
      }

      if (applyMetrics) {
        if (typeof followersCount === "number") updateData.totalFollowers = followersCount;
        if (typeof totalVideos === "number") {
          updateData.totalVideos = totalVideos;
        } else if (typeof videoCount === "number") {
          updateData.totalVideos = videoCount;
        }
        if (totalViews !== undefined && totalViews !== null) updateData.totalViews = BigInt(totalViews);
        if (totalRevenue !== undefined && totalRevenue !== null) updateData.totalRevenue = totalRevenue;
      }
      if (country) updateData.country = toStandardCountryCode(country);
      if (resolvedGpmProfileId) {
        updateData.gpmProfileId = resolvedGpmProfileId;
      }
      if (nameFields.gpmProfileName && nameFields.gpmProfileName !== account.gpmProfileName) {
        updateData.gpmProfileName = nameFields.gpmProfileName;
      }
      if (nameFields.groupName && nameFields.groupName !== account.groupName) {
        updateData.groupName = nameFields.groupName;
      }

      let isBannedFromCreatorRewards = false;
      if (body.creatorRewardsMissing === true) {
        if (account.status !== "WARMING") {
          isBannedFromCreatorRewards = true;
          updateData.status = "BANNED";
          const reason = body.bannedReason || "Bị ngừng chương trình TikTok Beta (Creator Rewards Program)";
          updateData.bannedReason = reason;
          const existingMeta = (account.metadata as Record<string, any>) || {};
          updateData.metadata = {
            ...existingMeta,
            creatorRewardsStatus: "BANNED",
            bannedAt: new Date().toISOString(),
            bannedReason: reason,
          };
          if (account.status !== "BANNED") {
            await prisma.accountLog.create({
              data: {
                accountId: account.id,
                oldStatus: account.status,
                newStatus: "BANNED",
                logType: "STATUS_CHANGE",
                message: `[MẤT QUYỀN KIẾM TIỀN] Không tìm thấy tab Creator Rewards Program trên TikTok Studio -> Trạng thái: BANNED. Lý do: ${reason}`,
                actorName: actorName || "Client Agent",
              },
            });
            await prisma.accountAlert.create({
              data: {
                accountId: account.id,
                alertType: "PROGRAM_DISQUALIFIED",
                severity: "CRITICAL",
                description: `Tài khoản @${cleanUsername} bị mất chương trình Creator Rewards Program (TikTok Beta).`,
                status: "OPEN",
              },
            });

            // Mid-day ban checklist adjustment: recalculate score if configured
            try {
              const scoringRecord = await prisma.systemConfig.findUnique({ where: { key: "scoring_rules" } });
              const scoringCfg = scoringRecord?.value ? JSON.parse(scoringRecord.value) : {};
              const shouldExcludeBanned = scoringCfg.excludeBannedAccounts !== false;

              if (shouldExcludeBanned) {
                const now = new Date();
                const todayOnly = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
                const checkItem = await prisma.dailyChecklistItem.findFirst({
                  where: { accountId: account.id, checklist: { date: todayOnly } },
                  include: { checklist: { include: { items: { include: { account: true } } } } },
                });
                if (checkItem?.checklist) {
                  const eligibleItems = checkItem.checklist.items.filter(
                    (i) => i.accountId !== account.id && i.account?.status !== "BANNED"
                  );
                  const totalAssigned = eligibleItems.length;
                  const completedCount = eligibleItems.filter((i) => i.isCompleted || i.isPosted).length;
                  const { calculateWorkdayScore } = await import("@/lib/scoring-engine");
                  const { completionRate, workdayScore } = calculateWorkdayScore(totalAssigned, completedCount, scoringCfg);
                  await prisma.dailyChecklist.update({
                    where: { id: checkItem.checklist.id },
                    data: { totalAssigned, completedCount, completionRate, workdayScore },
                  });
                }
              }
            } catch (calcErr) {
              console.warn("[ExtensionReport] Failed to recalculate checklist after ban:", calcErr);
            }
          }
        }
      } else if (body.creatorRewardsMissing === false && account.status === "BANNED") {
        // AUTO-RECOVERY: TikTok Creator Rewards Program has been restored!
        const meta = (account.metadata as Record<string, any>) || {};
        const isBannedDueToRewards =
          meta.creatorRewardsStatus === "BANNED" ||
          (account.bannedReason && /creator|quỹ|beta/i.test(account.bannedReason));

        if (isBannedDueToRewards) {
          updateData.status = "ACTIVE";
          updateData.bannedReason = null;
          updateData.metadata = {
            ...meta,
            creatorRewardsStatus: "ACTIVE",
            recoveredAt: new Date().toISOString(),
          };
          delete (updateData.metadata as any).bannedReason;

          await prisma.accountLog.create({
            data: {
              accountId: account.id,
              oldStatus: "BANNED",
              newStatus: "ACTIVE",
              logType: "STATUS_CHANGE",
              message: `[KHÔI PHÚC QUYỀN KIẾM TIỀN] Đã phát hiện lại chương trình Creator Rewards Program trên TikTok Studio -> Trạng thái khôi phục: ACTIVE.`,
              actorName: actorName || "Client Agent",
            },
          });

          // Resolve open PROGRAM_DISQUALIFIED alert
          await prisma.accountAlert.updateMany({
            where: {
              accountId: account.id,
              alertType: "PROGRAM_DISQUALIFIED",
              status: "OPEN",
            },
            data: {
              status: "RESOLVED",
              resolvedAt: new Date(),
            },
          });

          // Recalculate daily checklist on recovery (restore account to active scoring pool)
          try {
            const scoringRecord = await prisma.systemConfig.findUnique({ where: { key: "scoring_rules" } });
            const scoringCfg = scoringRecord?.value ? JSON.parse(scoringRecord.value) : {};
            const shouldExcludeBanned = scoringCfg.excludeBannedAccounts !== false;

            if (shouldExcludeBanned) {
              const now = new Date();
              const todayOnly = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
              const checkItem = await prisma.dailyChecklistItem.findFirst({
                where: { accountId: account.id, checklist: { date: todayOnly } },
                include: { checklist: { include: { items: { include: { account: true } } } } },
              });
              if (checkItem?.checklist) {
                // Now account is ACTIVE, so it counts towards eligible items
                const eligibleItems = checkItem.checklist.items.filter(
                  (i) => i.accountId === account.id || i.account?.status !== "BANNED"
                );
                const totalAssigned = eligibleItems.length;
                const completedCount = eligibleItems.filter((i) => i.isCompleted || i.isPosted).length;
                const { calculateWorkdayScore } = await import("@/lib/scoring-engine");
                const { completionRate, workdayScore } = calculateWorkdayScore(totalAssigned, completedCount, scoringCfg);
                await prisma.dailyChecklist.update({
                  where: { id: checkItem.checklist.id },
                  data: { totalAssigned, completedCount, completionRate, workdayScore },
                });
              }
            }
          } catch (calcErr) {
            console.warn("[ExtensionReport] Failed to recalculate checklist after recovery:", calcErr);
          }
        }
      }

      if (body.metadata && !isBannedFromCreatorRewards) {
        const existingMeta = (account.metadata as Record<string, any>) || {};
        updateData.metadata = { ...existingMeta, ...body.metadata };
      }

      if (!isBannedFromCreatorRewards && account.status !== "BANNED" && isLoggedIn && account.status !== "ACTIVE" && updateData.status !== "ACTIVE") {
        updateData.status = "ACTIVE";
      }

      // 3. Handover & Assignment Lock Logic
      if (memberUser && memberUser.id !== account.assignedUserId) {
        if (account.isAssignmentLocked) {
          // Account is LOCKED by Admin: Do NOT reassign, only update metrics
          console.log(
            `[ExtensionReport] Account @${cleanUsername} is locked by Admin. Ownership remains with ${account.assignedUser?.name || "current owner"}.`
          );
        } else {
          // Fluid Handover: Transfer custody to the active operator
          const oldOwner = account.assignedUser?.name || account.assignedUser?.username || "Chưa gán";
          const newOwner =
            memberUser.name || memberUser.username || memberUser.email || "Companion Extension";
          updateData.assignedUserId = memberUser.id;

          await prisma.accountLog.create({
            data: {
              accountId: account.id,
              oldStatus: account.status,
              newStatus: account.status,
              logType: "HANDOVER",
              message: `[BÀN GIAO CA] Quyền quản lý tài khoản @${cleanUsername} đã được chuyển giao từ ${oldOwner} sang ${newOwner} khi mở trên profile mới.`,
              actorName: newOwner,
            },
          });
        }
      }

      const linkedGpmNow =
        !!resolvedGpmProfileId && !account.gpmProfileId && !!updateData.gpmProfileId;

      account = await prisma.tiktokAccount.update({
        where: { id: account.id },
        data: updateData,
        include: {
          assignedUser: { select: { id: true, name: true, email: true, username: true } },
        },
      });

      if (linkedGpmNow) {
        await prisma.accountLog.create({
          data: {
            accountId: account.id,
            oldStatus: account.status,
            newStatus: account.status,
            logType: "STATUS_CHANGE",
            message: `Tự động gắn GPM Profile ${resolvedGpmProfileId} cho @${cleanUsername} (${gpmMatchedVia}).`,
            actorName,
          },
        });
      }
    }

    // 4. Daily Checklist Video Ingestion: Store videos posted today into DailyChecklistItem.videosSnapshot
    if (Array.isArray(videosList) && videosList.length > 0) {
      try {
        const now = new Date();
        const todayOnly = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        
        // Helper to extract Vietnam Date string (YYYY-MM-DD)
        const parseVnDate = (v: any) => {
          let d: Date | null = null;
          if (v.createTime || v.create_time || v.createtime) {
            const sec = Number(v.createTime || v.create_time || v.createtime);
            d = new Date(sec > 1e11 ? sec : sec * 1000);
          } else if (v.postDate) {
            const parsed = new Date(v.postDate);
            if (!isNaN(parsed.getTime())) d = parsed;
          }
          if (!d || isNaN(d.getTime())) return null;
          const vnString = d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
          const vnDate = new Date(vnString);
          const y = vnDate.getFullYear();
          const m = String(vnDate.getMonth() + 1).padStart(2, "0");
          const day = String(vnDate.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        };

        const todayVnString = (() => {
          const vnNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
          const y = vnNow.getFullYear();
          const m = String(vnNow.getMonth() + 1).padStart(2, "0");
          const day = String(vnNow.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        })();

        const todayVideos = videosList.filter((v) => parseVnDate(v) === todayVnString);

        const checkItem = await prisma.dailyChecklistItem.findFirst({
          where: {
            accountId: account.id,
            checklist: { date: todayOnly },
          },
        });

        if (checkItem) {
          const updateFields: Record<string, any> = { isSynced: true };
          if (todayVideos.length > 0) {
            updateFields.isPosted = true;
            updateFields.videosSnapshot = todayVideos;
          }
          await prisma.dailyChecklistItem.update({
            where: { id: checkItem.id },
            data: updateFields,
          });
        }
      } catch (checkItemErr) {
        console.warn("[ExtensionReport] Failed to ingest daily checklist videos:", checkItemErr);
      }
    }

    // 5. Persist comprehensive analytics snapshot (Agent metrics only — never zero out from Extension)
    let analyticsSnapshot: Record<string, unknown> | null = null;
    let resolvedPostRewards: any[] | undefined = Array.isArray(body.postRewards) ? body.postRewards : undefined;
    if (applyMetrics) {
      // Clean rawSnapshot: keep newest 20 videos for lightweight preview
      analyticsSnapshot = {
        username: cleanUsername,
        updatedAt: new Date().toISOString(),
        videosList: Array.isArray(videosList) ? videosList.slice(0, 20) : [],
        topVideos: topVideos || {},
      };

      const effectiveTotalRevenue =
        typeof totalRevenue === "number"
          ? totalRevenue
          : typeof sumRevenue?.totalRevenue === "number"
            ? sumRevenue.totalRevenue
            : 0;

      const resolvedSumRevenue = sumRevenue || {
        revenue7d: 0,
        revenue28d: 0,
        revenue60d: 0,
        revenue365d: 0,
        totalRevenue: effectiveTotalRevenue || 0,
      };

      const resolvedSumViews = sumViews || {
        views7d: 0,
        views28d: 0,
        views60d: 0,
        views365d: totalViews || 0,
        totalViews: totalViews || 0,
      };

      const resolvedSumLikes = sumLikes || {
        likes7d: 0,
        likes28d: totalLikes || 0,
        likes60d: 0,
        likes365d: 0,
        totalLikes: totalLikes || 0,
      };

      const resolvedSumComments = sumComments || {
        comments7d: 0,
        comments28d: 0,
        comments60d: 0,
        comments365d: 0,
      };

      const resolvedSumShares = sumShares || {
        shares7d: 0,
        shares28d: 0,
        shares60d: 0,
        shares365d: 0,
      };

      const resolvedSumProfileViews = sumProfileViews || {
        profileViews7d: 0,
        profileViews28d: 0,
        profileViews60d: 0,
        profileViews365d: 0,
      };

      const resolvedRevenueBreakdown = revenueBreakdown || null;
      const resolvedDailyRevenueBreakdown = dailyRevenueBreakdown || null;

      // Smart Retention & Capping (150-video rule) for postRewards
      if (Array.isArray(body.postRewards)) {
        try {
          const existingAnalytics = await prisma.accountAnalytics.findUnique({
            where: { accountId: account.id },
            select: { postRewards: true },
          });
          const existingList = Array.isArray(existingAnalytics?.postRewards)
            ? (existingAnalytics.postRewards as any[])
            : [];
          
          const map = new Map<string, any>();
          for (const item of existingList) {
            const key = String((item as any).id || (item as any).videoId || (item as any).title);
            map.set(key, item);
          }
          for (const item of body.postRewards) {
            const key = String((item as any).id || (item as any).videoId || (item as any).title);
            map.set(key, item);
          }

          const allMerged = Array.from(map.values());
          const nowMs = Date.now();
          const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

          const parseTimeMs = (v: any) => {
            if (v.publishTimeUnix) return Number(v.publishTimeUnix) * 1000;
            const parsed = new Date(v.publishDate || v.postDate || v.postTime || "").getTime();
            return !isNaN(parsed) ? parsed : 0;
          };

          const parseRewardAmount = (v: any) => {
            const val = v.reward ?? v.rewardAmount ?? v.rewards ?? 0;
            if (typeof val === "number") return val;
            const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
            return !isNaN(parsed) ? parsed : 0;
          };

          const recentVideos = allMerged.filter((v) => {
            const ts = parseTimeMs(v);
            return ts > 0 && nowMs - ts <= SIXTY_DAYS_MS;
          });

          const olderVideos = allMerged.filter((v) => {
            const ts = parseTimeMs(v);
            return ts <= 0 || nowMs - ts > SIXTY_DAYS_MS;
          });

          // Sort older videos descending by revenue, then by timestamp
          olderVideos.sort((a, b) => {
            const revDiff = parseRewardAmount(b) - parseRewardAmount(a);
            if (Math.abs(revDiff) > 0.0001) return revDiff;
            return parseTimeMs(b) - parseTimeMs(a);
          });

          // Cap total to 150 items max
          const MAX_POST_REWARDS_CAP = 150;
          const allowedOlderCount = Math.max(0, MAX_POST_REWARDS_CAP - recentVideos.length);
          const retainedOlderVideos = olderVideos.slice(0, allowedOlderCount);

          const finalPostRewards = [...recentVideos, ...retainedOlderVideos];
          // Sort final list newest first for clean UI rendering
          finalPostRewards.sort((a, b) => parseTimeMs(b) - parseTimeMs(a));

          resolvedPostRewards = finalPostRewards;
        } catch (postRewardsErr) {
          console.warn("[ExtensionReport] Error during postRewards smart capping:", postRewardsErr);
        }
      }

      // 5a. Upsert into AccountAnalytics (Single Source of Truth)
      try {
        await prisma.accountAnalytics.upsert({
          where: { accountId: account.id },
          create: {
            accountId: account.id,
            currency: currency || "$",
            sumRevenue: resolvedSumRevenue as any,
            sumViews: resolvedSumViews as any,
            sumLikes: resolvedSumLikes as any,
            sumComments: resolvedSumComments as any,
            sumShares: resolvedSumShares as any,
            sumProfileViews: resolvedSumProfileViews as any,
            revenueBreakdown: resolvedRevenueBreakdown as any,
            dailyRevenueBreakdown: resolvedDailyRevenueBreakdown as any,
            insightsHistory: insightsHistory || (body as any).insightsHistory || null,
            postRewards: (resolvedPostRewards as any) || undefined,
            rawSnapshot: analyticsSnapshot as any,
          },
          update: {
            currency: currency || "$",
            sumRevenue: resolvedSumRevenue as any,
            sumViews: resolvedSumViews as any,
            sumLikes: resolvedSumLikes as any,
            sumComments: resolvedSumComments as any,
            sumShares: resolvedSumShares as any,
            sumProfileViews: resolvedSumProfileViews as any,
            revenueBreakdown: resolvedRevenueBreakdown as any,
            dailyRevenueBreakdown: resolvedDailyRevenueBreakdown as any,
            insightsHistory: insightsHistory || (body as any).insightsHistory || undefined,
            postRewards: (resolvedPostRewards as any) || undefined,
            rawSnapshot: analyticsSnapshot as any,
          },
        });
      } catch (anErr: any) {
        console.warn("[ExtensionReport] Failed to upsert AccountAnalytics:", anErr.message);
      }
    }

    // Handle alerts based on login state
    if (isLoggedIn) {
      await prisma.accountAlert.updateMany({
        where: {
          accountId: account.id,
          alertType: "NOT_LOGGED_IN",
          status: "OPEN",
        },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });
    } else {
      const existingAlert = await prisma.accountAlert.findFirst({
        where: {
          accountId: account.id,
          alertType: "NOT_LOGGED_IN",
          status: "OPEN",
        },
      });

      if (!existingAlert) {
        await prisma.accountAlert.create({
          data: {
            accountId: account.id,
            alertType: "NOT_LOGGED_IN",
            severity: "WARNING",
            description: `Tài khoản @${cleanUsername} phát hiện chưa đăng nhập trên profile trình duyệt.`,
            status: "OPEN",
          },
        });
      }
    }

    // Handle alerts for punished / disqualified videos (within nearest 30 days)
    const listToExamine = Array.isArray(resolvedPostRewards) ? resolvedPostRewards : body.postRewards;
    if (Array.isArray(listToExamine)) {
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const punishedVideos = listToExamine.filter((v: any) => {
        if (!v?.isPunished) return false;
        const ts = v.publishTimeUnix
          ? Number(v.publishTimeUnix) * 1000
          : new Date(v.publishDate || v.postDate || v.postTime || "").getTime();
        return !isNaN(ts) ? now - ts <= THIRTY_DAYS_MS : false;
      });

      // Persist strike level and 30-day count directly into account metadata
      const strikeLevel = punishedVideos.length >= 5 ? 5 : punishedVideos.length;
      try {
        const latestAccountRecord = await prisma.tiktokAccount.findUnique({
          where: { id: account.id },
          select: { metadata: true },
        });
        const currentMeta = (latestAccountRecord?.metadata as Record<string, any>) || {};
        await prisma.tiktokAccount.update({
          where: { id: account.id },
          data: {
            metadata: {
              ...currentMeta,
              punishedVideosCount30d: punishedVideos.length,
              strikeLevel,
            },
          },
        });
      } catch (metaErr) {
        console.warn("[ExtensionReport] Could not update strike metadata:", metaErr);
      }

      if (punishedVideos.length > 0) {
        const progCounts: Record<string, number> = {};
        for (const pv of punishedVideos) {
          const pName = pv.programName || "Chương trình Creator Rewards";
          progCounts[pName] = (progCounts[pName] || 0) + 1;
        }
        const progSummary = Object.entries(progCounts)
          .map(([name, count]) => `${count} video thuộc ${name}`)
          .join(", ");

        const desc = `Có ${punishedVideos.length} video bị huỷ điều kiện kiếm tiền trong 30 ngày gần nhất (${progSummary}).`;
        const severity: "CRITICAL" | "WARNING" =
          punishedVideos.length >= 3 ? "CRITICAL" : "WARNING";

        const existingStrikeAlert = await prisma.accountAlert.findFirst({
          where: {
            accountId: account.id,
            alertType: "VIDEO_STRIKE",
            status: "OPEN",
          },
        });

        if (existingStrikeAlert) {
          await prisma.accountAlert.update({
            where: { id: existingStrikeAlert.id },
            data: {
              description: desc,
              severity,
            },
          });
        } else {
          await prisma.accountAlert.create({
            data: {
              accountId: account.id,
              alertType: "VIDEO_STRIKE",
              severity,
              description: desc,
              status: "OPEN",
            },
          });
        }
      } else {
        await prisma.accountAlert.updateMany({
          where: {
            accountId: account.id,
            alertType: "VIDEO_STRIKE",
            status: "OPEN",
          },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
          },
        });
      }
    }

    // Log status change if changed to ACTIVE
    if (isLoggedIn && previousStatus && previousStatus !== "ACTIVE") {
      await prisma.accountLog.create({
        data: {
          accountId: account.id,
          oldStatus: previousStatus,
          newStatus: "ACTIVE",
          logType: "STATUS_CHANGE",
          message: `Xác minh đăng nhập TikTok thành công trong trình duyệt (${actorName}).`,
          actorName,
        },
      });
    }

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        username: account.username,
        status: account.status,
        gpmProfileId: account.gpmProfileId,
        gpmMatchedVia,
        followers: account.totalFollowers,
        videos: account.totalVideos,
        revenue: account.totalRevenue,
        isAssignmentLocked: account.isAssignmentLocked,
        assignedTo: account.assignedUser?.name || account.assignedUser?.username || null,
        lastSyncedAt: account.lastSyncedAt,
      },
      analytics: analyticsSnapshot,
    });
  } catch (error: any) {
    console.error("[ExtensionReport] Error handling extension report:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    let session = null;
    try {
      session = await auth();
    } catch {
      // In standalone runner or external invocation, auth() may fail due to missing NextAsyncLocalStorage
    }
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    if (!session?.user?.id && !bearerToken) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu đăng nhập hoặc token hợp lệ để xem số liệu phân tích." },
        { status: 401 }
      );
    }

    let callerId: string | null = session?.user?.id || null;
    let callerRole: string | null = (session?.user as { role?: string } | undefined)?.role || null;

    if (bearerToken) {
      const authResult = await resolveExtensionBearerAuth(bearerToken, "/api/extension/report:GET");
      if (!authResult.ok) {
        return NextResponse.json(
          { success: false, error: authResult.error },
          { status: authResult.status }
        );
      }
      callerId = authResult.user.id;
      callerRole = authResult.user.role || null;
    }

    if (!callerId) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu đăng nhập hoặc token hợp lệ để xem số liệu phân tích." },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const username = url.searchParams.get("username")?.replace(/^@/, "").trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ success: false, error: "Missing 'username' query parameter" }, { status: 400 });
    }

    const account = await prisma.tiktokAccount.findUnique({
      where: { username },
      select: { id: true, assignedUserId: true, analytics: true },
    });

    const isPrivileged = callerRole === "ADMIN" || callerRole === "LEAD";
    const canAccess =
      isPrivileged ||
      (account != null && account.assignedUserId === callerId);
    if (!canAccess) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền xem số liệu của tài khoản này." },
        { status: 403 }
      );
    }

    // Read directly from AccountAnalytics SSOT
    if (account?.analytics) {
      return NextResponse.json({
        success: true,
        data: account.analytics.rawSnapshot || account.analytics,
      });
    }

    return NextResponse.json({ success: false, message: "No analytics snapshot found yet for @" + username }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

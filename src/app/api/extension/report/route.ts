import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  checkRateLimit,
  getClientIp,
  resolveExtensionBearerAuth,
} from "@/lib/extension-auth";
import { toStandardCountryCode } from "@/lib/country-name";

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
  viewsToday?: number;
  views7d?: number;
  views14d?: number;
  views30d?: number;
  videosToday?: number;
  videos7d?: number;
  videos14d?: number;
  videos30d?: number;
  totalRevenue?: number;
  revenue7d?: number;
  revenue28d?: number;
  revenue60d?: number;
  revenue365d?: number;
  views28d?: number;
  views60d?: number;
  rpm?: number;
  currency?: string;
  country?: string;
  isLoggedIn: boolean;
  personalToken?: string;
  memberEmail?: string;
  gpmProfileId?: string;
  gpmProfileName?: string;
  /** Explicit client origin: extension = identity only; agent = full metrics */
  source?: "extension" | "agent";
  metricsSource?: string;

  // Key Metrics
  profileViews?: number;
  commentsCount?: number;
  sharesCount?: number;

  // Per-video Metrics (views, likes, comments for each video)
  videosList?: VideoItemMetric[];

  // Most views video in 7, 28, 60, 365 days
  topVideos?: {
    past7d?: TopVideoItem[];
    past28d?: TopVideoItem[];
    past60d?: TopVideoItem[];
    past365d?: TopVideoItem[];
  };

  // Revenue Breakdown
  liveRewardsRevenue?: number;
  tiktokShopRevenue?: number;
  creatorRewardsRevenue?: number;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req) || "unknown";
    const ipLimit = checkRateLimit(`report:ip:${ip}`, 180);
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
      viewsToday,
      views7d,
      views14d,
      views30d,
      videosToday,
      videos7d,
      videos14d,
      videos30d,
      totalRevenue,
      revenue7d,
      revenue28d,
      revenue60d,
      revenue365d,
      views28d,
      views60d,
      rpm,
      currency,
      country,
      isLoggedIn,
      personalToken,
      memberEmail,
      gpmProfileId,
      gpmProfileName,
      source,
      metricsSource,
      profileViews,
      commentsCount,
      sharesCount,
      videosList,
      topVideos,
      liveRewardsRevenue,
      tiktokShopRevenue,
      creatorRewardsRevenue,
    } = body;

    // Extension = identity/GPM/assignment only. Agent writes metrics. Legacy payloads with numbers still apply.
    const isIdentityOnly =
      source === "extension" || metricsSource === "identity";
    const applyMetrics =
      !isIdentityOnly &&
      (source === "agent" ||
        metricsSource === "agent" ||
        metricsSource === "studio" ||
        followersCount > 0 ||
        (totalRevenue !== undefined && totalRevenue > 0) ||
        (viewsToday !== undefined && viewsToday > 0) ||
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

    const userLimit = checkRateLimit(`report:user:${memberUser.id}`, 120);
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
    let gpmMatchedVia: string | null = resolvedGpmProfileId ? "client" : null;

    if (!resolvedGpmProfileId) {
      const existingAccount = await prisma.tiktokAccount.findUnique({
        where: { username: cleanUsername },
        select: { gpmProfileId: true, gpmProfileName: true },
      });
      if (existingAccount?.gpmProfileId) {
        resolvedGpmProfileId = existingAccount.gpmProfileId;
        resolvedGpmProfileName = existingAccount.gpmProfileName || resolvedGpmProfileName;
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
    let account = await prisma.tiktokAccount.findFirst({
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

    const targetStatus = isLoggedIn ? "ACTIVE" : "WARMING";
    const previousStatus = account?.status || null;

    if (!account) {
      // Create new account
      const assignedUserId = memberUser?.id || null;
      account = await prisma.tiktokAccount.create({
        data: {
          username: cleanUsername,
          gpmProfileId: resolvedGpmProfileId || null,
          groupName: resolvedGpmProfileName || "Extension Fleet",
          status: targetStatus,
          country: toStandardCountryCode(country),
          assignedUserId,
          isAssignmentLocked: false,
          totalFollowers: applyMetrics ? followersCount : 0,
          totalVideos: applyMetrics ? totalVideos || videoCount : 0,
          totalViews: applyMetrics && totalViews ? BigInt(totalViews) : BigInt(0),
          totalRevenue:
            applyMetrics && totalRevenue !== undefined && totalRevenue > 0
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
            ? `Tài khoản TikTok @${cleanUsername} được phát hiện qua Extension (${actorName}). Trạng thái: ${isLoggedIn ? "Đã đăng nhập" : "Chưa đăng nhập"}.${
                resolvedGpmProfileId
                  ? ` Gắn GPM Profile ${resolvedGpmProfileId} (${gpmMatchedVia}).`
                  : ""
              } Số liệu sẽ do Client Agent cập nhật.`
            : `Tài khoản TikTok @${cleanUsername} được phát hiện trực tiếp qua Extension (${actorName}). Trạng thái: ${isLoggedIn ? "Đã đăng nhập" : "Chưa đăng nhập"}.${
                resolvedGpmProfileId
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

      if (applyMetrics) {
        if (followersCount > 0) updateData.totalFollowers = followersCount;
        if (totalVideos || videoCount > 0) updateData.totalVideos = totalVideos || videoCount;
        if (totalViews !== undefined && totalViews > 0) updateData.totalViews = BigInt(totalViews);
        if (totalRevenue !== undefined && totalRevenue > 0) updateData.totalRevenue = totalRevenue;
      }
      if (country) updateData.country = toStandardCountryCode(country);
      if (resolvedGpmProfileId && !account.gpmProfileId) {
        updateData.gpmProfileId = resolvedGpmProfileId;
        if (resolvedGpmProfileName && (!account.groupName || account.groupName === "Extension Fleet")) {
          updateData.groupName = resolvedGpmProfileName;
        }
      }
      if (isLoggedIn && account.status !== "ACTIVE") updateData.status = "ACTIVE";

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

    // 4. Record into DailyRevenue for each revenue stream (Agent metrics only)
    const effectiveTotalRevenue = totalRevenue || (creatorRewardsRevenue || 0) + (liveRewardsRevenue || 0) + (tiktokShopRevenue || 0);

    if (
      applyMetrics &&
      (effectiveTotalRevenue > 0 || (viewsToday && viewsToday > 0) || rpm)
    ) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Creator Rewards Program
      const crRevenue = creatorRewardsRevenue !== undefined ? creatorRewardsRevenue : totalRevenue;
      if ((crRevenue !== undefined && crRevenue > 0) || (viewsToday && viewsToday > 0) || rpm) {
        try {
          await prisma.dailyRevenue.upsert({
            where: {
              accountId_date_sourceType: {
                accountId: account.id,
                date: today,
                sourceType: "CREATOR_REWARDS",
              },
            },
            create: {
              accountId: account.id,
              date: today,
              views: BigInt(viewsToday || totalViews || 0),
              revenue: crRevenue || 0,
              rpm: rpm || 0,
              sourceType: "CREATOR_REWARDS",
            },
            update: {
              ...(viewsToday !== undefined && viewsToday > 0 ? { views: BigInt(viewsToday) } : {}),
              ...(crRevenue !== undefined && crRevenue > 0 ? { revenue: crRevenue } : {}),
              ...(rpm !== undefined && rpm > 0 ? { rpm } : {}),
            },
          });
        } catch (err: any) {
          console.warn("[ExtensionReport] Failed to upsert DailyRevenue (CREATOR_REWARDS):", err.message);
        }
      }

      // Live Rewards
      if (liveRewardsRevenue !== undefined && liveRewardsRevenue > 0) {
        try {
          await prisma.dailyRevenue.upsert({
            where: {
              accountId_date_sourceType: {
                accountId: account.id,
                date: today,
                sourceType: "LIVE_REWARDS",
              },
            },
            create: {
              accountId: account.id,
              date: today,
              views: BigInt(0),
              revenue: liveRewardsRevenue,
              rpm: 0,
              sourceType: "LIVE_REWARDS",
            },
            update: {
              revenue: liveRewardsRevenue,
            },
          });
        } catch (err: any) {
          console.warn("[ExtensionReport] Failed to upsert DailyRevenue (LIVE_REWARDS):", err.message);
        }
      }

      // TikTok Shop for Seller
      if (tiktokShopRevenue !== undefined && tiktokShopRevenue > 0) {
        try {
          await prisma.dailyRevenue.upsert({
            where: {
              accountId_date_sourceType: {
                accountId: account.id,
                date: today,
                sourceType: "TIKTOK_SHOP",
              },
            },
            create: {
              accountId: account.id,
              date: today,
              views: BigInt(0),
              revenue: tiktokShopRevenue,
              rpm: 0,
              sourceType: "TIKTOK_SHOP",
            },
            update: {
              revenue: tiktokShopRevenue,
            },
          });
        } catch (err: any) {
          console.warn("[ExtensionReport] Failed to upsert DailyRevenue (TIKTOK_SHOP):", err.message);
        }
      }
    }

    // 5. Persist comprehensive analytics snapshot (Agent metrics only — never zero out from Extension)
    let analyticsSnapshot: Record<string, unknown> | null = null;
    if (applyMetrics) {
    analyticsSnapshot = {
      username: cleanUsername,
      updatedAt: new Date().toISOString(),
      keyMetrics: {
        videoViews: totalViews || 0,
        profileViews: profileViews || 0,
        likes: totalLikes || 0,
        comments: commentsCount || 0,
        shares: sharesCount || 0,
        estRewards: effectiveTotalRevenue || 0,
      },
      viewsBreakdown: {
        viewsToday: viewsToday || 0,
        views7d: views7d || 0,
        views14d: views14d || 0,
        views30d: views30d || 0,
        totalViews: totalViews || 0,
      },
      videosBreakdown: {
        videosToday: videosToday || 0,
        videos7d: videos7d || 0,
        videos14d: videos14d || 0,
        videos30d: videos30d || 0,
        totalVideos: totalVideos || videoCount || 0,
      },
      revenueBreakdown: {
        totalRevenue: effectiveTotalRevenue || 0,
        liveRewardsRevenue: liveRewardsRevenue || 0,
        tiktokShopRevenue: tiktokShopRevenue || 0,
        creatorRewardsRevenue: creatorRewardsRevenue || 0,
        currency: currency || "$",
        rpm: rpm || 0,
      },
      videosList: videosList || [],
      topVideos: topVideos || {},
    };

      // 5a. Upsert into AccountAnalytics (Single Source of Truth)
      try {
        await prisma.accountAnalytics.upsert({
          where: { accountId: account.id },
          create: {
            accountId: account.id,
            currency: currency || "$",
            revenue7d: revenue7d || 0,
            revenue28d: revenue28d || 0,
            revenue60d: revenue60d || 0,
            revenue365d: typeof revenue365d === "number" ? revenue365d : null,
            totalRevenue: effectiveTotalRevenue || 0,
            views7d: views7d ? BigInt(views7d) : null,
            views28d: views28d ? BigInt(views28d) : null,
            views60d: views60d ? BigInt(views60d) : null,
            views365d: totalViews ? BigInt(totalViews) : null,
            likes28d: totalLikes || 0,
            comments28d: commentsCount || 0,
            shares28d: sharesCount || 0,
            dailyBreakdown: (body as any).dailyBreakdown || null,
            activePrograms: (body as any).activePrograms || null,
            insightsHistory: (body as any).insightsHistory || null,
            rawSnapshot: analyticsSnapshot as any,
          },
          update: {
            currency: currency || "$",
            revenue7d: revenue7d || 0,
            revenue28d: revenue28d || 0,
            revenue60d: revenue60d || 0,
            revenue365d: typeof revenue365d === "number" ? revenue365d : undefined,
            totalRevenue: effectiveTotalRevenue || 0,
            views7d: views7d ? BigInt(views7d) : undefined,
            views28d: views28d ? BigInt(views28d) : undefined,
            views60d: views60d ? BigInt(views60d) : undefined,
            views365d: totalViews ? BigInt(totalViews) : undefined,
            likes28d: totalLikes || undefined,
            comments28d: commentsCount || undefined,
            shares28d: sharesCount || undefined,
            dailyBreakdown: (body as any).dailyBreakdown || undefined,
            activePrograms: (body as any).activePrograms || undefined,
            insightsHistory: (body as any).insightsHistory || undefined,
            rawSnapshot: analyticsSnapshot as any,
          },
        });
      } catch (anErr: any) {
        console.warn("[ExtensionReport] Failed to upsert AccountAnalytics:", anErr.message);
      }

      // 5b. Dual-write to SystemConfig for legacy compatibility
      try {
        await prisma.systemConfig.upsert({
          where: { key: `analytics_${cleanUsername}` },
          create: {
            key: `analytics_${cleanUsername}`,
            value: JSON.stringify(analyticsSnapshot),
            description: `Detailed analytics snapshot for @${cleanUsername}`,
          },
          update: {
            value: JSON.stringify(analyticsSnapshot),
            updatedAt: new Date(),
          },
        });
      } catch (cfgErr: any) {
        console.warn("[ExtensionReport] Failed to save analytics snapshot:", cfgErr.message);
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
    const session = await auth();
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

    // 1. Prioritize reading from AccountAnalytics SSOT
    if (account?.analytics?.rawSnapshot) {
      return NextResponse.json({
        success: true,
        data: account.analytics.rawSnapshot,
      });
    }

    // 2. Fallback to SystemConfig legacy cache
    const config = await prisma.systemConfig.findUnique({
      where: { key: `analytics_${username}` },
    });

    if (!config) {
      return NextResponse.json({ success: false, message: "No analytics snapshot found yet for @" + username }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: JSON.parse(config.value),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

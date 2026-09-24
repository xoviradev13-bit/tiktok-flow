import { NextResponse } from "next/server";
import { prisma, prismaRaw } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  checkRateLimit,
  getClientIp,
  resolveExtensionBearerAuth,
} from "@/lib/extension-auth";
import { toStandardCountryCode } from "@/lib/country-name";
import { splitGpmNameFields } from "@/lib/gpm-profile-fields";
import { extensionOptionsResponse } from "@/lib/extension-cors";
import { acquireReportSlot, reportGateStats } from "@/lib/report-gate";
import { syncFlowLog } from "@/lib/sync-flow-debug";

const PERIOD_KEY_RE = /(7d|28d|60d|365d)$/;
const INSIGHT_SUM_KEYS = [
  "sumViews",
  "sumLikes",
  "sumComments",
  "sumShares",
  "sumProfileViews",
] as const;

function periodValues(obj: unknown): number[] | null {
  if (!obj || typeof obj !== "object") return null;
  const vals = Object.entries(obj as Record<string, unknown>)
    .filter(([k]) => PERIOD_KEY_RE.test(k))
    .map(([, v]) => v);
  if (!vals.length || !vals.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return null;
  }
  return vals as number[];
}

/** null if ANY of the five sums is missing/null/non-finite (partial-null => "empty"). */
function collectInsightPeriods(
  row: Record<string, any> | null | undefined
): number[] | null {
  if (!row) return null;
  const all: number[] = [];
  for (const k of INSIGHT_SUM_KEYS) {
    const v = periodValues(row[k]);
    if (!v) return null;
    all.push(...v);
  }
  return all;
}

/** Depends ONLY on stored data + markers, never on latest attempt status. */
function isPresentInsights(
  row: Record<string, any> | null | undefined,
  snap: Record<string, any>
): boolean {
  const vals = collectInsightPeriods(row);
  if (!vals) return false;
  return snap?.insightsConfirmed === true || vals.some((v) => v !== 0);
}

function isPresentRewards(list: unknown, snap: Record<string, any>): boolean {
  if (!Array.isArray(list) || list.length === 0) return false;
  return (
    snap?.rewardsConfirmed === true ||
    list.some((v: any) => Number(v?.reward ?? v?.rewards ?? 0) !== 0)
  );
}

function mergePostRewards(existing: unknown, incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of Array.isArray(existing) ? existing : []) {
    map.set(String(item.id || item.videoId || item.title), item);
  }
  for (const item of incoming) {
    map.set(String(item.id || item.videoId || item.title), item);
  }
  const parseTimeMs = (v: any) => {
    if (v.publishTimeUnix) return Number(v.publishTimeUnix) * 1000;
    const t = new Date(v.publishDate || v.postDate || v.postTime || "").getTime();
    return !isNaN(t) ? t : 0;
  };
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  return Array.from(map.values())
    .filter((v) => {
      const ts = parseTimeMs(v);
      return ts <= 0 || nowMs - ts <= SIXTY_DAYS_MS;
    })
    .sort((a, b) => parseTimeMs(b) - parseTimeMs(a));
}

/** Handle CORS preflight from chrome-extension:// origins */
export function OPTIONS(req: Request) {
  return extensionOptionsResponse(req);
}

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
  videoId?: string | null;
  title: string | null;
  coverUrl?: string | null;
  postedOn?: string | null;
  viewsInRange: number;
  newViewersInRange?: number;
  likesInRange?: number;
  allViews?: number;
  allLikes?: number;
}

export interface TopVideos365d {
  /** Top videos by views in 365d */
  mostViews: TopVideoItem[];
  /** Top videos by unique new viewers in 365d */
  mostNewViewers: TopVideoItem[];
  /** Top videos by likes in 365d */
  mostLikes: TopVideoItem[];
  fetchedAt?: string;
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

  // 365d top videos with 3 ranking categories from TikTok Studio analytics/content
  topVideos365d?: TopVideos365d | null;

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
  /** Studio Insights vv_history 365d dated points — only when Insights claim is ok. */
  dailyViewsBreakdown?: Array<{ date: string; views: number }> | null;
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
  // FIX: the agent flags truncated postRewards (429 or page-cap hit).
  // When true, the server must NOT overwrite stored postRewards / totalRevenue
  // with this partial payload — a later complete sweep will merge.
  postRewardsPartial?: boolean;
  creatorRewardsMissing?: boolean;
  bannedReason?: string;
  metadata?: Record<string, any> | null;
  /**
   * Set to true by the agent when the TikTok Studio insights API returned no data
   * (vv_history undefined) — meaning the session was expired/unauthorized.
   * When true, route.ts skips updating sumViews/sumComments/sumShares/sumProfileViews
   * to avoid overwriting valid historical data with meaningless zeros.
   * An account that genuinely has 0 views will still have vv_history defined (empty array),
   * so insightsUnavailable will be false and zeros will be written correctly.
   */
  insightsUnavailable?: boolean;
  /** Agent protocol version — >=1 enables no_data / rewardsNoProgram / old-agent guards. */
  flagsVersion?: number;
  insightsNoData?: boolean;
  insightsFailReason?:
    | "session"
    | "captcha"
    | "timeout"
    | "empty_response"
    | "unknown";
  rewardsFailReason?:
    | "session"
    | "captcha"
    | "timeout"
    | "rate_limited"
    | "incomplete_list"
    | "unknown";
  rewardsNoProgram?: boolean;
  hasCheckpoint?: boolean;
  isCheckpoint?: boolean;
  checkpoint?: boolean;
}

// FIX: reject oversized bodies before they hit req.json().
const MAX_REPORT_BODY_BYTES = 4 * 1024 * 1024; // 4 MB

export async function POST(req: Request) {
  let release: (() => void) | null = null;
  let reportT0 = Date.now();
  let reportReqId: string | null = null;
  let reportUsername: string | null = null;
  try {
    // FIX: guard against oversized payloads (JSON parse of a 100 MB body pins memory).
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REPORT_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: "Payload quá lớn." },
        { status: 413 }
      );
    }

    const ip = getClientIp(req) || "unknown";
    // FIX: do not raise the pre-auth IP limit just because a Bearer header exists —
    // a forged header must not unlock the higher bucket. The elevated rate is applied
    // after resolveExtensionBearerAuth succeeds (below).
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
      topVideos365d,
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
    const dailyViewsBreakdown = Array.isArray(body.dailyViewsBreakdown)
      ? body.dailyViewsBreakdown
      : undefined;

    // insightsClaim: ok | no_data | unavailable — never fabricate Insight sums.
    // Old agents (no flagsVersion) that post all-zero + videos > 0 are treated as unavailable.
    const isNewAgent = Number(body.flagsVersion) >= 1;
    const payloadPeriods = collectInsightPeriods({
      sumViews,
      sumLikes,
      sumComments,
      sumShares,
      sumProfileViews,
    } as any);
    const payloadVideoSignal = Math.max(
      Number(totalVideos ?? 0),
      Number(videoCount ?? 0),
      Array.isArray(videosList) ? videosList.length : 0
    );

    type InsightsClaim = "ok" | "no_data" | "unavailable";
    let insightsClaim: InsightsClaim;
    if (body.insightsUnavailable === true) insightsClaim = "unavailable";
    else if (isNewAgent && body.insightsNoData === true) insightsClaim = "no_data";
    else if (!payloadPeriods) insightsClaim = "unavailable";
    else if (
      !isNewAgent &&
      payloadPeriods.every((v) => v === 0) &&
      payloadVideoSignal > 0
    )
      insightsClaim = "unavailable";
    else insightsClaim = "ok";

    const insightsWritable = insightsClaim === "ok";
    const insightsUnavailable = insightsClaim === "unavailable";

    // FIX: postRewardsPartial=true means the agent's per-post sweep was truncated
    // (HTTP 429 or page-cap). The payload's postRewards / totalRevenue are incomplete
    // and must NOT overwrite stored values. A future complete sweep will merge.
    const postRewardsPartial = body.postRewardsPartial === true;

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
    const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    reportT0 = Date.now();
    reportReqId = reqId;
    reportUsername = cleanUsername;

    syncFlowLog("report_begin", {
      reqId,
      username: cleanUsername,
      source: body.source || null,
      metricsSource: body.metricsSource || null,
      isAgentSource,
      isIdentityOnly,
      applyMetrics,
      gpmProfileId: typeof gpmProfileId === "string" ? gpmProfileId.slice(0, 8) : null,
      postRewardsLen: Array.isArray(body.postRewards) ? body.postRewards.length : null,
      videosListLen: Array.isArray(videosList) ? videosList.length : null,
      hasDailyViews: Array.isArray(dailyViewsBreakdown),
      hasInsightsHistory: !!(insightsHistory && typeof insightsHistory === "object"),
      bodyBytes: contentLength || null,
      gate: reportGateStats(),
    });

    // FIX: elevated per-user rate applies only AFTER auth succeeded.
    const userLimitMax = isAgentSource ? 1200 : 120;
    const userLimit = checkRateLimit(`report:user:${memberUser.id}`, userLimitMax);
    if (!userLimit.ok) {
      syncFlowLog("report_end", {
        reqId,
        username: cleanUsername,
        outcome: "rate_limited",
        elapsedMs: Date.now() - reportT0,
      });
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSec) } }
      );
    }

    // Per-account limit for identity-only reports (agent traffic unaffected).
    // Keyed by user+username so a 100-profile startup is not starved by a global user cap.
    if (isIdentityOnly) {
      const acctLimit = checkRateLimit(
        `report:acct:${memberUser.id}:${cleanUsername}`,
        10
      );
      if (!acctLimit.ok) {
        syncFlowLog("report_end", {
          reqId,
          username: cleanUsername,
          outcome: "acct_rate_limited",
          elapsedMs: Date.now() - reportT0,
        });
        return NextResponse.json(
          { success: false, error: "Quá nhiều yêu cầu cho tài khoản này." },
          {
            status: 429,
            headers: { "Retry-After": String(acctLimit.retryAfterSec) },
          }
        );
      }
    }

    // Agent metrics reports can hold the DB longer (large insightsHistory) — wait more.
    const gateWaitMs = isAgentSource && applyMetrics ? 60_000 : 8_000;
    const gateBefore = reportGateStats();
    const gateWaitT0 = Date.now();
    release = await acquireReportSlot(gateWaitMs);
    if (!release) {
      syncFlowLog("report_gate", {
        reqId,
        username: cleanUsername,
        outcome: "timeout",
        waitMs: Date.now() - gateWaitT0,
        maxWaitMs: gateWaitMs,
        before: gateBefore,
        after: reportGateStats(),
      });
      syncFlowLog("report_end", {
        reqId,
        username: cleanUsername,
        outcome: "gate_busy",
        elapsedMs: Date.now() - reportT0,
      });
      return NextResponse.json(
        { success: false, error: "Máy chủ đang bận." },
        { status: 503, headers: { "Retry-After": "10" } }
      );
    }
    syncFlowLog("report_gate", {
      reqId,
      username: cleanUsername,
      outcome: "acquired",
      waitMs: Date.now() - gateWaitT0,
      before: gateBefore,
      after: reportGateStats(),
    });

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
      const existingAccount = await prismaRaw.tiktokAccount.findUnique({
        where: { username: cleanUsername },
        select: { gpmProfileId: true, gpmProfileName: true, groupName: true, deletedAt: true },
      });
      if (existingAccount?.deletedAt) {
        return NextResponse.json({ success: true, skipped: "ACCOUNT_DELETED" });
      }
      if (existingAccount?.gpmProfileId) {
        resolvedGpmProfileId = existingAccount.gpmProfileId;
        resolvedGpmProfileName = existingAccount.gpmProfileName || resolvedGpmProfileName;
        resolvedGpmGroupName = existingAccount.groupName || resolvedGpmGroupName;
        gpmMatchedVia = "db:matched";
      }
    }

    // If a GPM id is claimed, refuse to steal it from a different TikTok username
    if (resolvedGpmProfileId) {
      const conflict = await prismaRaw.tiktokAccount.findFirst({
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

    // 2. Find existing account by username or gpmProfileId (using prismaRaw to see soft-deleted)
    let account: any = await prismaRaw.tiktokAccount.findFirst({
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

    if (account?.deletedAt) {
      syncFlowLog("report_end", {
        reqId,
        username: cleanUsername,
        outcome: "skipped_account_deleted",
        elapsedMs: Date.now() - reportT0,
      });
      return NextResponse.json({ success: true, skipped: "ACCOUNT_DELETED" });
    }
    const priorTotalVideos = Number(account?.totalVideos ?? 0);

    // Ensure profileName and groupName are properly separated and not cross-stored
    const nameFields = splitGpmNameFields({
      profileName: resolvedGpmProfileName,
      groupName: resolvedGpmGroupName,
      existingProfileName: account?.gpmProfileName,
      existingGroupName: account?.groupName,
    });

    const targetStatus = isLoggedIn ? "ACTIVE" : "WARMING";
    const previousStatus = account?.status || null;

    let created = false;
    if (!account) {
      // Create new account — concurrent identity reports can both miss findFirst;
      // recover on unique violation (P2002) and fall through to the update path.
      const assignedUserId = memberUser?.id || null;
      try {
        const effectiveFollowersOnCreate = applyMetrics && typeof followersCount === "number" ? followersCount : 0;
        const hasCreatorPostRewardsOnCreate =
          Array.isArray(body.postRewards) &&
          body.postRewards.some(
            (p: any) =>
              p.programId === 9 ||
              p.programId === 4 ||
              /creator\s*reward|quỹ\s*nhà\s*sáng\s*tạo|beta/i.test(p.programName || "")
          );
        const shouldBanOnCreate =
          body.creatorRewardsMissing === true &&
          (effectiveFollowersOnCreate >= 10000 || hasCreatorPostRewardsOnCreate);

        account = await prisma.tiktokAccount.create({
          data: {
            username: cleanUsername,
            gpmProfileId: resolvedGpmProfileId || null,
            gpmProfileName: nameFields.gpmProfileName || null,
            groupName: nameFields.groupName || null,
            status: shouldBanOnCreate ? "BANNED" : targetStatus,
            bannedReason: shouldBanOnCreate ? (body.bannedReason || "Bị ngừng chương trình TikTok Beta (Creator Rewards Program)") : null,
            metadata: body.metadata || (shouldBanOnCreate ? { creatorRewardsStatus: "BANNED" } : undefined),
            isOnline: isLoggedIn === true,
            syncStatus: isLoggedIn === true ? "SYNC_OK" : "SYNC_ISSUES",
            country: toStandardCountryCode(country) || undefined,
            assignedUserId,
            isAssignmentLocked: false,
            totalFollowers: applyMetrics && typeof followersCount === "number" ? followersCount : 0,
            totalVideos: applyMetrics ? (totalVideos ?? videoCount ?? 0) : 0,
            totalViews:
              applyMetrics &&
              insightsWritable &&
              totalViews !== undefined &&
              totalViews !== null
                ? BigInt(totalViews)
                : BigInt(0),
            totalRevenue:
              // FIX: never seed a fresh row with a partial revenue figure.
              applyMetrics && !postRewardsPartial && totalRevenue !== undefined && totalRevenue !== null
                ? totalRevenue
                : 0,
            lastSyncedAt: new Date(),
          },
          include: {
            assignedUser: { select: { id: true, name: true, email: true, username: true } },
          },
        });
        created = true;

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
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
        account = await prisma.tiktokAccount.findFirst({
          where: { username: cleanUsername },
          include: {
            assignedUser: {
              select: { id: true, name: true, email: true, username: true },
            },
          },
        });
        if (!account) throw e;
      }
    }
    if (!created) {
      const updateData: any = {
        lastSyncedAt: new Date(),
        syncStatus: isLoggedIn === false ? "SYNC_ISSUES" : "SYNC_OK",
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
        // Only write totalViews when Insights are authoritative (claim === ok).
        if (insightsWritable && totalViews !== undefined && totalViews !== null) {
          updateData.totalViews = BigInt(totalViews);
        }
        // FIX: totalRevenue derives from a partial postRewards sweep; skip the write.
        if (!postRewardsPartial && totalRevenue !== undefined && totalRevenue !== null) {
          updateData.totalRevenue = totalRevenue;
        }
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
      const effectiveFollowers =
        typeof followersCount === "number"
          ? followersCount
          : Number(account.totalFollowers ?? 0);
      const existingMeta = (account.metadata as Record<string, any>) || {};
      const hadPriorCreatorRewards =
        existingMeta.creatorRewardsStatus === "ACTIVE" ||
        (Array.isArray(body.postRewards) &&
          body.postRewards.some(
            (p: any) =>
              p.programId === 9 ||
              p.programId === 4 ||
              /creator\s*reward|quỹ\s*nhà\s*sáng\s*tạo|beta/i.test(p.programName || "")
          ));
      const hasCreatorEligibility =
        effectiveFollowers >= 10000 || hadPriorCreatorRewards;

      if (body.creatorRewardsMissing === true && hasCreatorEligibility) {
        if (account.status !== "WARMING") {
          isBannedFromCreatorRewards = true;
          updateData.status = "BANNED";
          const reason = body.bannedReason || "Bị ngừng chương trình TikTok Beta (Creator Rewards Program)";
          updateData.bannedReason = reason;
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
      } else if (
        (body.creatorRewardsMissing === false || (body.creatorRewardsMissing === true && !hasCreatorEligibility)) &&
        account.status === "BANNED"
      ) {
        // AUTO-RECOVERY: TikTok Creator Rewards Program has been restored OR false ban resolved (< 10k followers without Beta)
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
              message: `[KHÔI PHÚC QUYỀN KIẾM TIỀN] Đã phát hiện lại chương trình Creator Rewards Program trên TikTok Studio hoặc khôi phục do không đủ điều kiện Quỹ Beta. Trạng thái khôi phục: ACTIVE.`,
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

      if (
        !isBannedFromCreatorRewards &&
        account.status !== "BANNED" &&
        account.status !== "STOPPED" &&
        account.status !== "CUSTOM" &&
        isLoggedIn &&
        account.status !== "ACTIVE" &&
        updateData.status !== "ACTIVE"
      ) {
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
      syncFlowLog("report_account_updated", {
        reqId,
        username: cleanUsername,
        accountId: account.id,
        applyMetrics,
        totalVideos: account.totalVideos,
        lastSyncedAt: account.lastSyncedAt,
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

    // 4. Daily Checklist Video Ingestion
    // Phase A: Write today's videos as source = "live" (real-time monitoring signal).
    // Phase B: Backfill past days (up to 7 days) from TikTok's video history.
    //          Uses videoSource provenance: live > manual > backfill.
    if (Array.isArray(videosList) && videosList.length > 0) {
      try {
        const {
          toVnDateStr,
          vnDateStrToChecklistDate,
          parseVideoVnDate,
          backfillChecklistVideos,
        } = await import("@/lib/checklist-video-backfill");

        const now = new Date();
        const todayVnStr = toVnDateStr(now);
        const todayChecklistDate = vnDateStrToChecklistDate(todayVnStr);

        // --- Phase A: Live write (today only) ---
        const todayVideos = videosList.filter(
          (v: any) => parseVideoVnDate(v) === todayVnStr
        );

        const checkItem = await prisma.dailyChecklistItem.findFirst({
          where: {
            accountId: account.id,
            checklist: {
              date: todayChecklistDate,
              isLocked: false, // never write to locked checklists
            },
          },
          select: { id: true, videoSource: true, videosSnapshot: true },
        });

        if (checkItem) {
          const liveUpdate: Record<string, any> = {
            isSynced: true, // live path always marks isSynced (account was seen today)
          };

          if (todayVideos.length > 0) {
            // Change-gate: only bump videoSyncedAt / rewrite snapshot if something
            // actually changed, to avoid churning updatedAt on every identical re-sync.
            const prevCount = Array.isArray(checkItem.videosSnapshot)
              ? (checkItem.videosSnapshot as any[]).length
              : 0;
            const changed =
              checkItem.videoSource !== "live" || prevCount !== todayVideos.length;

            if (changed) {
              liveUpdate.isPosted = true;
              liveUpdate.videosSnapshot = todayVideos;
              liveUpdate.videoSource = "live";
              liveUpdate.videoSyncedAt = now;
            }
          }

          await prisma.dailyChecklistItem.update({
            where: { id: checkItem.id },
            data: liveUpdate,
          });
        }

        // --- Phase B: Backfill past days ---
        const backfillResult = await backfillChecklistVideos(
          prisma,
          account.id,
          videosList,
          todayVnStr
          // windowDays defaults to BACKFILL_WINDOW_DAYS = 7 (matches cutoff lock window)
        );

        if (backfillResult.written.length > 0) {
          console.log(
            `[ExtensionReport] Backfilled @${cleanUsername} for dates: ${backfillResult.written.join(", ")}`
          );
        }
        if (Object.keys(backfillResult.skipped).length > 0) {
          console.log(
            `[ExtensionReport] Backfill skipped @${cleanUsername}:`,
            backfillResult.skipped
          );
        }
      } catch (checkItemErr) {
        console.warn("[ExtensionReport] Failed to ingest daily checklist videos:", checkItemErr);
      }
    }

    // 5. Persist comprehensive analytics snapshot (Agent metrics only — never zero out from Extension)
    let analyticsSnapshot: Record<string, unknown> | null = null;
    let resolvedPostRewards: any[] | undefined = Array.isArray(body.postRewards)
      ? body.postRewards
      : undefined;
    type InsightsStatus = "written" | "skipped_stale" | "skipped_empty" | "no_data";
    type RewardsStatus =
      | "written"
      | "skipped_stale"
      | "skipped_empty"
      | "partial"
      | "no_program";
    let insightsStatus: InsightsStatus | null = null;
    let rewardsStatus: RewardsStatus | null = null;

    if (applyMetrics) {
      // Clean rawSnapshot: keep newest 20 videos for lightweight preview
      analyticsSnapshot = {
        username: cleanUsername,
        updatedAt: new Date().toISOString(),
        videosList: Array.isArray(videosList) ? videosList.slice(0, 20) : [],
        topVideos365d: topVideos365d || null,
        postRewardsPartial: postRewardsPartial || undefined,
        insightsUnavailable: insightsUnavailable || undefined,
      };

      // Revenue is always-safe when the payload actually includes it — never invent zeros.
      const resolvedSumRevenue =
        sumRevenue &&
        typeof sumRevenue === "object" &&
        periodValues(sumRevenue) != null
          ? sumRevenue
          : undefined;

      const resolvedRevenueBreakdown =
        revenueBreakdown != null ? revenueBreakdown : undefined;
      const resolvedDailyRevenueBreakdown =
        dailyRevenueBreakdown != null ? dailyRevenueBreakdown : undefined;

      // 5a. Upsert AccountAnalytics with family gates (Insights / Rewards)
      const analyticsT0 = Date.now();
      try {
        syncFlowLog("report_analytics_begin", {
          reqId,
          username: cleanUsername,
          accountId: account.id,
          insightsClaim,
          postRewardsPartial,
          postRewardsLen: Array.isArray(body.postRewards) ? body.postRewards.length : null,
          hasDailyViews: Array.isArray(dailyViewsBreakdown),
          hasInsightsHistory: !!(insightsHistory && typeof insightsHistory === "object"),
        });
        await prisma.$transaction(
          async (tx) => {
            // 1) ensure row exists (null sums), single-key upsert => INSERT ... ON CONFLICT
            await tx.accountAnalytics.upsert({
              where: { accountId: account.id },
              create: { accountId: account.id, currency: currency || "$" },
              update: {},
            });
            // 2) lock that one row (@@map => account_analytics)
            await tx.$queryRaw`
              SELECT "id" FROM "account_analytics"
              WHERE "accountId" = ${account.id}
              FOR UPDATE
            `;

            const existing = await tx.accountAnalytics.findUnique({
              where: { accountId: account.id },
              select: {
                sumViews: true,
                sumLikes: true,
                sumComments: true,
                sumShares: true,
                sumProfileViews: true,
                postRewards: true,
                rawSnapshot: true,
              },
            });
            const snap = ((existing?.rawSnapshot as any) ?? {}) as Record<
              string,
              any
            >;
            const nowIso = new Date().toISOString();
            const markers: Record<string, unknown> = {
              insightsLastAttemptAt: nowIso,
              rewardsLastAttemptAt: nowIso,
            };
            const insightData: Record<string, unknown> = {};

            // ---------- Insights gate ----------
            const presentI = isPresentInsights(existing as any, snap);
            let claim: InsightsClaim = insightsClaim;
            // Don't trust no_data if DB knew of videos and has no confirmed sums
            if (claim === "no_data" && !presentI && priorTotalVideos > 0) {
              claim = "unavailable";
            }

            if (claim === "ok") {
              insightData.sumViews = sumViews as any;
              insightData.sumLikes = sumLikes as any;
              insightData.sumComments = sumComments as any;
              insightData.sumShares = sumShares as any;
              insightData.sumProfileViews = sumProfileViews as any;
              if (Array.isArray(dailyViewsBreakdown)) {
                insightData.dailyViewsBreakdown = dailyViewsBreakdown as any;
              }
              insightsStatus = "written";
              Object.assign(markers, {
                insightsStatus,
                insightsNeedsRepair: false,
                insightsConfirmed: true,
                insightsLastConfirmedAt: nowIso,
                insightsNumbersRefreshedAt: nowIso,
                insightsFailReason: null,
              });
            } else if (claim === "no_data") {
              // markers only; NEVER touch existing non-null sums
              insightsStatus = "no_data";
              Object.assign(markers, {
                insightsStatus,
                insightsNeedsRepair: false,
                insightsConfirmed: true,
                insightsLastConfirmedAt: nowIso,
                insightsFailReason: null,
              });
            } else {
              insightsStatus = presentI ? "skipped_stale" : "skipped_empty";
              Object.assign(markers, {
                insightsStatus,
                insightsNeedsRepair: insightsStatus === "skipped_empty",
                insightsFailReason: body.insightsFailReason ?? "unknown",
              });
            }

            // ---------- Rewards gate ----------
            const presentR = isPresentRewards(existing?.postRewards, snap);
            let postRewardsWrite: any = undefined;
            if (isNewAgent && body.rewardsNoProgram === true && !postRewardsPartial) {
              rewardsStatus = "no_program";
              Object.assign(markers, {
                rewardsStatus,
                rewardsConfirmed: true,
                rewardsLastConfirmedAt: nowIso,
                rewardsFailReason: null,
              });
            } else if (postRewardsPartial) {
              rewardsStatus = presentR ? "partial" : "skipped_empty";
              Object.assign(markers, {
                rewardsStatus,
                rewardsFailReason: body.rewardsFailReason ?? "incomplete_list",
              });
            } else if (Array.isArray(body.postRewards)) {
              // Complete list (incl. genuine empty) — merge + confirm.
              postRewardsWrite = mergePostRewards(
                existing?.postRewards,
                body.postRewards
              );
              rewardsStatus = "written";
              Object.assign(markers, {
                rewardsStatus,
                rewardsConfirmed: true,
                rewardsLastConfirmedAt: nowIso,
                rewardsFailReason: null,
              });
            } else {
              // Missing postRewards entirely — never invent or false-confirm.
              rewardsStatus = presentR ? "skipped_stale" : "skipped_empty";
              Object.assign(markers, {
                rewardsStatus,
                rewardsFailReason: body.rewardsFailReason ?? "unknown",
              });
            }

            const nextSnapshot = {
              ...snap,
              ...(analyticsSnapshot ?? {}),
              ...markers,
              // Always keep a copy in rawSnapshot so UI/repair can recover even if
              // the dedicated column write is rejected by a stale PrismaClient.
              ...(Array.isArray(dailyViewsBreakdown)
                ? { dailyViewsBreakdown }
                : {}),
            };
            resolvedPostRewards = postRewardsWrite ?? resolvedPostRewards;

            const scrub = (data: Record<string, unknown>) => {
              const out: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(data)) {
                if (v !== undefined) out[k] = v;
              }
              return out;
            };

            const buildAnalyticsData = (omitDailyViews = false) => {
              const insights = { ...(insightData as Record<string, unknown>) };
              if (omitDailyViews) delete insights.dailyViewsBreakdown;
              return scrub({
                currency: currency || "$",
                ...(resolvedSumRevenue !== undefined
                  ? { sumRevenue: resolvedSumRevenue as any }
                  : {}),
                ...insights,
                ...(resolvedRevenueBreakdown !== undefined
                  ? { revenueBreakdown: resolvedRevenueBreakdown as any }
                  : {}),
                ...(resolvedDailyRevenueBreakdown !== undefined
                  ? {
                      dailyRevenueBreakdown:
                        resolvedDailyRevenueBreakdown as any,
                    }
                  : {}),
                insightsHistory: insightsHistory || undefined,
                postRewards: postRewardsWrite,
                rawSnapshot: nextSnapshot as any,
              });
            };

            try {
              await tx.accountAnalytics.update({
                where: { accountId: account.id },
                data: buildAnalyticsData(false) as any,
              });
            } catch (updErr: any) {
              const msg = String(updErr?.message || updErr);
              if (!msg.includes("Unknown argument `dailyViewsBreakdown`")) {
                throw updErr;
              }
              // Stale PrismaClient (pre-generate) — retry without the column;
              // value remains in rawSnapshot for recovery.
              await tx.accountAnalytics.update({
                where: { accountId: account.id },
                data: buildAnalyticsData(true) as any,
              });
            }
          },
          // Large insightsHistory / postRewards payloads + pool pressure from
          // /api/gpm/sync can exceed the old 3s maxWait / 8s timeout and leave
          // TiktokAccount updated with no AccountAnalytics row.
          { timeout: 30_000, maxWait: 15_000 }
        );
        syncFlowLog("report_analytics_ok", {
          reqId,
          username: cleanUsername,
          accountId: account.id,
          elapsedMs: Date.now() - analyticsT0,
          insightsStatus,
          rewardsStatus,
        });
      } catch (anErr: any) {
        console.error(
          "[ExtensionReport] AccountAnalytics txn failed:",
          cleanUsername,
          anErr?.code || "",
          anErr.message
        );
        syncFlowLog("report_analytics_fail", {
          reqId,
          username: cleanUsername,
          accountId: account.id,
          code: anErr?.code || null,
          message: anErr?.message || String(anErr),
          elapsedMs: Date.now() - analyticsT0,
        });
        throw anErr;
      }
    }

    // Handle alerts based on login state
    const isSessionExpired = body.insightsFailReason === "session" || body.rewardsFailReason === "session";
    const effectiveIsLoggedIn = isSessionExpired ? false : isLoggedIn;

    if (effectiveIsLoggedIn) {
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
    } else if (effectiveIsLoggedIn === false) {
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
            description: `Tài khoản @${cleanUsername} phát hiện chưa đăng nhập hoặc hết phiên trên profile trình duyệt.`,
            status: "OPEN",
          },
        });
      }
    }

    // Handle alerts for Checkpoint / Captcha
    const isCheckpointDetected =
      body.hasCheckpoint === true ||
      body.isCheckpoint === true ||
      body.checkpoint === true ||
      body.insightsFailReason === "captcha" ||
      body.rewardsFailReason === "captcha";

    if (isCheckpointDetected) {
      const existingCheckpoint = await prisma.accountAlert.findFirst({
        where: {
          accountId: account.id,
          alertType: "CHECKPOINT",
          status: "OPEN",
        },
      });
      if (!existingCheckpoint) {
        await prisma.accountAlert.create({
          data: {
            accountId: account.id,
            alertType: "CHECKPOINT",
            severity: "CRITICAL",
            description: `Tài khoản @${cleanUsername} gặp màn hình xác minh bảo mật (Checkpoint / Captcha). Cần mở profile GPM để xác minh.`,
            status: "OPEN",
          },
        });
      }
    } else if (effectiveIsLoggedIn === true && (insightsStatus === "written" || body.hasCheckpoint === false)) {
      await prisma.accountAlert.updateMany({
        where: {
          accountId: account.id,
          alertType: "CHECKPOINT",
          status: "OPEN",
        },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });
    }

    // Handle alerts for punished / disqualified videos (within nearest 30 days)
    // FIX: only run when the postRewards payload is authoritative. A partial sweep
    // (429 or page cap) may miss punished videos and falsely resolve a strike alert.
    const listToExamine = postRewardsPartial
      ? undefined
      : (Array.isArray(resolvedPostRewards) ? resolvedPostRewards : body.postRewards);
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

    // Recalculate & update syncStatus based on alerts and account state
    const openAlertsCount = await prisma.accountAlert.count({
      where: {
        accountId: account.id,
        status: "OPEN",
        OR: [
          { severity: "CRITICAL" },
          { alertType: { in: ["CHECKPOINT", "NOT_LOGGED_IN", "PROGRAM_DISQUALIFIED"] } },
        ],
      },
    });

    const calculatedSyncStatus =
      openAlertsCount > 0 || effectiveIsLoggedIn === false || isCheckpointDetected || account.status === "BANNED"
        ? "SYNC_ISSUES"
        : "SYNC_OK";

    await prisma.tiktokAccount.update({
      where: { id: account.id },
      data: { syncStatus: calculatedSyncStatus },
    });

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

    syncFlowLog("report_end", {
      reqId,
      username: cleanUsername,
      accountId: account.id,
      outcome: "ok",
      applyMetrics,
      insightsStatus,
      rewardsStatus,
      elapsedMs: Date.now() - reportT0,
      hasAnalyticsSnapshot: !!analyticsSnapshot,
    });

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        username: account.username,
        status: account.status,
        syncStatus: calculatedSyncStatus,
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
      // FIX: echo family flags so the agent can classify incomplete vs ok.
      flags: {
        flagsVersion: 1,
        insightsStatus,
        rewardsStatus,
        insightsSkipped:
          insightsStatus === "skipped_stale" ||
          insightsStatus === "skipped_empty" ||
          undefined,
        insightsNeedsRepair:
          insightsStatus === "skipped_empty" || undefined,
        rewardsIncomplete:
          rewardsStatus === "skipped_empty" || undefined,
        insightsFailReason:
          insightsStatus === "skipped_stale" ||
          insightsStatus === "skipped_empty"
            ? (body.insightsFailReason ?? "unknown")
            : undefined,
        rewardsFailReason:
          rewardsStatus === "partial" ||
          rewardsStatus === "skipped_empty" ||
          rewardsStatus === "skipped_stale"
            ? (body.rewardsFailReason ??
              (rewardsStatus === "partial" ? "incomplete_list" : "unknown"))
            : undefined,
        postRewardsPartial,
        insightsUnavailable,
      },
    });
  } catch (error: any) {
    console.error("[ExtensionReport] Error handling extension report:", error);
    try {
      syncFlowLog("report_end", {
        reqId: reportReqId,
        username: reportUsername,
        outcome: "error",
        message: error?.message || String(error),
        code: error?.code || null,
        elapsedMs: Date.now() - reportT0,
      });
    } catch { /* ignore */ }
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  } finally {
    release?.();
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
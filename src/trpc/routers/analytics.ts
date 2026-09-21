import { router, protectedProcedure } from "@/trpc/init";
import { z } from "zod";
import { insightViewsContribution } from "@/lib/insights-ui";
import { resolveAllTimeRevenue } from "@/lib/resolve-all-time-revenue";

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function formatDateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

function calcGrowth(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10; // e.g. +14.2%
}

export const analyticsRouter = router({
  // 1. Dynamic Filter Options (Groups, Operators, Countries)
  getFilterOptions: protectedProcedure.query(async ({ ctx }) => {
    const role = ctx.session.user.role;
    const isAdminOrLead = role === "ADMIN" || role === "LEAD";

    // 1. Groups
    const groups = await ctx.prisma.group.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    });

    // 2. Operators (Staff & Leads) - only for Admin/Lead
    let operators: Array<{
      id: string;
      name: string;
      fullName: string;
      username: string | null;
      avatar: string | null;
      role: string;
      groupName: string | null;
    }> = [];

    if (isAdminOrLead) {
      const users = await ctx.prisma.user.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          username: true,
          avatar: true,
          role: true,
          group: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      });

      operators = users.map((u) => ({
        id: u.id,
        name: u.name || u.username || "Operator",
        fullName:
          [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          u.name ||
          u.username ||
          "Operator",
        username: u.username,
        avatar: u.avatar,
        role: u.role,
        groupName: u.group?.name || null,
      }));
    }

    // 3. Countries existing in fleet
    const rawCountries = await ctx.prisma.tiktokAccount.findMany({
      select: { country: true },
      distinct: ["country"],
      orderBy: { country: "asc" },
    });

    const countries = rawCountries
      .map((c) => c.country)
      .filter(Boolean);

    return {
      groups,
      operators,
      countries,
      userRole: role,
      userId: ctx.session.user.id,
    };
  }),

  // 2. Comprehensive Dashboard Analytics Data
  getDashboardData: protectedProcedure
    .input(
      z.object({
        period: z
          .enum(["7D", "14D", "28D", "30D", "60D", "90D", "365D", "ALL", "CUSTOM"])
          .default("30D"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        operatorId: z.string().optional().nullable(),
        groupId: z.string().optional().nullable(),
        country: z.string().optional().nullable(),
        status: z
          .enum(["ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"])
          .optional()
          .nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userRole = ctx.session.user.role;
      const isStaff = userRole === "STAFF";

      // Security check: STAFF is strictly limited to their own assigned data
      const effectiveOperatorId = isStaff
        ? ctx.session.user.id
        : input.operatorId || null;

      const now = new Date();
      let currStart: Date | undefined;
      let currEnd: Date = new Date(now);
      let prevStart: Date | undefined;
      let prevEnd: Date | undefined;
      let isAllTime = false;

      // Studio daily history is capped at ~365d — legacy ALL behaves like 365D.
      const effectivePeriod =
        input.period === "ALL" ? ("365D" as const) : input.period;

      // Period range calculation
      if (effectivePeriod === "CUSTOM" && input.startDate && input.endDate) {
        const MAX_LOOKBACK_DAYS = 365;
        const todayUtc = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
        );
        const minStart = new Date(todayUtc);
        minStart.setUTCDate(minStart.getUTCDate() - MAX_LOOKBACK_DAYS);

        currStart = parseDateOnly(input.startDate);
        currEnd = parseDateOnly(input.endDate);
        if (currStart < minStart) currStart = new Date(minStart);
        if (currEnd < minStart) currEnd = new Date(minStart);
        if (currStart > todayUtc) currStart = new Date(todayUtc);
        if (currEnd > todayUtc) currEnd = new Date(todayUtc);
        if (currEnd < currStart) {
          const tmp = currStart;
          currStart = currEnd;
          currEnd = tmp;
        }
        currEnd.setUTCHours(23, 59, 59, 999);

        const duration = currEnd.getTime() - currStart.getTime();
        prevEnd = new Date(currStart.getTime() - 1);
        prevStart = new Date(prevEnd.getTime() - duration);
      } else {
        const daysMap: Record<string, number> = {
          "7D": 7,
          "14D": 14,
          "28D": 28,
          "30D": 30,
          "60D": 60,
          "90D": 90,
          "365D": 365,
        };
        const days = daysMap[effectivePeriod] || 30;
        currStart = new Date(now);
        currStart.setDate(now.getDate() - days);
        currStart.setHours(0, 0, 0, 0);

        prevEnd = new Date(currStart);
        prevStart = new Date(currStart);
        prevStart.setDate(currStart.getDate() - days);
        prevStart.setHours(0, 0, 0, 0);
      }

      // Build Account filter
      const whereAccount: any = {};
      if (effectiveOperatorId) {
        whereAccount.assignedUserId = effectiveOperatorId;
      }
      if (input.groupId) {
        whereAccount.assignedUser = { groupId: input.groupId };
      }
      if (input.country) {
        whereAccount.country = input.country;
      }
      if (input.status) {
        whereAccount.status = input.status;
      }

      // Query matched accounts
      const accounts = await ctx.prisma.tiktokAccount.findMany({
        where: whereAccount,
        select: {
          id: true,
          username: true,
          country: true,
          status: true,
          totalRevenue: true,
          totalViews: true,
          totalFollowers: true,
          totalVideos: true,
          assignedUserId: true,
          assignedUser: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              username: true,
              avatar: true,
              role: true,
              group: { select: { id: true, name: true, color: true } },
            },
          },
          alerts: {
            where: { status: "OPEN" },
            select: { id: true, alertType: true, severity: true },
          },
          analytics: true,
        },
      });

      const accountIds = accounts.map((a) => a.id);

      // Prepare queries for current and previous periods
      const whereCurrentDaily: any = { accountId: { in: accountIds } };
      if (currStart && !isAllTime) {
        whereCurrentDaily.date = { gte: currStart, lte: currEnd };
      }

      const whereChecklistUsers: any = {};
      if (effectiveOperatorId) {
        whereChecklistUsers.userId = effectiveOperatorId;
      } else if (input.groupId) {
        whereChecklistUsers.user = { groupId: input.groupId };
      }

      const [
        currentDailyRevenues,
        previousDailyRevenues,
        currentChecklists,
        previousChecklists,
        accountAlerts,
        recentLogs,
      ] = await Promise.all([
        // 1. CURRENT PERIOD Daily Revenues
        accountIds.length > 0
          ? ctx.prisma.dailyRevenue.findMany({
              where: whereCurrentDaily,
              orderBy: { date: "asc" },
              include: {
                account: {
                  select: { username: true, country: true },
                },
              },
            })
          : Promise.resolve([]),

        // 2. PREVIOUS PERIOD Daily Revenues (for deltas)
        prevStart && prevEnd && !isAllTime && accountIds.length > 0
          ? ctx.prisma.dailyRevenue.findMany({
              where: {
                accountId: { in: accountIds },
                date: { gte: prevStart, lte: prevEnd },
              },
              select: { revenue: true, views: true },
            })
          : Promise.resolve([] as Array<{ revenue: any; views: any }>),

        // 3. CURRENT CHECKLIST Performance
        ctx.prisma.dailyChecklist.findMany({
          where: {
            ...whereChecklistUsers,
            ...(currStart && !isAllTime ? { date: { gte: currStart, lte: currEnd } } : {}),
          },
          orderBy: { date: "asc" },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
              },
            },
          },
        }),

        // 4. PREVIOUS CHECKLIST Performance
        prevStart && prevEnd && !isAllTime
          ? ctx.prisma.dailyChecklist.findMany({
              where: {
                ...whereChecklistUsers,
                date: { gte: prevStart, lte: prevEnd },
              },
              select: { totalAssigned: true, completedCount: true, workdayScore: true },
            })
          : Promise.resolve([] as Array<{ totalAssigned: number; completedCount: number; workdayScore: any }>),

        // 5. ACCOUNT ALERTS in scope
        accountIds.length > 0
          ? ctx.prisma.accountAlert.findMany({
              where: { accountId: { in: accountIds } },
              orderBy: { createdAt: "desc" },
              include: {
                account: { select: { username: true } },
              },
              take: 30,
            })
          : Promise.resolve([]),

        // 6. AUDIT LOGS in scope
        accountIds.length > 0
          ? ctx.prisma.accountLog.findMany({
              where: { accountId: { in: accountIds } },
              orderBy: { createdAt: "desc" },
              include: {
                account: { select: { username: true } },
              },
              take: 15,
            })
          : Promise.resolve([]),
      ]);

      // Merge daily breakdown from AccountAnalytics JSON
      const existingDailyKeys = new Set(
        currentDailyRevenues.map((r) => `${r.accountId}_${formatDateKey(r.date)}`)
      );

      const combinedDailyRevenues: Array<{
        accountId: string;
        date: Date;
        revenue: number;
        views: number;
        sourceType?: string;
        account?: { username: string; country: string | null };
      }> = currentDailyRevenues.map((r) => ({
        accountId: r.accountId,
        date: r.date,
        revenue: Number(r.revenue || 0),
        views: Number(r.views || 0),
        sourceType: r.sourceType,
        account: r.account,
      }));

      for (const a of accounts) {
        const breakdown = ((a as any).analytics?.dailyRevenueBreakdown as any[]) || ((a as any).analytics?.dailyBreakdown as any[]) || [];
        for (const item of breakdown) {
          if (!item.date) continue;
          const dStr = item.date;
          if (currStart && !isAllTime) {
            const dObj = parseDateOnly(dStr);
            if (dObj < currStart || dObj > currEnd) continue;
          }
          const key = `${a.id}_${dStr}`;
          if (!existingDailyKeys.has(key)) {
            existingDailyKeys.add(key);
            combinedDailyRevenues.push({
              accountId: a.id,
              date: parseDateOnly(dStr),
              revenue: Number(item.revenue || 0),
              views: Number(item.views || 0),
              sourceType: "CREATOR_REWARDS",
              account: { username: a.username, country: a.country },
            });
          }
        }
      }

      // Overlay Studio Insights daily views (365d vv_history) — fill gaps / view-only days.
      for (const a of accounts) {
        const viewsBd = ((a as any).analytics?.dailyViewsBreakdown as any[]) || [];
        if (!Array.isArray(viewsBd) || viewsBd.length === 0) continue;
        const byDate = new Map<string, number>();
        for (const item of viewsBd) {
          if (!item?.date) continue;
          const dStr = String(item.date);
          if (currStart && !isAllTime) {
            const dObj = parseDateOnly(dStr);
            if (dObj < currStart || dObj > currEnd) continue;
          }
          byDate.set(dStr, Number(item.views || 0) || 0);
        }
        for (const row of combinedDailyRevenues) {
          if (row.accountId !== a.id) continue;
          const dStr = formatDateKey(row.date);
          if (byDate.has(dStr) && !(Number(row.views) > 0)) {
            row.views = byDate.get(dStr)!;
          }
          byDate.delete(dStr);
        }
        for (const [dStr, views] of byDate) {
          const key = `${a.id}_${dStr}`;
          if (existingDailyKeys.has(key)) continue;
          existingDailyKeys.add(key);
          combinedDailyRevenues.push({
            accountId: a.id,
            date: parseDateOnly(dStr),
            revenue: 0,
            views,
            sourceType: "INSIGHTS_VV",
            account: { username: a.username, country: a.country },
          });
        }
      }

      // ================= AGGREGATIONS & METRICS =================
      let currTotalRev = 0;
      let currTotalViews = 0;
      for (const r of combinedDailyRevenues) {
        currTotalRev += Number(r.revenue || 0);
        currTotalViews += Number(r.views || 0);
      }

      // Check direct preset analytics numbers from accounts if matching
      let presetRev = 0;
      let presetViews = 0;
      let hasPresetMetrics = false;

      if (effectivePeriod === "7D") {
        presetRev = accounts.reduce((s, a) => s + Number((a as any).analytics?.sumRevenue?.revenue7d ?? (a as any).analytics?.revenue7d ?? 0), 0);
        presetViews = accounts.reduce((s, a) => {
          const v = insightViewsContribution(
            (a as any).analytics,
            0,
            (sum) => Number(sum?.views7d ?? (a as any).analytics?.views7d ?? 0)
          );
          return s + (v ?? 0);
        }, 0);
        hasPresetMetrics = presetRev > 0 || presetViews > 0;
      } else if (effectivePeriod === "28D" || effectivePeriod === "30D") {
        presetRev = accounts.reduce((s, a) => s + Number((a as any).analytics?.sumRevenue?.revenue28d ?? (a as any).analytics?.revenue28d ?? 0), 0);
        presetViews = accounts.reduce((s, a) => {
          const v = insightViewsContribution(
            (a as any).analytics,
            0,
            (sum) => Number(sum?.views28d ?? (a as any).analytics?.views28d ?? 0)
          );
          return s + (v ?? 0);
        }, 0);
        hasPresetMetrics = presetRev > 0 || presetViews > 0;
      } else if (effectivePeriod === "60D") {
        presetRev = accounts.reduce((s, a) => s + Number((a as any).analytics?.sumRevenue?.revenue60d ?? (a as any).analytics?.revenue60d ?? 0), 0);
        presetViews = accounts.reduce((s, a) => {
          const v = insightViewsContribution(
            (a as any).analytics,
            0,
            (sum) => Number(sum?.views60d ?? (a as any).analytics?.views60d ?? 0)
          );
          return s + (v ?? 0);
        }, 0);
        hasPresetMetrics = presetRev > 0 || presetViews > 0;
      } else if (effectivePeriod === "365D") {
        presetRev = accounts.reduce((s, a) => s + Number((a as any).analytics?.sumRevenue?.revenue365d ?? (a as any).analytics?.revenue365d ?? 0), 0);
        presetViews = accounts.reduce((s, a) => {
          const v = insightViewsContribution(
            (a as any).analytics,
            0,
            (sum) => Number(sum?.views365d ?? (a as any).analytics?.views365d ?? 0)
          );
          return s + (v ?? 0);
        }, 0);
        hasPresetMetrics = presetRev > 0 || presetViews > 0;
      } else if (isAllTime) {
        // Prefer API period windows / postRewards over orphaned lifetime totalRevenue
        // (DOM "Total" scrape often diverges from reward_analytics).
        presetRev = accounts.reduce((s, a) => s + resolveAllTimeRevenue(a as any), 0);
        presetViews = accounts.reduce((s, a) => {
          const v = insightViewsContribution(
            (a as any).analytics,
            Number(a.totalViews ?? 0),
            (sum) => Number(sum?.totalViews ?? a.totalViews ?? 0)
          );
          return s + (v ?? 0);
        }, 0);
        hasPresetMetrics = true;
      }

      if (hasPresetMetrics) {
        if (presetRev > currTotalRev) currTotalRev = presetRev;
        if (presetViews > currTotalViews) currTotalViews = presetViews;
      }

      let prevTotalRev = 0;
      let prevTotalViews = 0;
      for (const r of previousDailyRevenues) {
        prevTotalRev += Number(r.revenue || 0);
        prevTotalViews += Number(r.views || 0);
      }

      const currAvgRpm = currTotalViews > 0
        ? Math.round(((currTotalRev * 1000) / currTotalViews) * 1000) / 1000
        : 0;

      const prevAvgRpm = prevTotalViews > 0
        ? Math.round(((prevTotalRev * 1000) / prevTotalViews) * 1000) / 1000
        : 0;

      // Checklist aggregation
      let currCompletedTasks = 0;
      let currAssignedTasks = 0;
      let currWorkdayScoreSum = 0;
      for (const c of currentChecklists) {
        currCompletedTasks += c.completedCount;
        currAssignedTasks += c.totalAssigned;
        currWorkdayScoreSum += Number(c.workdayScore || 0);
      }

      const currChecklistRate = currAssignedTasks > 0
        ? Math.round((currCompletedTasks / currAssignedTasks) * 1000) / 10
        : 0;

      let prevCompletedTasks = 0;
      let prevAssignedTasks = 0;
      for (const c of previousChecklists) {
        prevCompletedTasks += c.completedCount;
        prevAssignedTasks += c.totalAssigned;
      }
      const prevChecklistRate = prevAssignedTasks > 0
        ? Math.round((prevCompletedTasks / prevAssignedTasks) * 1000) / 10
        : 0;

      // Fleet Health score: % accounts that are ACTIVE or WARMING
      const totalAccountsCount = accounts.length;
      const healthyAccountsCount = accounts.filter(
        (a) => a.status === "ACTIVE" || a.status === "WARMING"
      ).length;
      const fleetHealthScore = totalAccountsCount > 0
        ? Math.round((healthyAccountsCount / totalAccountsCount) * 100)
        : 100;

      // Deltas
      const revenueGrowthPct = calcGrowth(currTotalRev, prevTotalRev);
      const viewsGrowthPct = calcGrowth(currTotalViews, prevTotalViews);
      const rpmGrowthPct = calcGrowth(currAvgRpm, prevAvgRpm);
      const checklistRateDeltaPct = Math.round((currChecklistRate - prevChecklistRate) * 10) / 10;

      // ================= TIME-SERIES MAP (Continuous) =================
      const timeSeriesMap = new Map<
        string,
        {
          date: string;
          displayDate: string;
          revenue: number;
          views: number;
          rpm: number;
          tasksCompleted: number;
          tasksAssigned: number;
          completionRate: number;
        }
      >();

      // Populate revenue time-series
      for (const rec of combinedDailyRevenues) {
        const dStr = formatDateKey(rec.date);
        const item = timeSeriesMap.get(dStr) || {
          date: dStr,
          displayDate: dStr.slice(5), // MM-DD
          revenue: 0,
          views: 0,
          rpm: 0,
          tasksCompleted: 0,
          tasksAssigned: 0,
          completionRate: 0,
        };
        item.revenue += Number(rec.revenue || 0);
        item.views += Number(rec.views || 0);
        timeSeriesMap.set(dStr, item);
      }

      // Populate checklist time-series
      for (const chk of currentChecklists) {
        const dStr = formatDateKey(chk.date);
        const item = timeSeriesMap.get(dStr) || {
          date: dStr,
          displayDate: dStr.slice(5),
          revenue: 0,
          views: 0,
          rpm: 0,
          tasksCompleted: 0,
          tasksAssigned: 0,
          completionRate: 0,
        };
        item.tasksCompleted += chk.completedCount;
        item.tasksAssigned += chk.totalAssigned;
        timeSeriesMap.set(dStr, item);
      }

      // Fill in zero days if date range is defined
      if (currStart && currEnd && !isAllTime) {
        const cur = new Date(currStart);
        while (cur <= currEnd) {
          const dStr = formatDateKey(cur);
          if (!timeSeriesMap.has(dStr)) {
            timeSeriesMap.set(dStr, {
              date: dStr,
              displayDate: dStr.slice(5),
              revenue: 0,
              views: 0,
              rpm: 0,
              tasksCompleted: 0,
              tasksAssigned: 0,
              completionRate: 0,
            });
          }
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      }

      // Compute final daily RPM and completion rate
      const timeSeries = Array.from(timeSeriesMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((point) => {
          const rpm = point.views > 0
            ? Math.round(((point.revenue * 1000) / point.views) * 100) / 100
            : 0;
          const completionRate = point.tasksAssigned > 0
            ? Math.round((point.tasksCompleted / point.tasksAssigned) * 100)
            : 0;
          return {
            ...point,
            revenue: Math.round(point.revenue * 100) / 100,
            views: point.views,
            rpm,
            completionRate,
          };
        });

      // ================= DISTRIBUTIONS =================
      // 1. Account Status Breakdown
      const statusCounts: Record<string, number> = {
        ACTIVE: 0,
        WARMING: 0,
        RESTRICTED: 0,
        BANNED: 0,
        STOPPED: 0,
        CUSTOM: 0,
      };
      for (const a of accounts) {
        statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
      }
      const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        percentage: totalAccountsCount > 0 ? Math.round((count / totalAccountsCount) * 100) : 0,
      }));

      // 2. Country Breakdown
      const countryMap = new Map<
        string,
        { country: string; accountsCount: number; revenue: number; views: number }
      >();
      for (const a of accounts) {
        const c = a.country || "OTHER";
        const entry = countryMap.get(c) || { country: c, accountsCount: 0, revenue: 0, views: 0 };
        entry.accountsCount += 1;
        countryMap.set(c, entry);
      }
      for (const rec of combinedDailyRevenues) {
        const c = rec.account?.country || "OTHER";
        const entry = countryMap.get(c);
        if (entry) {
          entry.revenue += Number(rec.revenue || 0);
          entry.views += Number(rec.views || 0);
        }
      }
      const countryDistribution = Array.from(countryMap.values())
        .map((entry) => ({
          ...entry,
          revenue: Math.round(entry.revenue * 100) / 100,
          rpm: entry.views > 0 ? Math.round(((entry.revenue * 1000) / entry.views) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      // 3. Revenue Source Breakdown
      const sourceMap = new Map<string, { source: string; revenue: number; views: number }>();
      for (const rec of combinedDailyRevenues) {
        const src = rec.sourceType || "CREATOR_REWARDS";
        const entry = sourceMap.get(src) || { source: src, revenue: 0, views: 0 };
        entry.revenue += Number(rec.revenue || 0);
        entry.views += Number(rec.views || 0);
        sourceMap.set(src, entry);
      }
      const sourceDistribution = Array.from(sourceMap.values()).map((s) => ({
        ...s,
        revenue: Math.round(s.revenue * 100) / 100,
        percentage: currTotalRev > 0 ? Math.round((s.revenue / currTotalRev) * 100) : 0,
      }));

      // ================= TOP & ATTENTION-NEEDED ACCOUNTS =================
      // Calculate period revenue per account
      const accountRevenueMap = new Map<string, { revenue: number; views: number }>();
      for (const r of combinedDailyRevenues) {
        const existing = accountRevenueMap.get(r.accountId) || { revenue: 0, views: 0 };
        existing.revenue += Number(r.revenue || 0);
        existing.views += Number(r.views || 0);
        accountRevenueMap.set(r.accountId, existing);
      }

      // Factor in direct preset metrics per account if applicable
      for (const a of accounts) {
        const existing = accountRevenueMap.get(a.id) || { revenue: 0, views: 0 };
        let directRev = 0;
        let directViews = 0;
        if (effectivePeriod === "7D") {
          directRev = Number((a as any).analytics?.sumRevenue?.revenue7d ?? (a as any).analytics?.revenue7d ?? 0);
          directViews =
            insightViewsContribution(
              (a as any).analytics,
              0,
              (sum) => Number(sum?.views7d ?? (a as any).analytics?.views7d ?? 0)
            ) ?? 0;
        } else if (effectivePeriod === "28D" || effectivePeriod === "30D") {
          directRev = Number((a as any).analytics?.sumRevenue?.revenue28d ?? (a as any).analytics?.revenue28d ?? 0);
          directViews =
            insightViewsContribution(
              (a as any).analytics,
              0,
              (sum) => Number(sum?.views28d ?? (a as any).analytics?.views28d ?? 0)
            ) ?? 0;
        } else if (effectivePeriod === "60D") {
          directRev = Number((a as any).analytics?.sumRevenue?.revenue60d ?? (a as any).analytics?.revenue60d ?? 0);
          directViews =
            insightViewsContribution(
              (a as any).analytics,
              0,
              (sum) => Number(sum?.views60d ?? (a as any).analytics?.views60d ?? 0)
            ) ?? 0;
        } else if (effectivePeriod === "365D") {
          directRev = Number((a as any).analytics?.sumRevenue?.revenue365d ?? (a as any).analytics?.revenue365d ?? 0);
          directViews =
            insightViewsContribution(
              (a as any).analytics,
              0,
              (sum) => Number(sum?.views365d ?? (a as any).analytics?.views365d ?? 0)
            ) ?? 0;
        } else if (isAllTime) {
          directRev = resolveAllTimeRevenue(a as any);
          directViews =
            insightViewsContribution(
              (a as any).analytics,
              Number(a.totalViews ?? 0),
              (sum) => Number(sum?.totalViews ?? a.totalViews ?? 0)
            ) ?? 0;
        }
        if (directRev > existing.revenue) existing.revenue = directRev;
        if (directViews > existing.views) existing.views = directViews;
        accountRevenueMap.set(a.id, existing);
      }

      const enrichedAccounts = accounts.map((a) => {
        const pStats = accountRevenueMap.get(a.id) || { revenue: 0, views: 0 };
        const revenue = Math.round(pStats.revenue * 100) / 100;
        const views = pStats.views;
        const rpm = views > 0 ? Math.round(((revenue * 1000) / views) * 100) / 100 : 0;
        const operatorName = a.assignedUser
          ? [a.assignedUser.firstName, a.assignedUser.lastName].filter(Boolean).join(" ") ||
          a.assignedUser.name ||
          a.assignedUser.username ||
          "Operator"
          : "Chưa phân công";

        return {
          id: a.id,
          username: a.username,
          country: a.country,
          status: a.status,
          totalFollowers: a.totalFollowers,
          periodRevenue: revenue,
          periodViews: views,
          rpm,
          operatorName,
          operatorAvatar: a.assignedUser?.avatar || null,
          groupName: a.assignedUser?.group?.name || null,
          openAlertsCount: a.alerts.length,
          hasCriticalAlert: a.alerts.some((al) => al.severity === "CRITICAL"),
        };
      });

      // Top 5 by Revenue
      const topAccounts = [...enrichedAccounts]
        .sort((a, b) => b.periodRevenue - a.periodRevenue)
        .slice(0, 5);

      // Top 5 Needing Attention (Banned, Restricted, Critical Alerts, or Zero views)
      const atRiskAccounts = [...enrichedAccounts]
        .filter(
          (a) =>
            a.status === "BANNED" ||
            a.status === "RESTRICTED" ||
            a.hasCriticalAlert ||
            a.openAlertsCount > 0
        )
        .sort((a, b) => b.openAlertsCount - a.openAlertsCount)
        .slice(0, 5);

      // ================= OPERATOR EFFICIENCY (Admin/Lead) or PERSONAL BENCHMARK (Staff) =================
      let operatorBenchmarks: any[] = [];
      let personalBenchmark: any = null;

      if (!isStaff) {
        // Group performance by operator
        const opMap = new Map<
          string,
          {
            operatorId: string;
            operatorName: string;
            operatorAvatar: string | null;
            role: string;
            groupName: string | null;
            accountsCount: number;
            totalRevenue: number;
            totalViews: number;
            tasksCompleted: number;
            tasksAssigned: number;
          }
        >();

        for (const a of accounts) {
          if (!a.assignedUser) continue;
          const uId = a.assignedUser.id;
          const opName =
            [a.assignedUser.firstName, a.assignedUser.lastName].filter(Boolean).join(" ") ||
            a.assignedUser.name ||
            a.assignedUser.username ||
            "Operator";

          const existing = opMap.get(uId) || {
            operatorId: uId,
            operatorName: opName,
            operatorAvatar: a.assignedUser.avatar,
            role: a.assignedUser.role,
            groupName: a.assignedUser.group?.name || null,
            accountsCount: 0,
            totalRevenue: 0,
            totalViews: 0,
            tasksCompleted: 0,
            tasksAssigned: 0,
          };
          existing.accountsCount += 1;
          const p = accountRevenueMap.get(a.id);
          if (p) {
            existing.totalRevenue += p.revenue;
            existing.totalViews += p.views;
          }
          opMap.set(uId, existing);
        }

        for (const chk of currentChecklists) {
          const existing = opMap.get(chk.userId);
          if (existing) {
            existing.tasksCompleted += chk.completedCount;
            existing.tasksAssigned += chk.totalAssigned;
          }
        }

        operatorBenchmarks = Array.from(opMap.values())
          .map((op) => ({
            ...op,
            totalRevenue: Math.round(op.totalRevenue * 100) / 100,
            completionRate:
              op.tasksAssigned > 0
                ? Math.round((op.tasksCompleted / op.tasksAssigned) * 100)
                : 0,
            avgRpm:
              op.totalViews > 0
                ? Math.round(((op.totalRevenue * 1000) / op.totalViews) * 100) / 100
                : 0,
          }))
          .sort((a, b) => b.totalRevenue - a.totalRevenue);
      } else {
        // Staff personal cockpit benchmark vs studio average
        const studioTotalUsers = await ctx.prisma.user.count({
          where: { isActive: true, deletedAt: null },
        });

        // Compute studio average revenue per user in this period
        const studioAvgRevenue = studioTotalUsers > 0
          ? Math.round((currTotalRev / studioTotalUsers) * 100) / 100
          : 0;

        personalBenchmark = {
          myRevenue: Math.round(currTotalRev * 100) / 100,
          myViews: currTotalViews,
          myRpm: currAvgRpm,
          myCompletionRate: currChecklistRate,
          myWorkdayScoreSum: Math.round(currWorkdayScoreSum * 10) / 10,
          myHealthyAccountsCount: healthyAccountsCount,
          myTotalAccountsCount: totalAccountsCount,
          studioAvgRevenue,
          studioAvgCompletionRate: 95.0, // baseline SLA
        };
      }

      // ================= ALERTS BREAKDOWN =================
      const alertSeverityCounts = {
        CRITICAL: 0,
        WARNING: 0,
        INFO: 0,
      };
      const alertTypeCounts: Record<string, number> = {};
      for (const al of accountAlerts) {
        alertSeverityCounts[al.severity] = (alertSeverityCounts[al.severity] || 0) + 1;
        alertTypeCounts[al.alertType] = (alertTypeCounts[al.alertType] || 0) + 1;
      }

      return serializeBigInt({
        period: effectivePeriod,
        dateRange: {
          start: currStart ? formatDateKey(currStart) : null,
          end: currEnd ? formatDateKey(currEnd) : null,
        },
        kpi: {
          totalRevenue: Math.round(currTotalRev * 100) / 100,
          prevTotalRevenue: Math.round(prevTotalRev * 100) / 100,
          revenueGrowthPct,
          totalViews: currTotalViews,
          prevTotalViews: prevTotalViews,
          viewsGrowthPct,
          avgRpm: currAvgRpm,
          prevAvgRpm: prevAvgRpm,
          rpmGrowthPct,
          fleetHealthScore,
          totalAccountsCount,
          healthyAccountsCount,
          checklistCompletionRate: currChecklistRate,
          prevChecklistCompletionRate: prevChecklistRate,
          checklistRateDeltaPct,
          openCriticalAlertsCount: alertSeverityCounts.CRITICAL,
          openWarningAlertsCount: alertSeverityCounts.WARNING,
        },
        timeSeries,
        distributions: {
          status: statusDistribution,
          country: countryDistribution,
          source: sourceDistribution,
        },
        topAccounts,
        atRiskAccounts,
        operatorBenchmarks,
        personalBenchmark,
        alertsBreakdown: {
          bySeverity: alertSeverityCounts,
          byType: alertTypeCounts,
          recentAlerts: accountAlerts.slice(0, 10),
        },
        recentLogs,
        isStaff,
      });
    }),
});

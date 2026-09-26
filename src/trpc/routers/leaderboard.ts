import { router, protectedProcedure } from "@/trpc/init";
import { z } from "zod";
import { resolveAllTimeRevenue } from "@/lib/resolve-all-time-revenue";
import { resolveUserScope } from "@/lib/lead-scoping";

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateOnlyUtc(str: string, endOfDay = false): Date {
  const [y, m, d] = str.split("-").map(Number);
  if (endOfDay) {
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  }
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export const leaderboardRouter = router({
  // 1. Leaderboard Ranking
  getRanking: protectedProcedure
    .input(
      z
        .object({
          period: z
            .enum(["TODAY", "THIS_WEEK", "THIS_MONTH", "THIS_YEAR", "ALL_TIME", "CUSTOM"])
            .default("THIS_MONTH"),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          teamId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      const period = input?.period || "THIS_MONTH";
      const now = new Date();

      let startDate: Date | undefined;
      let endDate: Date | undefined;
      let startDateStr: string | undefined;
      let endDateStr: string | undefined;

      if (period === "TODAY") {
        startDateStr = formatDateOnly(now);
        endDateStr = startDateStr;
        startDate = parseDateOnlyUtc(startDateStr, false);
        endDate = parseDateOnlyUtc(endDateStr, true);
      } else if (period === "THIS_WEEK") {
        // Monday to Sunday of the current week
        const currentDay = now.getDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
        const distanceToMonday = (currentDay + 6) % 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - distanceToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        startDateStr = formatDateOnly(monday);
        endDateStr = formatDateOnly(sunday);
        startDate = parseDateOnlyUtc(startDateStr, false);
        endDate = parseDateOnlyUtc(endDateStr, true);
      } else if (period === "THIS_MONTH") {
        // Month-To-Date (from 01 to current date)
        startDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        endDateStr = formatDateOnly(now);
        startDate = parseDateOnlyUtc(startDateStr, false);
        endDate = parseDateOnlyUtc(endDateStr, true);
      } else if (period === "THIS_YEAR" || period === "ALL_TIME") {
        // "Năm Nay": 365 days nearest up to today
        const past365 = new Date(now);
        past365.setDate(now.getDate() - 365);
        startDateStr = formatDateOnly(past365);
        endDateStr = formatDateOnly(now);
        startDate = parseDateOnlyUtc(startDateStr, false);
        endDate = parseDateOnlyUtc(endDateStr, true);
      } else if (period === "CUSTOM") {
        // Custom range constrained to nearest 365 days (max lookback)
        const past365 = new Date(now);
        past365.setDate(now.getDate() - 365);
        const minDateStr = formatDateOnly(past365);
        const maxDateStr = formatDateOnly(now);

        let sStr = input?.startDate || minDateStr;
        let eStr = input?.endDate || maxDateStr;

        if (sStr < minDateStr) sStr = minDateStr;
        if (sStr > maxDateStr) sStr = maxDateStr;
        if (eStr < minDateStr) eStr = minDateStr;
        if (eStr > maxDateStr) eStr = maxDateStr;
        if (sStr > eStr) {
          const tmp = sStr;
          sStr = eStr;
          eStr = tmp;
        }

        startDateStr = sStr;
        endDateStr = eStr;
        startDate = parseDateOnlyUtc(startDateStr, false);
        endDate = parseDateOnlyUtc(endDateStr, true);
      }

      const dateFilter: any = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;

      const userWhere: any = {
        isActive: true,
        deletedAt: null,
      };

      if (input?.teamId && input.teamId !== "ALL") {
        userWhere.teamId = input.teamId;
      }

      // Fetch all active operators
      const users = await ctx.prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          username: true,
          name: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
          teamId: true,
          team: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          tiktokAccounts: {
            select: {
              id: true,
              username: true,
              country: true,
              totalRevenue: true,
              totalViews: true,
              analytics: {
                select: {
                  sumRevenue: true,
                  sumViews: true,
                  postRewards: true,
                  rawSnapshot: true,
                  dailyRevenueBreakdown: true,
                },
              },
              dailyRevenues: {
                where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
                select: {
                  date: true,
                  views: true,
                  revenue: true,
                  rpm: true,
                },
              },
            },
          },
          dailyChecklists: {
            where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
            select: {
              completedCount: true,
              totalAssigned: true,
              workdayScore: true,
            },
          },
        },
      });

      const leaderData = users.map((u) => {
        const totalCompleted = u.dailyChecklists.reduce(
          (sum, c) => sum + c.completedCount,
          0
        );
        const totalAssigned = u.dailyChecklists.reduce(
          (sum, c) => sum + c.totalAssigned,
          0
        );
        const totalScore = u.dailyChecklists.reduce(
          (sum, c) => sum + Number(c.workdayScore || 0),
          0
        );

        let periodRevenue = 0;
        let periodViews = 0;

        for (const a of u.tiktokAccounts) {
          if (startDate && startDateStr) {
            const keys = new Set<string>();
            let accountRev = 0;
            let accountVw = 0;
            for (const dr of a.dailyRevenues) {
              const dStr = dr.date.toISOString().split("T")[0];
              if (dStr >= startDateStr && (!endDateStr || dStr <= endDateStr)) {
                keys.add(dStr);
                accountRev += Number(dr.revenue || 0);
                accountVw += Number(dr.views || 0);
              }
            }
            // Merge analytics daily breakdown for days not in DailyRevenue
            const breakdown =
              (a.analytics?.dailyRevenueBreakdown as any[]) || [];
            if (Array.isArray(breakdown)) {
              for (const item of breakdown) {
                if (!item?.date) continue;
                const dStr = String(item.date);
                if (dStr < startDateStr) continue;
                if (endDateStr && dStr > endDateStr) continue;
                if (keys.has(dStr)) continue;
                keys.add(dStr);
                accountRev += Number(item.revenue || 0);
                accountVw += Number(item.views || 0);
              }
            }

            // If period is THIS_YEAR or ALL_TIME (365d), also check native 365d preset
            if (period === "THIS_YEAR" || period === "ALL_TIME") {
              const sr = (a.analytics?.sumRevenue ?? {}) as Record<string, unknown>;
              const analytics = (a.analytics ?? {}) as Record<string, unknown>;
              const r365 = Number(sr.revenue365d ?? analytics.revenue365d ?? 0);
              const v365 = Number((a.analytics as any)?.sumViews?.views365d ?? analytics.views365d ?? 0);
              accountRev = Math.max(accountRev, r365);
              accountVw = Math.max(accountVw, v365);
            }

            periodRevenue += accountRev;
            periodViews += accountVw;
          } else {
            periodRevenue += resolveAllTimeRevenue(a as any);
            periodViews += Number(a.totalViews || 0);
          }
        }

        const completionRate =
          totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

        const accountsCount = u.tiktokAccounts.length;
        const avgRpm =
          periodViews > 0 && periodRevenue > 0
            ? Math.round(((periodRevenue * 1000) / periodViews) * 100) / 100
            : 0;
        const revPerAccount =
          accountsCount > 0 ? Math.round((periodRevenue / accountsCount) * 100) / 100 : 0;

        return {
          userId: u.id,
          username: u.username || u.name || "Operator",
          fullName:
            [u.firstName, u.lastName].filter(Boolean).join(" ") ||
            u.name ||
            u.username ||
            "Operator",
          avatar: u.avatar,
          role: u.role,
          teamId: u.teamId || u.team?.id || null,
          teamName: u.team?.name || null,
          teamColor: u.team?.color || null,
          accountCount: accountsCount,
          accountsCount: accountsCount,
          accounts: u.tiktokAccounts,
          totalCompleted,
          completionRate,
          avgCompletionRate: completionRate,
          totalScore: Math.round(totalScore * 10) / 10,
          totalWorkdays: Math.round(totalScore * 10) / 10,
          totalRevenue: Math.round(periodRevenue * 100) / 100,
          periodRevenue: Math.round(periodRevenue * 100) / 100,
          avgRpm,
          revPerAccount,
        };
      });

      // Sort by periodRevenue desc, then totalScore desc, then completionRate desc
      leaderData.sort((a, b) => {
        if (b.periodRevenue !== a.periodRevenue) return b.periodRevenue - a.periodRevenue;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
        return b.accountsCount - a.accountsCount;
      });

      const rankedList = leaderData.map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

      return rankedList;
    }),

  // 2. Public teams list for leaderboard dropdown
  getTeams: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.team.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    });
  }),
});

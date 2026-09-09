import { router, protectedProcedure } from "@/trpc/init";
import { z } from "zod";

export const leaderboardRouter = router({
  // 1. Leaderboard Ranking
  getRanking: protectedProcedure
    .input(
      z.object({
        period: z.enum(["TODAY", "THIS_WEEK", "THIS_MONTH", "ALL_TIME"]).default("THIS_MONTH"),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const period = input?.period || "THIS_MONTH";
      const now = new Date();

      let startDate: Date | undefined;
      if (period === "TODAY") {
        startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      } else if (period === "THIS_WEEK") {
        const day = now.getDay() || 7;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - day + 1);
        startDate.setHours(0, 0, 0, 0);
      } else if (period === "THIS_MONTH") {
        startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      }

      // Fetch all active operators
      const users = await ctx.prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          username: true,
          name: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
          tiktokAccounts: {
            select: {
              id: true,
              totalRevenue: true,
              totalViews: true,
              dailyRevenues: {
                where: startDate ? { date: { gte: startDate } } : undefined,
                select: {
                  views: true,
                  revenue: true,
                  rpm: true,
                },
              },
            },
          },
          dailyChecklists: {
            where: startDate ? { date: { gte: startDate } } : undefined,
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
          if (startDate) {
            for (const dr of a.dailyRevenues) {
              periodRevenue += Number(dr.revenue || 0);
              periodViews += Number(dr.views || 0);
            }
          } else {
            periodRevenue += Number(a.totalRevenue || 0);
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
          fullName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || u.username || "Operator",
          avatar: u.avatar,
          role: u.role,
          accountCount: accountsCount,
          accountsCount: accountsCount,
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
});

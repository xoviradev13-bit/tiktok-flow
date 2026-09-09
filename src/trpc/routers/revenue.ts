import { router, protectedProcedure, leadProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

export const revenueRouter = router({
  // 1. Revenue Overview & Charts
  getOverview: protectedProcedure
    .input(
      z
        .object({
          days: z.number().optional().default(28),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 28;
      const startDate = input?.startDate;
      const endDate = input?.endDate;
      const isCustomRange = Boolean(startDate && endDate);

      const whereAccount: any = {};
      if (ctx.session.user.role === "STAFF") {
        whereAccount.assignedUserId = ctx.session.user.id;
      }

      const accounts = await ctx.prisma.tiktokAccount.findMany({
        where: whereAccount,
        select: { id: true, totalRevenue: true, totalViews: true },
      });

      const accountIds = accounts.map((a) => a.id);

      const whereDaily: any = {
        accountId: { in: accountIds },
      };

      if (isCustomRange && startDate && endDate) {
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        end.setUTCHours(23, 59, 59, 999);
        whereDaily.date = { gte: start, lte: end };
      } else if (days > 0) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - days);
        whereDaily.date = { gte: pastDate };
      }

      const dailyRecords = await ctx.prisma.dailyRevenue.findMany({
        where: whereDaily,
        orderBy: { date: "asc" },
        include: {
          account: {
            select: { username: true },
          },
        },
      });

      // Group by date for charts
      const chartMap = new Map<string, { date: string; revenue: number; views: number }>();
      let periodRevenue = 0;
      let periodViews = 0;

      for (const rec of dailyRecords) {
        const dateStr = rec.date.toISOString().split("T")[0];
        const existing = chartMap.get(dateStr) || { date: dateStr, revenue: 0, views: 0 };
        const rev = Number(rec.revenue || 0);
        const vw = Number(rec.views || 0);
        existing.revenue += rev;
        existing.views += vw;
        periodRevenue += rev;
        periodViews += vw;
        chartMap.set(dateStr, existing);
      }

      // If custom date range is provided, fill missing days in range so chart is continuous
      if (isCustomRange && startDate && endDate) {
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        const curr = new Date(start);
        while (curr <= end) {
          const dStr = curr.toISOString().split("T")[0];
          if (!chartMap.has(dStr)) {
            chartMap.set(dStr, { date: dStr, revenue: 0, views: 0 });
          }
          curr.setUTCDate(curr.getUTCDate() + 1);
        }
      }

      const chartData = Array.from(chartMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          ...d,
          revenue: Math.round(d.revenue * 100) / 100,
          rpm: d.views > 0 ? Math.round(((d.revenue * 1000) / d.views) * 100) / 100 : 0,
        }));

      // Total records count in database
      const totalRecords = dailyRecords.length;

      // For ALL-TIME (days === 0 and not custom range), if daily records don't cover full lifetime, use the higher accumulated totals from accounts
      const accTotalRevenue = accounts.reduce((sum, a) => sum + Number(a.totalRevenue || 0), 0);
      const accTotalViews = accounts.reduce((sum, a) => sum + Number(a.totalViews || 0), 0);

      const totalRevenue =
        days === 0 && !isCustomRange
          ? Math.max(periodRevenue, accTotalRevenue)
          : periodRevenue;

      const totalViews =
        days === 0 && !isCustomRange
          ? Math.max(periodViews, accTotalViews)
          : periodViews;

      return {
        days: isCustomRange ? 0 : days,
        startDate: startDate || null,
        endDate: endDate || null,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalViews,
        totalRecords,
        averageRpm:
          totalViews > 0
            ? Math.round(((totalRevenue * 1000) / totalViews) * 100) / 100
            : 0,
        chartData,
        records: serializeBigInt(dailyRecords.slice(0, 100)),
      };
    }),

  // 2. Upsert Daily Revenue Record (LEAD / ADMIN, or assigned user)
  upsert: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        date: z.string(), // YYYY-MM-DD
        views: z.number().default(0),
        rpm: z.number().default(0.0),
        revenue: z.number().default(0.0),
        sourceType: z.string().default("CREATOR_REWARDS"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.tiktokAccount.findUnique({
        where: { id: input.accountId },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      if (ctx.session.user.role === "STAFF" && account.assignedUserId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not permitted to record revenue for this account",
        });
      }

      const dateObj = parseDateOnly(input.date);

      // Auto-calculate revenue if RPM & views provided but revenue not set
      let finalRevenue = input.revenue;
      if (!finalRevenue && input.views && input.rpm) {
        finalRevenue = (input.views / 1000) * input.rpm;
      }

      const record = await ctx.prisma.dailyRevenue.upsert({
        where: {
          accountId_date_sourceType: {
            accountId: input.accountId,
            date: dateObj,
            sourceType: input.sourceType,
          },
        },
        create: {
          accountId: input.accountId,
          date: dateObj,
          views: BigInt(input.views),
          rpm: input.rpm,
          revenue: finalRevenue,
          sourceType: input.sourceType,
        },
        update: {
          views: BigInt(input.views),
          rpm: input.rpm,
          revenue: finalRevenue,
        },
      });

      // Recalculate account total revenue using database SUM aggregation
      const revenueAggregate = await ctx.prisma.dailyRevenue.aggregate({
        where: { accountId: input.accountId },
        _sum: { revenue: true },
      });

      const newTotalRevenue = Number(revenueAggregate._sum.revenue || 0);

      await ctx.prisma.tiktokAccount.update({
        where: { id: input.accountId },
        data: {
          totalRevenue: newTotalRevenue,
        },
      });

      return serializeBigInt(record);
    }),

  // 3. List Detailed Revenue Records
  listDetails: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        accountId: z.string().optional(),
        sourceType: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const whereAccount: any = {};
      if (ctx.session.user.role === "STAFF") {
        whereAccount.assignedUserId = ctx.session.user.id;
      }
      if (input?.accountId && input.accountId !== "ALL") {
        whereAccount.id = input.accountId;
      }
      if (input?.search) {
        whereAccount.username = { contains: input.search.trim().replace(/^@/, ""), mode: "insensitive" };
      }

      const where: any = {};
      where.account = whereAccount;

      if (input?.sourceType && input.sourceType !== "ALL") {
        where.sourceType = input.sourceType;
      }

      if (input?.startDate) {
        where.date = { ...where.date, gte: parseDateOnly(input.startDate) };
      }
      if (input?.endDate) {
        where.date = { ...where.date, lte: parseDateOnly(input.endDate) };
      }

      const records = await ctx.prisma.dailyRevenue.findMany({
        where,
        include: {
          account: {
            select: {
              id: true,
              username: true,
              country: true,
              assignedUser: {
                select: {
                  id: true,
                  fullName: true,
                  name: true,
                  username: true,
                },
              },
            },
          },
        },
        orderBy: { date: "desc" },
      });

      return serializeBigInt(records);
    }),

  // 4. Bulk Delete Revenue Records (LEAD / ADMIN)
  bulkDelete: leadProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // Find affected account IDs first to recalculate revenue
      const records = await ctx.prisma.dailyRevenue.findMany({
        where: { id: { in: input.ids } },
        select: { accountId: true },
      });
      const accountIds = Array.from(new Set(records.map((r) => r.accountId)));

      const res = await ctx.prisma.dailyRevenue.deleteMany({
        where: { id: { in: input.ids } },
      });

      // Recalculate totals for affected accounts
      for (const accId of accountIds) {
        const remaining = await ctx.prisma.dailyRevenue.findMany({
          where: { accountId: accId },
          select: { revenue: true },
        });
        const total = remaining.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
        await ctx.prisma.tiktokAccount.update({
          where: { id: accId },
          data: { totalRevenue: total },
        });
      }

      return { count: res.count };
    }),
});

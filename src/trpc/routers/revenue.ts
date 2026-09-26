import { router, protectedProcedure, leadProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { insightViewsContribution } from "@/lib/insights-ui";
import {
  getM10nProgramById,
  getM10nProgramByKey,
  matchesRevenueSourceFilter,
  resolveRevenueSourceKey,
  revenueSourceFilterKeys,
} from "@/lib/m10n-programs";
import { resolvePeriodRevenue, resolveThisMonthRevenue } from "@/lib/resolve-all-time-revenue";
import { resolveUserScope } from "@/lib/lead-scoping";

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateKey(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().split("T")[0];
}

function computeRpm(revenue: number, views: number): number {
  if (!(views > 0) || !(revenue > 0)) return 0;
  return Math.round(((revenue * 1000) / views) * 100) / 100;
}

function isCreatorRewardsFilter(sourceType?: string | null): boolean {
  if (!sourceType || sourceType === "ALL") return true;
  return matchesRevenueSourceFilter("M10N_PROGRAM_CREATOR_INCENTIVES", sourceType);
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
          period: z.enum(["THIS_WEEK", "THIS_MONTH", "CUSTOM"]).optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          teamId: z.string().optional().nullable(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      let period = input?.period;
      let startDate = input?.startDate;
      let endDate = input?.endDate;

      if (!period) {
        if (startDate && endDate) {
          period = "CUSTOM";
        } else if (input?.days === 7) {
          period = "THIS_WEEK";
        } else {
          period = "THIS_MONTH";
        }
      }

      if (period === "THIS_WEEK") {
        // Monday to Sunday of current week
        const currentDay = now.getDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
        const distanceToMonday = (currentDay + 6) % 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - distanceToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        startDate = formatDateKey(monday);
        endDate = formatDateKey(sunday);
      } else if (period === "THIS_MONTH") {
        // From 01 of current month till current day
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        endDate = formatDateKey(now);
      } else if (period === "CUSTOM") {
        // Limit up to 60 days ago
        const min60 = new Date(now);
        min60.setDate(now.getDate() - 59);
        const min60Str = formatDateKey(min60);
        const maxStr = formatDateKey(now);

        if (!startDate || startDate < min60Str) startDate = min60Str;
        if (!endDate || endDate > maxStr) endDate = maxStr;
        if (startDate > endDate) startDate = endDate;
      }

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      const whereAccount: any = {};
      if (scope.isStaff) {
        whereAccount.assignedUserId = ctx.session.user.id;
      } else if (scope.isLead) {
        if (input?.teamId && input.teamId !== "ALL") {
          if (scope.teamIds.includes(input.teamId)) {
            whereAccount.assignedUser = { teamId: input.teamId };
          } else {
            whereAccount.assignedUserId = { in: [] };
          }
        } else {
          whereAccount.assignedUserId = { in: scope.memberUserIds };
        }
      } else if (input?.teamId && input.teamId !== "ALL") {
        whereAccount.assignedUser = { teamId: input.teamId };
      }

      const accounts = await ctx.prisma.tiktokAccount.findMany({
        where: whereAccount,
        select: {
          id: true,
          username: true,
          totalRevenue: true,
          totalViews: true,
          analytics: true,
        },
      });

      const accountIds = accounts.map((a) => a.id);

      const whereDaily: any = {
        accountId: { in: accountIds },
      };

      if (startDate && endDate) {
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        end.setUTCHours(23, 59, 59, 999);
        whereDaily.date = { gte: start, lte: end };
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
      const existingRecordKeys = new Set<string>();
      const viewsFromDbKeys = new Set<string>();
      let periodRevenue = 0;
      let periodViews = 0;

      for (const rec of dailyRecords) {
        const dateStr = rec.date.toISOString().split("T")[0];
        const key = `${rec.accountId}_${dateStr}`;
        existingRecordKeys.add(key);
        const existing = chartMap.get(dateStr) || { date: dateStr, revenue: 0, views: 0 };
        const rev = Number(rec.revenue || 0);
        const vw = Number(rec.views || 0);
        existing.revenue += rev;
        existing.views += vw;
        periodRevenue += rev;
        periodViews += vw;
        chartMap.set(dateStr, existing);
        if (vw > 0) viewsFromDbKeys.add(key);
      }

      // Merge daily breakdown from AccountAnalytics JSON
      let breakdownRecordsCount = 0;
      for (const acc of accounts) {
        const breakdown = (acc.analytics?.dailyRevenueBreakdown as any[]) || ((acc.analytics as any)?.dailyBreakdown as any[]) || [];
        for (const item of breakdown) {
          if (!item.date) continue;
          const dateStr = item.date;
          // Filter by date range
          if (startDate && endDate) {
            if (dateStr < startDate || dateStr > endDate) continue;
          }

          breakdownRecordsCount++;
          // Only add if not already covered by a manual DailyRevenue record
          if (!existingRecordKeys.has(`${acc.id}_${dateStr}`)) {
            const existing = chartMap.get(dateStr) || { date: dateStr, revenue: 0, views: 0 };
            const rev = Number(item.revenue || 0);
            const vw = Number(item.views || 0);
            existing.revenue += rev;
            existing.views += vw;
            periodRevenue += rev;
            periodViews += vw;
            chartMap.set(dateStr, existing);
          }
        }
      }

      // Merge Studio Insights daily views (365d) into the chart.
      for (const acc of accounts) {
        const viewsBd = (acc.analytics?.dailyViewsBreakdown as any[]) || [];
        if (!Array.isArray(viewsBd) || viewsBd.length === 0) continue;
        for (const item of viewsBd) {
          if (!item?.date) continue;
          const dateStr = String(item.date);
          if (startDate && endDate) {
            if (dateStr < startDate || dateStr > endDate) continue;
          }
          const key = `${acc.id}_${dateStr}`;
          // Prefer DailyRevenue.views when that row already has views > 0.
          if (viewsFromDbKeys.has(key)) continue;
          const vw = Number(item.views || 0) || 0;
          if (vw <= 0) continue;
          const existing = chartMap.get(dateStr) || { date: dateStr, revenue: 0, views: 0 };
          existing.views += vw;
          periodViews += vw;
          chartMap.set(dateStr, existing);
          viewsFromDbKeys.add(key);
        }
      }

      // Fill missing days in range so chart is continuous
      if (startDate && endDate) {
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

      let analyticsPeriodRev = 0;
      let analyticsPeriodViews = 0;
      let hasAnalyticsPreset = false;

      if (period === "THIS_MONTH") {
        analyticsPeriodRev = accounts.reduce((s, a) => s + resolveThisMonthRevenue(a as any), 0);
        analyticsPeriodViews = accounts.reduce((s, a) => {
          const v = insightViewsContribution(
            a.analytics as any,
            0,
            (sum) => Number(sum?.views30d ?? sum?.views28d ?? (a.analytics as any)?.views30d ?? (a.analytics as any)?.views28d ?? 0)
          );
          return s + (v ?? 0);
        }, 0);
        hasAnalyticsPreset = analyticsPeriodRev > 0 || analyticsPeriodViews > 0;
      }

      const totalRevenue = hasAnalyticsPreset
        ? Math.max(periodRevenue, analyticsPeriodRev)
        : periodRevenue;

      const totalViews = hasAnalyticsPreset
        ? Math.max(periodViews, analyticsPeriodViews)
        : periodViews;

      const totalRecords = dailyRecords.length + breakdownRecordsCount;

      return {
        period,
        days: period === "THIS_WEEK" ? 7 : period === "THIS_MONTH" ? 30 : 0,
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

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      if (scope.isStaff && account.assignedUserId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not permitted to record revenue for this account",
        });
      }
      if (scope.isLead && (!account.assignedUserId || !scope.memberUserIds.includes(account.assignedUserId))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn chỉ có thể ghi nhận doanh thu cho tài khoản thuộc đội nhóm của mình.",
        });
      }

      const dateObj = parseDateOnly(input.date);
      const sourceType = resolveRevenueSourceKey(input.sourceType);

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
            sourceType,
          },
        },
        create: {
          accountId: input.accountId,
          date: dateObj,
          views: BigInt(input.views),
          rpm: input.rpm,
          revenue: finalRevenue,
          sourceType,
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

  // 2b. Bulk import manual daily revenue rows (Excel / CSV)
  bulkImport: protectedProcedure
    .input(
      z.object({
        records: z
          .array(
            z.object({
              username: z.string().min(1),
              date: z.string().min(8),
              views: z.number().default(0),
              rpm: z.number().default(0),
              revenue: z.number().default(0),
              sourceType: z.string().optional(),
            })
          )
          .min(1)
          .max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isStaff = ctx.session.user.role === "STAFF";
      const cleanUser = (u: string) => u.trim().replace(/^@+/, "").toLowerCase();

      const usernames = Array.from(
        new Set(input.records.map((r) => cleanUser(r.username)).filter(Boolean))
      );

      if (usernames.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Không có username hợp lệ trong file import.",
        });
      }

      const scope = await resolveUserScope(ctx.prismaRaw, ctx.session.user);
      let assignedUserFilter: any = {};
      if (scope.isStaff) {
        assignedUserFilter = { assignedUserId: ctx.session.user.id };
      } else if (scope.isLead) {
        assignedUserFilter = { assignedUserId: { in: scope.memberUserIds } };
      }

      const accounts = await ctx.prismaRaw.tiktokAccount.findMany({
        where: {
          OR: usernames.map((u) => ({
            username: { equals: u, mode: "insensitive" as const },
          })),
          ...assignedUserFilter,
          deletedAt: null,
        },
        select: { id: true, username: true, assignedUserId: true },
      });

      const byUsername = new Map(
        accounts.map((a) => [a.username.toLowerCase(), a])
      );

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      const touchedAccountIds = new Set<string>();

      for (let i = 0; i < input.records.length; i++) {
        const row = input.records[i];
        const uname = cleanUser(row.username);
        const account = byUsername.get(uname);
        if (!account) {
          skipped += 1;
          if (errors.length < 20) {
            errors.push(`Dòng ${i + 1}: không tìm thấy @${uname}`);
          }
          continue;
        }

        const dateStr = String(row.date).trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          skipped += 1;
          if (errors.length < 20) {
            errors.push(`Dòng ${i + 1}: ngày không hợp lệ (${row.date})`);
          }
          continue;
        }

        let views = Math.max(0, Math.round(Number(row.views) || 0));
        let rpm = Number(row.rpm) || 0;
        let revenue = Number(row.revenue) || 0;
        if (!revenue && views > 0 && rpm > 0) {
          revenue = (views / 1000) * rpm;
        }
        if (!rpm && views > 0 && revenue > 0) {
          rpm = Math.round(((revenue * 1000) / views) * 100) / 100;
        }

        const sourceType = resolveRevenueSourceKey(row.sourceType);

        try {
          await ctx.prisma.dailyRevenue.upsert({
            where: {
              accountId_date_sourceType: {
                accountId: account.id,
                date: parseDateOnly(dateStr),
                sourceType,
              },
            },
            create: {
              accountId: account.id,
              date: parseDateOnly(dateStr),
              views: BigInt(views),
              rpm,
              revenue,
              sourceType,
            },
            update: {
              views: BigInt(views),
              rpm,
              revenue,
            },
          });
          imported += 1;
          touchedAccountIds.add(account.id);
        } catch (err: any) {
          skipped += 1;
          if (errors.length < 20) {
            errors.push(`Dòng ${i + 1}: ${err?.message || "lỗi lưu"}`);
          }
        }
      }

      for (const accountId of touchedAccountIds) {
        const agg = await ctx.prisma.dailyRevenue.aggregate({
          where: { accountId },
          _sum: { revenue: true },
        });
        await ctx.prisma.tiktokAccount.update({
          where: { id: accountId },
          data: { totalRevenue: Number(agg._sum.revenue || 0) },
        });
      }

      return {
        success: true,
        imported,
        skipped,
        total: input.records.length,
        errors,
        message: `Đã import ${imported}/${input.records.length} bản ghi${
          skipped ? ` (bỏ qua ${skipped})` : ""
        }.`,
      };
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
        includeArchived: z.boolean().optional().default(false),
        teamId: z.string().optional().nullable(),
        operatorId: z.string().optional().nullable(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const includeArchived = Boolean(input?.includeArchived);
      const dbClient = includeArchived ? ctx.prismaRaw : ctx.prisma;

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);

      const whereAccount: any = {};
      if (!includeArchived) {
        whereAccount.deletedAt = null;
      }
      if (scope.isStaff) {
        whereAccount.assignedUserId = ctx.session.user.id;
      } else if (scope.isLead) {
        if (input?.teamId && input.teamId !== "ALL") {
          if (scope.teamIds.includes(input.teamId)) {
            whereAccount.assignedUser = { ...whereAccount.assignedUser, teamId: input.teamId };
          } else {
            whereAccount.assignedUserId = { in: [] };
          }
        } else {
          whereAccount.assignedUserId = { in: scope.memberUserIds };
        }
      } else if (input?.teamId && input.teamId !== "ALL") {
        whereAccount.assignedUser = { ...whereAccount.assignedUser, teamId: input.teamId };
      }

      if (input?.operatorId && input.operatorId !== "ALL") {
        whereAccount.assignedUserId = input.operatorId;
      }

      if (input?.accountId && input.accountId !== "ALL") {
        whereAccount.id = input.accountId;
      }
      if (input?.search) {
        const s = input.search.trim().replace(/^@+/, "");
        whereAccount.OR = [
          { username: { contains: s, mode: "insensitive" as const } },
          { gpmProfileName: { contains: s, mode: "insensitive" as const } },
          { groupName: { contains: s, mode: "insensitive" as const } },
          {
            assignedUser: {
              OR: [
                { fullName: { contains: s, mode: "insensitive" as const } },
                { name: { contains: s, mode: "insensitive" as const } },
                { username: { contains: s, mode: "insensitive" as const } },
              ],
            },
          },
        ];
      }

      const where: any = {};
      where.account = whereAccount;

      const sourceFilter = input?.sourceType && input.sourceType !== "ALL" ? input.sourceType : null;
      if (sourceFilter) {
        const keys = revenueSourceFilterKeys(sourceFilter);
        where.sourceType = keys.length > 1 ? { in: keys } : keys[0] || sourceFilter;
      }

      if (input?.startDate) {
        where.date = { ...where.date, gte: parseDateOnly(input.startDate) };
      }
      if (input?.endDate) {
        where.date = { ...where.date, lte: parseDateOnly(input.endDate) };
      }

      const assignedUserSelect = {
        id: true,
        fullName: true,
        name: true,
        username: true,
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
      };

      const [records, accountsWithAnalytics] = await Promise.all([
        dbClient.dailyRevenue.findMany({
          where,
          include: {
            account: {
              select: {
                id: true,
                username: true,
                country: true,
                deletedAt: true,
                assignedUser: {
                  select: assignedUserSelect,
                },
              },
            },
          },
          orderBy: { date: "desc" },
        }),
        dbClient.tiktokAccount.findMany({
          where: whereAccount,
          select: {
            id: true,
            username: true,
            country: true,
            deletedAt: true,
            assignedUser: {
              select: assignedUserSelect,
            },
            analytics: true,
          },
        }),
      ]);

      // Key includes sourceType so one day can have multiple program rows.
      const occupiedKeys = new Set(
        records.map(
          (r) =>
            `${r.accountId}_${formatDateKey(r.date)}_${resolveRevenueSourceKey(r.sourceType)}`
        )
      );

      const allRecords: any[] = records.map((r) => ({
        ...r,
        sourceType: resolveRevenueSourceKey(r.sourceType),
      }));

      const accountMeta = (acc: (typeof accountsWithAnalytics)[number]) => ({
        id: acc.id,
        username: acc.username,
        country: acc.country,
        deletedAt: acc.deletedAt,
        assignedUser: acc.assignedUser,
      });

      const pushAutoRow = (opts: {
        account: (typeof accountsWithAnalytics)[number];
        dateStr: string;
        views: number;
        revenue: number;
        sourceType: string;
        idPrefix?: string;
      }) => {
        const sourceType = resolveRevenueSourceKey(opts.sourceType);
        const key = `${opts.account.id}_${opts.dateStr}_${sourceType}`;
        if (occupiedKeys.has(key)) return;
        occupiedKeys.add(key);
        const viewsNum = Math.max(0, Math.round(Number(opts.views) || 0));
        const revNum = Number(opts.revenue) || 0;
        allRecords.push({
          id: `${opts.idPrefix || "auto"}-${opts.account.id}-${opts.dateStr}-${sourceType}`,
          accountId: opts.account.id,
          date: new Date(opts.dateStr + "T00:00:00.000Z"),
          views: BigInt(viewsNum),
          rpm: computeRpm(revNum, viewsNum),
          revenue: revNum,
          sourceType,
          createdAt: new Date(opts.dateStr + "T00:00:00.000Z"),
          account: accountMeta(opts.account),
        });
      };

      // Studio daily_estimated_income ≈ Creator Rewards Program aggregate.
      if (!sourceFilter || isCreatorRewardsFilter(sourceFilter)) {
        for (const acc of accountsWithAnalytics) {
          const breakdown =
            (acc.analytics?.dailyRevenueBreakdown as any[]) ||
            ((acc.analytics as any)?.dailyBreakdown as any[]) ||
            [];
          for (const item of breakdown) {
            if (!item?.date) continue;
            const dateStr = String(item.date).slice(0, 10);
            if (input?.startDate && dateStr < input.startDate) continue;
            if (input?.endDate && dateStr > input.endDate) continue;
            pushAutoRow({
              account: acc,
              dateStr,
              views: Number(item.views || 0),
              revenue: Number(item.revenue || 0),
              sourceType: "M10N_PROGRAM_CREATOR_INCENTIVES",
            });
          }
        }
      }

      // Per-program rows from postRewards (used when filtering a specific program,
      // or when ALL — only for programs other than Creator Rewards to avoid double-count).
      for (const acc of accountsWithAnalytics) {
        const postRewards = Array.isArray(acc.analytics?.postRewards)
          ? (acc.analytics!.postRewards as any[])
          : [];
        if (postRewards.length === 0) continue;

        const buckets = new Map<
          string,
          { dateStr: string; sourceType: string; revenue: number; views: number }
        >();

        for (const post of postRewards) {
          const dateStr = String(post.postDate || post.publishDate || post.date || "").slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
          if (input?.startDate && dateStr < input.startDate) continue;
          if (input?.endDate && dateStr > input.endDate) continue;

          const prog =
            getM10nProgramById(Number(post.programId)) ||
            getM10nProgramByKey(post.programName) ||
            getM10nProgramByKey(post.program);
          const sourceType = resolveRevenueSourceKey(prog?.key || post.programId || "OTHER");

          // Skip Creator Rewards posts under ALL / CRP filter — covered by daily breakdown.
          if (
            (!sourceFilter || isCreatorRewardsFilter(sourceFilter)) &&
            sourceType === "M10N_PROGRAM_CREATOR_INCENTIVES"
          ) {
            continue;
          }
          if (sourceFilter && !matchesRevenueSourceFilter(sourceType, sourceFilter)) {
            continue;
          }

          const key = `${dateStr}_${sourceType}`;
          const prev = buckets.get(key) || {
            dateStr,
            sourceType,
            revenue: 0,
            views: 0,
          };
          prev.revenue += Number(post.reward || post.rewards || 0) || 0;
          prev.views += Number(post.views || 0) || 0;
          buckets.set(key, prev);
        }

        for (const b of buckets.values()) {
          pushAutoRow({
            account: acc,
            dateStr: b.dateStr,
            views: b.views,
            revenue: b.revenue,
            sourceType: b.sourceType,
            idPrefix: "auto-prog",
          });
        }
      }

      // Overlay Studio Insights daily views + fill view-only days.
      for (const acc of accountsWithAnalytics) {
        const viewsBd = ((acc.analytics as any)?.dailyViewsBreakdown as any[]) || [];
        if (!Array.isArray(viewsBd) || viewsBd.length === 0) continue;

        const viewsByDate = new Map<string, number>();
        for (const item of viewsBd) {
          if (!item?.date) continue;
          const dateStr = String(item.date).slice(0, 10);
          if (input?.startDate && dateStr < input.startDate) continue;
          if (input?.endDate && dateStr > input.endDate) continue;
          viewsByDate.set(dateStr, Number(item.views || 0) || 0);
        }

        for (const row of allRecords) {
          if (row.accountId !== acc.id) continue;
          const dateStr = formatDateKey(row.date);
          if (!viewsByDate.has(dateStr)) continue;
          const vv = viewsByDate.get(dateStr)!;
          if (!(Number(row.views) > 0) && vv > 0) {
            row.views = typeof row.views === "bigint" ? BigInt(vv) : vv;
            row.rpm = computeRpm(Number(row.revenue || 0), vv);
          }
          // Still leave the date in the map so we can add INSIGHTS_VV for leftover days
          // only when this account has no revenue row that day at all.
        }

        const datesWithAnyRow = new Set(
          allRecords
            .filter((r) => r.accountId === acc.id)
            .map((r) => formatDateKey(r.date))
        );

        if (!sourceFilter || sourceFilter === "INSIGHTS_VV" || sourceFilter === "ALL") {
          for (const [dateStr, views] of viewsByDate) {
            if (datesWithAnyRow.has(dateStr)) continue;
            if (sourceFilter && sourceFilter !== "ALL" && sourceFilter !== "INSIGHTS_VV") {
              continue;
            }
            pushAutoRow({
              account: acc,
              dateStr,
              views,
              revenue: 0,
              sourceType: "INSIGHTS_VV",
              idPrefix: "auto-vv",
            });
          }
        }
      }

      // Final client-side source filter (covers alias normalization on mixed rows).
      const filtered = sourceFilter
        ? allRecords.filter((r) => matchesRevenueSourceFilter(r.sourceType, sourceFilter))
        : allRecords;

      filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return serializeBigInt(filtered);
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

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      if (scope.isLead) {
        const accounts = await ctx.prisma.tiktokAccount.findMany({
          where: { id: { in: accountIds } },
          select: { assignedUserId: true },
        });
        const hasForbidden = accounts.some(
          (a) => !a.assignedUserId || !scope.memberUserIds.includes(a.assignedUserId)
        );
        if (hasForbidden) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Bạn chỉ có thể xóa doanh thu của tài khoản thuộc đội nhóm của mình.",
          });
        }
      }

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

  // 5. Update Single Revenue Record (LEAD / ADMIN)
  updateRecord: leadProcedure
    .input(
      z.object({
        id: z.string(),
        date: z.string().optional(),
        views: z.number().optional(),
        rpm: z.number().optional(),
        revenue: z.number().optional(),
        sourceType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.prisma.dailyRevenue.findUnique({
        where: { id: input.id },
      });
      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy bản ghi doanh thu." });
      }

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      if (scope.isLead) {
        const account = await ctx.prisma.tiktokAccount.findUnique({
          where: { id: record.accountId },
          select: { assignedUserId: true },
        });
        if (!account?.assignedUserId || !scope.memberUserIds.includes(account.assignedUserId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Bạn chỉ có thể chỉnh sửa doanh thu của tài khoản thuộc đội nhóm của mình.",
          });
        }
      }

      const updated = await ctx.prisma.dailyRevenue.update({
        where: { id: input.id },
        data: {
          date: input.date ? parseDateOnly(input.date) : undefined,
          views: input.views !== undefined ? BigInt(Math.round(input.views)) : undefined,
          rpm: input.rpm !== undefined ? input.rpm : undefined,
          revenue: input.revenue !== undefined ? input.revenue : undefined,
          sourceType: input.sourceType !== undefined ? input.sourceType : undefined,
        },
      });

      // Recalculate totals for affected account
      const remaining = await ctx.prisma.dailyRevenue.findMany({
        where: { accountId: record.accountId },
        select: { revenue: true },
      });
      const total = remaining.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
      await ctx.prisma.tiktokAccount.update({
        where: { id: record.accountId },
        data: { totalRevenue: total },
      });

      return serializeBigInt(updated);
    }),
});

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
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // Legacy days=0 (Toàn Bộ) → 365 (Studio daily data capped at 365 days)
      const rawDays = input?.days ?? 28;
      const days = rawDays === 0 ? 365 : rawDays;
      const startDate = input?.startDate;
      const endDate = input?.endDate;
      const isCustomRange = Boolean(startDate && endDate);

      const whereAccount: any = {};
      if (ctx.session.user.role === "STAFF") {
        whereAccount.assignedUserId = ctx.session.user.id;
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

      let pastDateStr = "";
      if (isCustomRange && startDate && endDate) {
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        end.setUTCHours(23, 59, 59, 999);
        whereDaily.date = { gte: start, lte: end };
      } else if (days > 0) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - days);
        whereDaily.date = { gte: pastDate };
        pastDateStr = pastDate.toISOString().split("T")[0];
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
          if (isCustomRange && startDate && endDate) {
            if (dateStr < startDate || dateStr > endDate) continue;
          } else if (days > 0 && pastDateStr) {
            if (dateStr < pastDateStr) continue;
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
          if (isCustomRange && startDate && endDate) {
            if (dateStr < startDate || dateStr > endDate) continue;
          } else if (days > 0 && pastDateStr) {
            if (dateStr < pastDateStr) continue;
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

      // Direct analytics period totals for matching preset days (7d, 28d, 60d, 365d, all)
      let analyticsPeriodRev = 0;
      let analyticsPeriodViews = 0;
      let hasAnalyticsPreset = false;

      if (!isCustomRange) {
        if (days === 7) {
          analyticsPeriodRev = accounts.reduce((s, a) => s + Number((a.analytics?.sumRevenue as any)?.revenue7d ?? (a.analytics as any)?.revenue7d ?? 0), 0);
          analyticsPeriodViews = accounts.reduce((s, a) => {
            const v = insightViewsContribution(
              a.analytics as any,
              0,
              (sum) => Number(sum?.views7d ?? (a.analytics as any)?.views7d ?? 0)
            );
            return s + (v ?? 0);
          }, 0);
          hasAnalyticsPreset = analyticsPeriodRev > 0 || analyticsPeriodViews > 0;
        } else if (days === 28) {
          analyticsPeriodRev = accounts.reduce((s, a) => s + Number((a.analytics?.sumRevenue as any)?.revenue28d ?? (a.analytics as any)?.revenue28d ?? 0), 0);
          analyticsPeriodViews = accounts.reduce((s, a) => {
            const v = insightViewsContribution(
              a.analytics as any,
              0,
              (sum) => Number(sum?.views28d ?? (a.analytics as any)?.views28d ?? 0)
            );
            return s + (v ?? 0);
          }, 0);
          hasAnalyticsPreset = analyticsPeriodRev > 0 || analyticsPeriodViews > 0;
        } else if (days === 60) {
          analyticsPeriodRev = accounts.reduce((s, a) => s + Number((a.analytics?.sumRevenue as any)?.revenue60d ?? (a.analytics as any)?.revenue60d ?? 0), 0);
          analyticsPeriodViews = accounts.reduce((s, a) => {
            const v = insightViewsContribution(
              a.analytics as any,
              0,
              (sum) => Number(sum?.views60d ?? (a.analytics as any)?.views60d ?? 0)
            );
            return s + (v ?? 0);
          }, 0);
          hasAnalyticsPreset = analyticsPeriodRev > 0 || analyticsPeriodViews > 0;
        } else if (days === 365) {
          analyticsPeriodRev = accounts.reduce((s, a) => s + Number((a.analytics?.sumRevenue as any)?.revenue365d ?? (a.analytics as any)?.revenue365d ?? 0), 0);
          analyticsPeriodViews = accounts.reduce((s, a) => {
            const v = insightViewsContribution(
              a.analytics as any,
              0,
              (sum) => Number(sum?.views365d ?? (a.analytics as any)?.views365d ?? 0)
            );
            return s + (v ?? 0);
          }, 0);
          hasAnalyticsPreset = analyticsPeriodRev > 0 || analyticsPeriodViews > 0;
        }
      }

      const totalRevenue = hasAnalyticsPreset
        ? Math.max(periodRevenue, analyticsPeriodRev)
        : periodRevenue;

      const totalViews = hasAnalyticsPreset
        ? Math.max(periodViews, analyticsPeriodViews)
        : periodViews;

      const totalRecords = dailyRecords.length + breakdownRecordsCount;

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

      const accounts = await ctx.prisma.tiktokAccount.findMany({
        where: {
          OR: usernames.map((u) => ({
            username: { equals: u, mode: "insensitive" as const },
          })),
          ...(isStaff ? { assignedUserId: ctx.session.user.id } : {}),
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

      const [records, accountsWithAnalytics] = await Promise.all([
        ctx.prisma.dailyRevenue.findMany({
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
        }),
        ctx.prisma.tiktokAccount.findMany({
          where: whereAccount,
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
        throw new Error("Không tìm thấy bản ghi doanh thu.");
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

import { router, protectedProcedure, leadProcedure, adminProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { calculateWorkdayScore, getCutoffTimeInfo, getScoringConfig, DEFAULT_SCORING_CONFIG, ScoringRuleConfig, getBusinessToday, finalizePendingChecklists, ensureDailyChecklistsForDate, getVnDateStr, getVideosOnDate } from "@/lib/scoring-engine";
import { reconcileTodayChecklistForUser } from "@/lib/checklist-reconcile";
import { backfillChecklistVideos } from "@/lib/checklist-video-backfill";
import { smartSearchMatch } from "@/utils/search";
import { resolveUserScope } from "@/lib/lead-scoping";

let lastCatchupCheckTime = 0;
const CATCHUP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes in-memory cooldown per server instance

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

export function deduplicateChecklistItems<
  T extends { accountId: string; isPosted?: boolean; isCompleted?: boolean; updatedAt?: any }
>(items: T[]): T[] {
  if (!Array.isArray(items)) return [];
  const map = new Map<string, T>();
  for (const item of items) {
    const existing = map.get(item.accountId);
    if (!existing) {
      map.set(item.accountId, item);
      continue;
    }
    const score = (i: T) => (i.isPosted ? 4 : 0) + (i.isCompleted ? 2 : 0);
    const existingScore = score(existing);
    const itemScore = score(item);
    if (itemScore > existingScore) {
      map.set(item.accountId, item);
    } else if (itemScore === existingScore) {
      const existingTime = new Date(existing.updatedAt || 0).getTime();
      const itemTime = new Date(item.updatedAt || 0).getTime();
      if (itemTime > existingTime) {
        map.set(item.accountId, item);
      }
    }
  }
  return Array.from(map.values());
}

export const checklistRouter = router({
  // 1. Get or initialize today's checklist for current operator (or specified user for lead/admin)
  getToday: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Background catch-up with short-circuit & 5-minute in-memory cooldown
      const nowMs = Date.now();
      if (nowMs - lastCatchupCheckTime > CATCHUP_COOLDOWN_MS) {
        lastCatchupCheckTime = nowMs;
        const { todayDateOnly, sevenDaysAgoDateOnly, currentVnHour, currentVnMinute } = getBusinessToday();
        try {
          const scoringConfig = await getScoringConfig(ctx.prisma);
          const isPastCutoff =
            currentVnHour > scoringConfig.cutOffHour ||
            (currentVnHour === scoringConfig.cutOffHour &&
              currentVnMinute >= scoringConfig.cutOffMinute);

          const dateFilter: any = { gte: sevenDaysAgoDateOnly };
          if (isPastCutoff) {
            dateFilter.lte = todayDateOnly;
          } else {
            dateFilter.lt = todayDateOnly;
          }

          const hasUnfinalized = await ctx.prisma.dailyChecklist.findFirst({
            where: {
              isLocked: false,
              date: dateFilter,
            },
            select: { id: true },
          });
          if (hasUnfinalized) {
            void finalizePendingChecklists(ctx.prisma, { includeToday: isPastCutoff }).catch((err) => {
              console.warn("[ChecklistRouter] Auto catch-up error:", err);
            });
          }
        } catch {
          /* ignore */
        }
      }

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      let targetUserId = ctx.session.user.id;
      if (scope.isAdmin && input?.userId) {
        targetUserId = input.userId;
      } else if (scope.isLead && input?.userId) {
        if (!scope.memberUserIds.includes(input.userId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Bạn chỉ có thể xem checklist của thành viên trong đội nhóm của mình.",
          });
        }
        targetUserId = input.userId;
      }

      const { todayDateOnly: today } = getBusinessToday();

      let checklist: any = await ctx.prisma.dailyChecklist.findUnique({
        where: {
          userId_date: {
            userId: targetUserId,
            date: today,
          },
        },
        include: {
          items: {
            include: {
              account: {
                select: {
                  id: true,
                  username: true,
                  country: true,
                  gpmProfileId: true,
                  gpmProfileName: true,
                  groupName: true,
                  isOnline: true,
                  syncStatus: true,
                  status: true,
                  bannedReason: true,
                  metadata: true,
                  totalViews: true,
                  totalRevenue: true,
                  totalVideos: true,
                  lastSyncedAt: true,
                  alerts: {
                    where: { status: "OPEN" },
                    select: { id: true, alertType: true, description: true, severity: true },
                  },
                },
              },
              _count: {
                select: { notesList: true },
              },
            },
            orderBy: { updatedAt: "asc" },
          },
        },
      });

      const scoringConfig = await getScoringConfig(ctx.prisma);
      const shouldExcludeBanned = scoringConfig.excludeBannedAccounts !== false;

      // If no checklist exists for today, automatically generate one based on assigned accounts
      if (!checklist) {
        const allowedStatuses = shouldExcludeBanned
          ? ["ACTIVE", "WARMING", "RESTRICTED"]
          : ["ACTIVE", "WARMING", "RESTRICTED", "BANNED"];

        const assignedAccounts = await ctx.prisma.tiktokAccount.findMany({
          where: {
            assignedUserId: targetUserId,
            status: { in: allowedStatuses as any },
            deletedAt: null,
            archivedAt: null,
          },
        });

        const uniqueAssigned = Array.from(
          new Map(assignedAccounts.map((a: any) => [a.id, a])).values()
        );

        const checklistInclude: any = {
          items: {
            include: {
              account: {
                select: {
                  id: true,
                  username: true,
                  country: true,
                  gpmProfileId: true,
                  gpmProfileName: true,
                  groupName: true,
                  isOnline: true,
                  syncStatus: true,
                  status: true,
                  bannedReason: true,
                  metadata: true,
                  totalViews: true,
                  totalRevenue: true,
                  totalVideos: true,
                  lastSyncedAt: true,
                  alerts: {
                    where: { status: "OPEN" as const },
                    select: { id: true, alertType: true, description: true, severity: true },
                  },
                },
              },
              _count: {
                select: { notesList: true },
              },
            },
          },
        };

        try {
          checklist = await ctx.prisma.dailyChecklist.create({
            data: {
              userId: targetUserId,
              date: today,
              totalAssigned: uniqueAssigned.length,
              completedCount: 0,
              completionRate: 0,
              workdayScore: 0,
              items: {
                create: uniqueAssigned.map((acc: any) => ({
                  accountId: acc.id,
                  isPosted: false,
                  isSynced: !!acc.lastSyncedAt,
                  isCompleted: false,
                })),
              },
            },
            include: checklistInclude,
          });
        } catch (err: any) {
          if (err?.code === "P2002") {
            checklist = await ctx.prisma.dailyChecklist.findUnique({
              where: {
                userId_date: {
                  userId: targetUserId,
                  date: today,
                },
              },
              include: checklistInclude,
            });
          } else {
            throw err;
          }
        }
      } else {
        if (!checklist.isLocked) {
          await reconcileTodayChecklistForUser(ctx.prisma, targetUserId);
          const reloaded = await ctx.prisma.dailyChecklist.findUnique({
            where: {
              userId_date: {
                userId: targetUserId,
                date: today,
              },
            },
            include: {
              items: {
                include: {
                  account: {
                    select: {
                      id: true,
                      username: true,
                      country: true,
                      gpmProfileId: true,
                      gpmProfileName: true,
                      groupName: true,
                      isOnline: true,
                      syncStatus: true,
                      status: true,
                      bannedReason: true,
                      metadata: true,
                      totalViews: true,
                      totalRevenue: true,
                      totalVideos: true,
                      lastSyncedAt: true,
                      alerts: {
                        where: { status: "OPEN" },
                        select: { id: true, alertType: true, description: true, severity: true },
                      },
                    },
                  },
                  _count: {
                    select: { notesList: true },
                  },
                },
                orderBy: { updatedAt: "asc" },
              },
            },
          });
          if (reloaded) checklist = reloaded;
        }

        // Exclude accounts that became BANNED within the day if configured, otherwise count them in totalAssigned
        const eligibleItems = shouldExcludeBanned
          ? checklist.items.filter((i: any) => i.account?.status !== "BANNED")
          : checklist.items;
        const totalAssigned = eligibleItems.length;
        const completedCount = eligibleItems.filter((i: any) => i.isCompleted || i.isPosted).length;
        const { completionRate, workdayScore } = calculateWorkdayScore(totalAssigned, completedCount, scoringConfig);

        if (
          checklist.totalAssigned !== totalAssigned ||
          checklist.completedCount !== completedCount ||
          Number(checklist.workdayScore) !== workdayScore
        ) {
          checklist = await ctx.prisma.dailyChecklist.update({
            where: { id: checklist.id },
            data: {
              totalAssigned,
              completedCount,
              completionRate,
              workdayScore,
            },
            include: {
              items: {
                include: {
                  account: {
                    select: {
                      id: true,
                      username: true,
                      country: true,
                      gpmProfileId: true,
                      gpmProfileName: true,
                      groupName: true,
                      isOnline: true,
                      syncStatus: true,
                      status: true,
                      bannedReason: true,
                      metadata: true,
                      totalViews: true,
                      totalRevenue: true,
                      totalVideos: true,
                      lastSyncedAt: true,
                      alerts: {
                        where: { status: "OPEN" },
                        select: { id: true, alertType: true, description: true, severity: true },
                      },
                    },
                  },
                  _count: {
                    select: { notesList: true },
                  },
                },
                orderBy: { updatedAt: "asc" },
              },
            },
          });
        }
      }

      if (checklist && Array.isArray((checklist as any).items)) {
        (checklist as any).items = deduplicateChecklistItems((checklist as any).items);
      }

      return serializeBigInt(checklist);
    }),


  // 2. One-time 7-day backfill: creates missing DailyChecklist rows for the last 7 days
  // and backfills video records from rawSnapshot.videosList into DailyChecklistItems.
  // Called once per browser session (guarded by sessionStorage on the client) so that
  // Calendar / Range views have data without the read query doing write side-effects.
  ensureBackfill: protectedProcedure.mutation(async ({ ctx }) => {
    const { todayDateOnly, todayStr } = getBusinessToday();
    let totalCreated = 0;

    // Phase 1: Ensure DailyChecklists and items exist for all 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(todayDateOnly.getTime() - i * 24 * 60 * 60 * 1000);
      try {
        const result = await ensureDailyChecklistsForDate(ctx.prisma, date);
        totalCreated += result.createdCount;
      } catch (err) {
        // Non-fatal: log and continue so one bad date doesn't block the rest
        console.warn(`[ensureBackfill] Error for day -${i}:`, err);
      }
    }

    // Phase 2: Backfill videos from rawSnapshot across the 7-day window (including today)
    try {
      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      const targetUserFilter = scope.isStaff
        ? { assignedUserId: ctx.session.user.id }
        : { assignedUserId: { not: null } };

      const accounts = await ctx.prisma.tiktokAccount.findMany({
        where: {
          ...targetUserFilter,
          deletedAt: null,
        },
        select: {
          id: true,
          analytics: {
            select: { rawSnapshot: true },
          },
        },
      });

      for (const acc of accounts) {
        const rawSnap = (acc.analytics as any)?.rawSnapshot;
        const videosList = Array.isArray(rawSnap?.videosList) ? rawSnap.videosList : [];
        if (videosList.length > 0) {
          await backfillChecklistVideos(ctx.prisma, acc.id, videosList, todayStr, 7, { includeToday: true });
        }
      }
    } catch (backfillErr) {
      console.warn("[ensureBackfill] Error backfilling videos:", backfillErr);
    }

    return { ok: true, createdCount: totalCreated };
  }),

  // 3. Comprehensive Roll Call & Timesheet View (Single Date or Date Range for Staffs)
  getByDate: protectedProcedure
    .input(
      z
        .object({
          date: z.string().optional(), // YYYY-MM-DD
          startDate: z.string().optional(), // YYYY-MM-DD
          endDate: z.string().optional(), // YYYY-MM-DD
          userId: z.string().optional(), // "ALL" or specific user
          teamId: z.string().optional(), // "ALL" or specific team
          search: z.string().optional(),
          scoreFilter: z.enum(["ALL", "FULL", "HALF", "ZERO"]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const isRangeMode = !!(input?.startDate && input?.endDate);
      const todayDateStr = new Date().toISOString().split("T")[0];
      const targetDateStr = input?.date || todayDateStr;

      // 1. Ensure checklists exist for all active staff for the requested date (only when single day mode
      //    AND the date is within the recent 7-day backfill window).
      //    Arbitrary historical dates selected via the custom date-picker should never trigger
      //    auto-creation — we only read whatever already exists in the DB for those dates.
      if (!isRangeMode) {
        const dateObj = parseDateOnly(targetDateStr);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        sevenDaysAgo.setUTCHours(0, 0, 0, 0);
        const isWithinBackfillWindow = dateObj >= sevenDaysAgo;
        if (isWithinBackfillWindow) {
          await ensureDailyChecklistsForDate(ctx.prisma, dateObj);
        }
      }

      // 2. Build Prisma Where Clause
      const whereClause: any = {};

      if (isRangeMode) {
        const startObj = parseDateOnly(input!.startDate!);
        const endObj = parseDateOnly(input!.endDate!);
        whereClause.date = { gte: startObj, lte: endObj };
      } else {
        whereClause.date = parseDateOnly(targetDateStr);
      }

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      if (scope.isStaff) {
        whereClause.userId = ctx.session.user.id;
      } else if (scope.isLead) {
        if (input?.userId && input.userId !== "ALL") {
          if (scope.memberUserIds.includes(input.userId)) {
            whereClause.userId = input.userId;
          } else {
            whereClause.userId = { in: scope.memberUserIds };
          }
        } else {
          whereClause.userId = { in: scope.memberUserIds };
        }
      } else if (input?.userId && input.userId !== "ALL") {
        whereClause.userId = input.userId;
      }

      if (input?.teamId && input.teamId !== "ALL") {
        whereClause.user = { teamId: input.teamId };
      }

      if (input?.scoreFilter && input.scoreFilter !== "ALL") {
        if (input.scoreFilter === "FULL") whereClause.workdayScore = 1.0;
        else if (input.scoreFilter === "HALF") whereClause.workdayScore = 0.5;
        else if (input.scoreFilter === "ZERO") whereClause.workdayScore = 0.0;
      }

      // 3. Query Checklists
      const checklists = await ctx.prisma.dailyChecklist.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              avatar: true,
              teamId: true,
              team: { select: { id: true, name: true, color: true } },
            },
          },
          items: {
            include: {
              account: {
                select: {
                  id: true,
                  username: true,
                  country: true,
                  status: true,
                  gpmProfileId: true,
                  gpmProfileName: true,
                  groupName: true,
                  isOnline: true,
                  syncStatus: true,
                  bannedReason: true,
                  metadata: true,
                  totalViews: true,
                  totalRevenue: true,
                  totalVideos: true,
                  lastSyncedAt: true,
                  alerts: {
                    where: { status: "OPEN" },
                    select: { id: true, alertType: true, description: true, severity: true },
                  },
                },
              },
              _count: {
                select: { notesList: true },
              },
            },
            orderBy: { updatedAt: "asc" },
          },
        },
        orderBy: isRangeMode ? [{ date: "desc" }, { createdAt: "asc" }] : [{ createdAt: "asc" }],
      });

      const scoringConfig = await getScoringConfig(ctx.prisma);
      const shouldExcludeBanned = scoringConfig.excludeBannedAccounts !== false;

      // Filter by search query if provided & re-evaluate scores according to scoring rule config
      let formattedChecklists = checklists.map((c) => {
        const fullName =
          [c.user.firstName, c.user.lastName].filter(Boolean).join(" ") ||
          c.user.name ||
          c.user.username ||
          c.user.email;

        const uniqueItems = deduplicateChecklistItems(c.items);
        let totalAssigned = c.totalAssigned;
        let completedCount = c.completedCount;
        let completionRate = Number(c.completionRate || 0);
        let workdayScore = Number(c.workdayScore || 0);

        if (!c.isLocked) {
          const eligibleItems = shouldExcludeBanned
            ? uniqueItems.filter((item: any) => item.account?.status !== "BANNED")
            : uniqueItems;
          totalAssigned = eligibleItems.length;
          completedCount = eligibleItems.filter((item: any) => item.isCompleted || item.isPosted).length;
          const scoreResult = calculateWorkdayScore(totalAssigned, completedCount, scoringConfig);
          completionRate = scoreResult.completionRate;
          workdayScore = scoreResult.workdayScore;
        }

        return {
          ...c,
          items: uniqueItems,
          totalAssigned,
          completedCount,
          completionRate,
          workdayScore,
          user: {
            ...c.user,
            fullName,
          },
        };
      });

      if (input?.search) {
        formattedChecklists = formattedChecklists.filter((c) =>
          smartSearchMatch(
            input.search,
            c.user.fullName,
            c.user.username,
            c.user.email,
            c.user.name,
            c.user.role,
            ...c.items.flatMap((item: any) => [
              item.account?.username,
              item.account?.gpmProfileName,
              item.account?.groupName,
              item.account?.country,
            ])
          )
        );
      }

      // 4. Compute High-Level Organization KPIs for the filtered view
      const totalStaff = new Set(formattedChecklists.map((c) => c.userId)).size;
      const fullWorkdayCount = formattedChecklists.filter((c) => Number(c.workdayScore) >= 1.0).length;
      const halfWorkdayCount = formattedChecklists.filter((c) => Number(c.workdayScore) === 0.5).length;
      const zeroWorkdayCount = formattedChecklists.filter((c) => Number(c.workdayScore) === 0).length;

      let totalAssignedAccounts = 0;
      let totalVideosPosted = 0;
      let totalSynced = 0;

      for (const c of formattedChecklists) {
        const eligibleItems = shouldExcludeBanned
          ? c.items.filter((item: any) => item.account?.status !== "BANNED")
          : c.items;
        totalAssignedAccounts += eligibleItems.length;
        for (const item of eligibleItems) {
          if (item.isPosted) totalVideosPosted++;
          if (item.isSynced) totalSynced++;
        }
      }

      const totalPossibleCompletion = formattedChecklists.reduce(
        (sum, c) => sum + Number(c.completionRate || 0),
        0
      );
      const avgCompletionRate =
        formattedChecklists.length > 0
          ? Math.round((totalPossibleCompletion / formattedChecklists.length) * 10) / 10
          : 0;
      const cutoffInfo = getCutoffTimeInfo(scoringConfig);

      return serializeBigInt({
        isRangeMode,
        date: targetDateStr,
        startDate: input?.startDate,
        endDate: input?.endDate,
        cutoffInfo,
        scoringConfig,
        summary: {
          totalRecords: formattedChecklists.length,
          totalStaff,
          fullWorkdayCount,
          halfWorkdayCount,
          zeroWorkdayCount,
          avgCompletionRate,
          totalAssignedAccounts,
          totalVideosPosted,
          totalSynced,
        },
        checklists: formattedChecklists,
      });
    }),

  // 3. Mass Complete All Items for a checklist (or all staff on a specific date)
  massCompleteAll: protectedProcedure
    .input(
      z
        .object({
          checklistId: z.string().optional(),
          date: z.string().optional(), // YYYY-MM-DD
          scoreOverride: z.number().min(0).max(1).optional(), // e.g. 0.5 for half day
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const todayDateStr = new Date().toISOString().split("T")[0];
      const targetDateObj = parseDateOnly(input?.date || todayDateStr);

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);

      if (input?.checklistId) {
        const targetChk = await ctx.prisma.dailyChecklist.findUnique({
          where: { id: input.checklistId },
          select: { userId: true },
        });
        if (scope.isStaff && targetChk?.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not permitted to modify this checklist" });
        }
        if (scope.isLead && (!targetChk?.userId || !scope.memberUserIds.includes(targetChk.userId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn chỉ có thể hoàn thành checklist của thành viên trong đội nhóm của mình." });
        }

        const score = input?.scoreOverride ?? 1.0;

        await ctx.prisma.dailyChecklistItem.updateMany({
          where: { checklistId: input.checklistId },
          data: {
            isPosted: true,
            isSynced: true,
            isCompleted: true,
          },
        });

        const allItems = await ctx.prisma.dailyChecklistItem.findMany({
          where: { checklistId: input.checklistId },
        });

        const totalAssigned = allItems.length;

        return await ctx.prisma.dailyChecklist.update({
          where: { id: input.checklistId },
          data: {
            totalAssigned,
            completedCount: totalAssigned,
            completionRate: score * 100,
            workdayScore: score,
          },
          include: {
            items: {
              include: { account: true },
            },
          },
        });
      }

      // Mass complete all active checklists for the date
      const whereClause: any = { date: targetDateObj };
      if (scope.isStaff) {
        whereClause.userId = ctx.session.user.id;
      } else if (scope.isLead) {
        whereClause.userId = { in: scope.memberUserIds };
      }

      const allChecklists = await ctx.prisma.dailyChecklist.findMany({
        where: whereClause,
      });

      if (allChecklists.length > 0) {
        const checklistIds = allChecklists.map((c) => c.id);

        await ctx.prisma.dailyChecklistItem.updateMany({
          where: { checklistId: { in: checklistIds } },
          data: {
            isPosted: true,
            isSynced: true,
            isCompleted: true,
          },
        });

        const counts = await ctx.prisma.dailyChecklistItem.groupBy({
          by: ["checklistId"],
          _count: { id: true },
          where: { checklistId: { in: checklistIds } },
        });
        const countMap = new Map(counts.map((c) => [c.checklistId, c._count.id]));

        await Promise.all(
          allChecklists.map((chk) => {
            const count = countMap.get(chk.id) ?? chk.totalAssigned;
            return ctx.prisma.dailyChecklist.update({
              where: { id: chk.id },
              data: {
                totalAssigned: count,
                completedCount: count,
                completionRate: 100,
                workdayScore: 1.0,
              },
            });
          })
        );
      }

      return { count: allChecklists.length };
    }),

  // 4. Toggle Item Status (posted / synced / completed) & Recalculate Score
  toggleItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        field: z.enum(["isPosted", "isSynced", "isCompleted"]),
        value: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.dailyChecklistItem.findUnique({
        where: { id: input.itemId },
        include: { checklist: true },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Checklist item not found",
        });
      }

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      if (
        scope.isStaff &&
        item.checklist.userId !== ctx.session.user.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not permitted to modify this checklist",
        });
      }
      if (scope.isLead && !scope.memberUserIds.includes(item.checklist.userId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn chỉ có thể sửa checklist của thành viên trong đội nhóm của mình.",
        });
      }

      if (item.checklist.isLocked && ctx.session.user.role === "STAFF") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Checklist is locked for the day and cannot be changed.",
        });
      }

      // Update the specific flag
      const updatedFields: any = { [input.field]: input.value };
      if (input.field === "isPosted" && input.value && item.isSynced) {
        updatedFields.isCompleted = true;
      } else if (input.field === "isSynced" && input.value && item.isPosted) {
        updatedFields.isCompleted = true;
      }

      await ctx.prisma.dailyChecklistItem.update({
        where: { id: input.itemId },
        data: updatedFields,
      });

      // Recalculate checklist counts and workday score using rule engine
      const allItems = await ctx.prisma.dailyChecklistItem.findMany({
        where: { checklistId: item.checklistId },
        include: { account: true },
      });

      const scoringConfig = await getScoringConfig(ctx.prisma);
      const shouldExcludeBanned = scoringConfig.excludeBannedAccounts !== false;

      const eligibleItems = shouldExcludeBanned
        ? allItems.filter((i: any) => i.account?.status !== "BANNED")
        : allItems;
      const totalAssigned = eligibleItems.length;
      const completedCount = eligibleItems.filter((i: any) => i.isCompleted || i.isPosted).length;
      const { completionRate, workdayScore } = calculateWorkdayScore(totalAssigned, completedCount, scoringConfig);

      const updatedChecklist = await ctx.prisma.dailyChecklist.update({
        where: { id: item.checklistId },
        data: {
          totalAssigned,
          completedCount,
          completionRate,
          workdayScore,
        },
        include: {
          items: {
            include: {
              account: true,
            },
          },
        },
      });

      return serializeBigInt(updatedChecklist);
    }),

  // 5. Update Notes / Video Details on Item
  updateNotes: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.dailyChecklistItem.findUnique({
        where: { id: input.itemId },
        include: { checklist: true },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Checklist item not found",
        });
      }

      // Permission check: ADMIN, LEAD (within their team), or the owner of the checklist
      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      const isOwner = item.checklist.userId === ctx.session.user.id;

      if (scope.isStaff && !isOwner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn không có quyền chỉnh sửa ghi chú của nhân sự khác.",
        });
      }
      if (scope.isLead && !scope.memberUserIds.includes(item.checklist.userId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn chỉ có thể chỉnh sửa ghi chú của thành viên trong đội nhóm của mình.",
        });
      }

      const updated = await ctx.prisma.dailyChecklistItem.update({
        where: { id: input.itemId },
        data: { notes: input.notes },
        include: { account: true },
      });

      return updated;
    }),

  // 5b. Get Note Thread for a Checklist Item
  getItemNotes: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.prisma.dailyChecklistItem.findUnique({
        where: { id: input.itemId },
        include: {
          checklist: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  fullName: true,
                  avatar: true,
                  role: true,
                },
              },
            },
          },
          account: {
            select: {
              id: true,
              username: true,
              country: true,
            },
          },
          notesList: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  fullName: true,
                  avatar: true,
                  role: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Checklist item không tồn tại",
        });
      }

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      const isOwner = item.checklist.userId === ctx.session.user.id;
      const isLeadOfOwner = scope.isLead && scope.memberUserIds.includes(item.checklist.userId);
      const canPost = scope.isAdmin || isLeadOfOwner || isOwner;

      // Handle legacy single-string note if notesList is empty
      let messages = item.notesList;
      if (messages.length === 0 && item.notes && item.notes.trim()) {
        messages = [
          {
            id: `legacy-${item.id}`,
            itemId: item.id,
            userId: item.checklist.userId,
            content: item.notes,
            createdAt: item.checklist.date || new Date(),
            user: item.checklist.user,
          } as any,
        ];
      }

      return {
        item: {
          id: item.id,
          notes: item.notes,
          account: item.account,
          operator: item.checklist.user,
          date: item.checklist.date,
        },
        messages,
        canPost,
      };
    }),

  // 5c. Post a Message to Checklist Item Note Thread
  addNoteMessage: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        content: z.string().min(1, "Nội dung ghi chú không được để trống"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.dailyChecklistItem.findUnique({
        where: { id: input.itemId },
        include: {
          checklist: true,
          notesList: true,
        },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Checklist item không tồn tại",
        });
      }

      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      const isOwner = item.checklist.userId === ctx.session.user.id;
      const isLeadOfOwner = scope.isLead && scope.memberUserIds.includes(item.checklist.userId);
      const canPost = scope.isAdmin || isLeadOfOwner || isOwner;

      if (!canPost) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn không có quyền gửi tin nhắn / ghi chú vào mục này.",
        });
      }

      // If this is the first message and there was an existing legacy note,
      // preserve the legacy note as the first thread message
      if (item.notesList.length === 0 && item.notes && item.notes.trim()) {
        await ctx.prisma.dailyChecklistItemNote.create({
          data: {
            itemId: input.itemId,
            userId: item.checklist.userId,
            content: item.notes.trim(),
            createdAt: item.checklist.date || new Date(),
          },
        });
      }

      const newNote = await ctx.prisma.dailyChecklistItemNote.create({
        data: {
          itemId: input.itemId,
          userId: ctx.session.user.id,
          content: input.content.trim(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              fullName: true,
              avatar: true,
              role: true,
            },
          },
        },
      });

      // Update item.notes to reflect latest note in list views
      await ctx.prisma.dailyChecklistItem.update({
        where: { id: input.itemId },
        data: { notes: input.content.trim() },
      });

      return newNote;
    }),

  // 6. Auto-Scan & Check Attendance across ALL Staffs / Accounts (or specific user)
  autoScanAndCheck: protectedProcedure
    .input(
      z
        .object({
          // Scan a single date (YYYY-MM-DD). Clamped to 7-day window server-side.
          date: z.string().optional(),
          // Scan a date range. Both required together. Clamped to [today-6, today].
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          // Per-row menu: scan a specific checklist only (bypasses date selector).
          checklistId: z.string().optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
      const scoringConfig = await getScoringConfig(ctx.prisma);
      const shouldExcludeBanned = scoringConfig.excludeBannedAccounts !== false;

      // ── Resolve the scan window ──────────────────────────────────────────────
      // Window ceiling: today (VN) down to today-6 (7 days inclusive).
      // All date arithmetic uses UTC midnight of the VN calendar date so it
      // stays in sync with how DailyChecklist.date is stored.
      const { todayDateOnly, todayStr } = getBusinessToday();
      const DAY_MS = 86_400_000;
      const sixDaysAgoDateOnly = new Date(todayDateOnly.getTime() - 6 * DAY_MS);

      let scanDates: Date[]; // UTC-midnight dates to scan
      let targetChecklist: { id: string; date: Date; userId: string } | null = null;

      if (input?.checklistId) {
        // ── checklistId path: scan exactly the date of that checklist ──────────
        // Security: verify caller is allowed to touch this checklist.
        targetChecklist = await ctx.prisma.dailyChecklist.findUnique({
          where: { id: input.checklistId },
          select: { id: true, date: true, userId: true },
        });
        if (!targetChecklist) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy bảng công." });
        }
        if (
          scope.isStaff && targetChecklist.userId !== ctx.session.user.id ||
          scope.isLead && !scope.memberUserIds.includes(targetChecklist.userId)
        ) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền đối soát bảng công này." });
        }
        scanDates = [new Date(targetChecklist.date)];
      } else {
        // ── Batch path: resolve date(s) from input, clamp to [today-6, today] ──
        if (input?.date) {
          const d = parseDateOnly(input.date);
          if (d < sixDaysAgoDateOnly || d > todayDateOnly) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Chỉ có thể đối soát trong 7 ngày gần nhất (hôm nay đến 6 ngày trước).",
            });
          }
          scanDates = [d];
        } else if (input?.startDate && input?.endDate) {
          let s = parseDateOnly(input.startDate);
          let e = parseDateOnly(input.endDate);
          if (s > e) throw new TRPCError({ code: "BAD_REQUEST", message: "startDate phải ≤ endDate." });
          // Clamp range
          if (s < sixDaysAgoDateOnly) s = sixDaysAgoDateOnly;
          if (e > todayDateOnly) e = todayDateOnly;
          if (s > e) throw new TRPCError({ code: "BAD_REQUEST", message: "Khoảng ngày nằm ngoài 7 ngày gần nhất." });
          scanDates = [];
          for (let cur = new Date(s); cur <= e; cur = new Date(cur.getTime() + DAY_MS)) {
            scanDates.push(new Date(cur));
          }
        } else {
          // Default: today only
          scanDates = [todayDateOnly];
        }
      }

      // ── Step 1: Ensure checklists + items exist for every date in range ──────
      // Creates missing DailyChecklist and DailyChecklistItem rows so we never
      // skip a user/account just because the cron hasn't run yet for that day.
      let totalCreatedChecklists = 0;
      for (const d of scanDates) {
        try {
          const { createdCount } = await ensureDailyChecklistsForDate(ctx.prisma, d);
          totalCreatedChecklists += createdCount;
        } catch (err) {
          console.warn("[autoScanAndCheck] ensureDailyChecklistsForDate error:", err);
        }
      }

      // ── Step 2: Batch-load all accounts in scope + their rawSnapshot ─────────
      // One query for all accounts; rawSnapshot contains the rolling video list.
      const accountWhereClause: any = { deletedAt: null };
      if (scope.isStaff) {
        accountWhereClause.assignedUserId = ctx.session.user.id;
      } else if (scope.isLead) {
        accountWhereClause.assignedUserId = { in: scope.memberUserIds };
      }
      // checklistId path: narrow to just that checklist's user
      if (input?.checklistId && targetChecklist) {
        accountWhereClause.assignedUserId = targetChecklist.userId;
      }

      const allAccounts = await ctx.prisma.tiktokAccount.findMany({
        where: accountWhereClause,
        select: {
          id: true,
          lastSyncedAt: true,
          status: true,
          analytics: { select: { rawSnapshot: true } },
        },
      });

      // ── Step 3: Group raw videos by (accountId → vnDateStr → videos[]) in RAM ─
      // This avoids per-item queries to analytics; all grouping is done in JS.
      const videosByAccountAndDate = new Map<string, Map<string, any[]>>();
      let totalVideosFound = 0;

      for (const account of allAccounts) {
        const rawSnap = (account.analytics as any)?.rawSnapshot;
        const rawVideosList: any[] = Array.isArray(rawSnap?.videosList) ? rawSnap.videosList : [];
        if (rawVideosList.length === 0) continue;

        const byDate = new Map<string, any[]>();
        for (const v of rawVideosList) {
          const vnDate = (() => {
            const raw = v.postDate ?? v.createTime ?? v.uploadTime ?? v.publishTime ?? v.timestamp;
            if (raw == null) return null;
            let d: Date;
            if (typeof raw === "number") d = new Date(raw > 1e10 ? raw : raw * 1000);
            else d = new Date(raw as string);
            if (isNaN(d.getTime())) return null;
            return getVnDateStr(d);
          })();
          if (!vnDate) continue;
          if (!byDate.has(vnDate)) byDate.set(vnDate, []);
          byDate.get(vnDate)!.push(v);
        }
        if (byDate.size > 0) videosByAccountAndDate.set(account.id, byDate);
      }

      // ── Step 4: Fetch all relevant checklist items for all scan dates ─────────
      const scanDateList = scanDates;
      const checklistWhereClause: any = { date: { in: scanDateList } };
      if (scope.isStaff) checklistWhereClause.userId = ctx.session.user.id;
      else if (scope.isLead) checklistWhereClause.userId = { in: scope.memberUserIds };
      if (input?.checklistId) checklistWhereClause.id = input.checklistId;

      const targetChecklists = await ctx.prisma.dailyChecklist.findMany({
        where: checklistWhereClause,
        include: {
          user: { select: { id: true, username: true, name: true } },
          items: {
            include: { account: { select: { id: true, status: true, lastSyncedAt: true, deletedAt: true } } },
          },
        },
      });

      // ── Step 5: Process each checklist × item — all updates in bulk ───────────
      let totalStaffScanned = 0;
      let totalAccountsScanned = 0;
      let totalPostedCount = 0;
      let checklistsUpdated = 0;
      const accountsWithVideos = new Set<string>();

      for (const checklist of targetChecklists) {
        totalStaffScanned++;
        const checklistVnDateStr = getVnDateStr(new Date(checklist.date));
        const checklistDateOnly = new Date(checklist.date); // already UTC midnight

        let anyItemChanged = false;

        const itemUpdates: Array<Promise<any>> = [];

        const deduplicatedItems = deduplicateChecklistItems(checklist.items);
        for (const item of deduplicatedItems) {
          totalAccountsScanned++;

          // Skip deleted accounts
          if (item.account?.deletedAt) continue;

          // Look up videos for this account on this checklist's date
          const byDate = videosByAccountAndDate.get(item.account.id);
          const videosOnDate: any[] = byDate?.get(checklistVnDateStr) ?? [];
          const hasRawVideoOnDate = videosOnDate.length > 0;

          if (hasRawVideoOnDate) {
            accountsWithVideos.add(item.account.id);
            totalVideosFound += videosOnDate.length;
          }

          // Determine posted status: existing OR newly found in rawSnapshot
          const hasExistingSnapshot =
            Array.isArray(item.videosSnapshot) && (item.videosSnapshot as any[]).length > 0;

          const isSyncedOnDate = Boolean(
            item.account.lastSyncedAt && new Date(item.account.lastSyncedAt) >= checklistDateOnly
          );

          const newIsPosted = item.isPosted || hasRawVideoOnDate;
          const newIsSynced = item.isSynced || isSyncedOnDate;
          const newIsCompleted = newIsPosted || (item.isCompleted);

          if (newIsPosted) totalPostedCount++;

          // Only write to DB if something actually changed
          const changed =
            newIsPosted !== item.isPosted ||
            newIsSynced !== item.isSynced ||
            newIsCompleted !== item.isCompleted ||
            (hasRawVideoOnDate && !hasExistingSnapshot);

          if (changed) {
            anyItemChanged = true;
            itemUpdates.push(
              ctx.prisma.dailyChecklistItem.update({
                where: { id: item.id },
                data: {
                  isPosted: newIsPosted,
                  isSynced: newIsSynced,
                  isCompleted: newIsCompleted,
                  // Persist discovered videos so finalize cron picks them up
                  ...(hasRawVideoOnDate && !hasExistingSnapshot
                    ? { videosSnapshot: videosOnDate, videoSource: "live", videoSyncedAt: new Date() }
                    : {}),
                },
              })
            );
          }
        }

        // Flush all item updates for this checklist
        if (itemUpdates.length > 0) {
          await Promise.all(itemUpdates);
        }

        // ── Recalculate workday score ──────────────────────────────────────────
        // Always recalc (not just when items changed) — ensures score is consistent
        // even if the checklist was created fresh by ensureDailyChecklistsForDate.
        const freshItems = await ctx.prisma.dailyChecklistItem.findMany({
          where: { checklistId: checklist.id },
          include: { account: { select: { status: true, deletedAt: true } } },
        });

        const uniqueFreshItems = deduplicateChecklistItems(freshItems);
        const eligibleItems = uniqueFreshItems.filter((i: any) => {
          if (!i.account || i.account.deletedAt) return false;
          if (shouldExcludeBanned && i.account.status === "BANNED") return false;
          return true;
        });

        const totalAssigned = eligibleItems.length;
        const completedCount = eligibleItems.filter(
          (i: any) => i.isCompleted || i.isPosted
        ).length;
        const { completionRate, workdayScore } = calculateWorkdayScore(
          totalAssigned,
          completedCount,
          scoringConfig
        );

        await ctx.prisma.dailyChecklist.update({
          where: { id: checklist.id },
          data: { totalAssigned, completedCount, completionRate, workdayScore },
        });

        if (anyItemChanged) checklistsUpdated++;
      }

      const rangeStart = scanDates[0].toISOString().slice(0, 10);
      const rangeEnd = scanDates[scanDates.length - 1].toISOString().slice(0, 10);

      return {
        // Legacy fields (keep for backward compat with old toast)
        totalStaffScanned,
        totalAccountsScanned,
        scannedCount: totalAccountsScanned,
        postedCount: totalPostedCount,
        syncedCount: 0,
        // New rich fields for updated toast
        datesProcessed: scanDates.length,
        rangeStart,
        rangeEnd,
        accountsWithVideos: accountsWithVideos.size,
        totalVideosFound,
        checklistsUpdated,
        totalCreatedChecklists,
      };
    }),

  // 7. Lock Checklist (LEAD / ADMIN)
  lockChecklist: leadProcedure
    .input(
      z.object({
        checklistId: z.string(),
        isLocked: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const locked = await ctx.prisma.dailyChecklist.update({
        where: { id: input.checklistId },
        data: {
          isLocked: input.isLocked,
          lockedAt: input.isLocked ? new Date() : null,
        },
      });
      return locked;
    }),

  // 8. Save Scoring Rules & Cutoff Configuration (ADMIN)
  saveRules: adminProcedure
    .input(
      z.object({
        fullDayThreshold: z.number().min(0).max(100),
        halfDayThreshold: z.number().min(0).max(100),
        cutOffHour: z.number().min(0).max(23),
        cutOffMinute: z.number().min(0).max(59),
        timezone: z.string().default("Asia/Ho_Chi_Minh"),
        excludeBannedAccounts: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fullDayThreshold <= input.halfDayThreshold) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ngưỡng 1.0 Ngày Công phải lớn hơn ngưỡng 0.5 Ngày Công!",
        });
      }

      await ctx.prisma.systemConfig.upsert({
        where: { key: "scoring_rules" },
        create: {
          key: "scoring_rules",
          value: JSON.stringify(input),
          description: "Quy tắc tính công & mốc giờ Cutoff",
        },
        update: {
          value: JSON.stringify(input),
          description: "Quy tắc tính công & mốc giờ Cutoff",
        },
      });

      return { success: true, scoringConfig: input };
    }),

  // 9. Get Video List for an Account on a Specific Date (For Checklist Cross-Checking)
  getAccountVideos: protectedProcedure
    .input(
      z.object({
        username: z.string(),
        accountId: z.string().optional(),
        date: z.string(), // YYYY-MM-DD
      })
    )
    .query(async ({ ctx, input }) => {
      const cleanUsername = input.username.replace(/^@/, "").trim().toLowerCase();

      // Look up account with analytics
      const account = await ctx.prisma.tiktokAccount.findFirst({
        where: input.accountId ? { id: input.accountId } : { username: cleanUsername },
        include: {
          analytics: true,
          assignedUser: { select: { id: true, name: true, fullName: true, username: true } },
        },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Không tìm thấy tài khoản @${cleanUsername}`,
        });
      }

      // Permission check: Admin, Lead, or assigned operator
      const userRole = ctx.session.user.role;
      const isAdminOrLead = userRole === "ADMIN" || userRole === "LEAD";
      const isAssigned = account.assignedUserId === ctx.session.user.id;

      if (!isAdminOrLead && !isAssigned) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn không có quyền truy cập dữ liệu của tài khoản này.",
        });
      }

      // 1. Fetch DailyChecklistItem for this account on target date
      const targetDateObj = parseDateOnly(input.date);
      const checklistItem = await ctx.prisma.dailyChecklistItem.findFirst({
        where: {
          accountId: account.id,
          checklist: { date: targetDateObj },
        },
        include: {
          checklist: {
            include: {
              user: { select: { id: true, name: true, fullName: true, username: true } },
            },
          },
        },
      });

      // 2. Retrieve video snapshot: prioritize daily checklist snapshot if available
      let rawVideos: any[] = [];
      let lastSnapshotUpdated: string | null = null;

      const dailySnapshotVideos = Array.isArray(checklistItem?.videosSnapshot)
        ? (checklistItem.videosSnapshot as any[])
        : [];

      const rawSnapshot = (account.analytics?.rawSnapshot as any);
      const fallbackVideos = Array.isArray(rawSnapshot?.videosList) ? rawSnapshot.videosList : [];
      lastSnapshotUpdated = rawSnapshot?.updatedAt || null;

      if (dailySnapshotVideos.length > 0) {
        // Merge daily snapshot videos with any other recent videos from rawSnapshot for secondary context
        const map = new Map<string, any>();
        for (const v of fallbackVideos) {
          const key = String(v.id || v.item_id || v.title);
          map.set(key, v);
        }
        for (const v of dailySnapshotVideos) {
          const key = String(v.id || v.item_id || v.title);
          map.set(key, v);
        }
        rawVideos = Array.from(map.values());
      } else if (fallbackVideos.length > 0) {
        rawVideos = fallbackVideos;
      } else {
        // Fallback to legacy SystemConfig
        const config = await ctx.prisma.systemConfig.findUnique({
          where: { key: `analytics_${cleanUsername}` },
        });
        if (config && config.value) {
          try {
            const parsed = JSON.parse(config.value);
            if (Array.isArray(parsed.videosList)) {
              rawVideos = parsed.videosList;
              lastSnapshotUpdated = parsed.updatedAt || null;
            }
          } catch { }
        }
      }

      // Helper to parse date in Vietnam Time (Asia/Ho_Chi_Minh)
      const parseVideoTime = (v: any) => {
        let dateObj: Date | null = null;
        if (v.createTime || v.create_time || v.createtime) {
          const sec = Number(v.createTime || v.create_time || v.createtime);
          dateObj = new Date(sec > 1e11 ? sec : sec * 1000);
        } else if (v.postDate) {
          const parsed = new Date(v.postDate);
          if (!isNaN(parsed.getTime())) dateObj = parsed;
        }

        if (!dateObj || isNaN(dateObj.getTime())) {
          return { vnDateStr: "", formattedTime: v.postDate || "—", timestampMs: 0 };
        }

        const vnString = dateObj.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
        const vnDate = new Date(vnString);
        const y = vnDate.getFullYear();
        const m = String(vnDate.getMonth() + 1).padStart(2, "0");
        const d = String(vnDate.getDate()).padStart(2, "0");
        const vnDateStr = `${y}-${m}-${d}`;

        const hh = String(vnDate.getHours()).padStart(2, "0");
        const mm = String(vnDate.getMinutes()).padStart(2, "0");
        const formattedTime = `${hh}:${mm} • ${d}/${m}/${y}`;

        return { vnDateStr, formattedTime, timestampMs: dateObj.getTime() };
      };

      // 3. Format & partition videos
      const formattedVideos = rawVideos.map((v: any, index: number) => {
        const timeInfo = parseVideoTime(v);
        const id = v.id || v.item_id || String(index);
        const tiktokUrl = v.id ? `https://www.tiktok.com/@${cleanUsername}/video/${v.id}` : null;

        return {
          id,
          title: v.title || v.desc || "Không có tiêu đề",
          views: Number(v.views || 0),
          likes: Number(v.likes || 0),
          comments: Number(v.comments || 0),
          shares: Number(v.shares || 0),
          coverUrl: v.coverUrl || v.cover || null,
          privacy: v.privacy || "Everyone",
          postDate: v.postDate || "",
          formattedTime: timeInfo.formattedTime,
          vnDateStr: timeInfo.vnDateStr,
          timestampMs: timeInfo.timestampMs,
          isTargetDate: timeInfo.vnDateStr === input.date,
          tiktokUrl,
        };
      });

      // Sort by timestamp descending
      formattedVideos.sort((a, b) => b.timestampMs - a.timestampMs);

      const targetDateVideos = formattedVideos.filter((v) => v.isTargetDate);
      const otherRecentVideos = formattedVideos.filter((v) => !v.isTargetDate);

      return serializeBigInt({
        account: {
          id: account.id,
          username: account.username,
          country: account.country,
          status: account.status,
          totalVideos: account.totalVideos,
          totalViews: account.totalViews,
          totalRevenue: account.totalRevenue,
          currency: account.analytics?.currency || "$",
          lastSyncedAt: account.lastSyncedAt,
          syncStatus: account.syncStatus,
          gpmProfileId: account.gpmProfileId,
          assignedUser: account.assignedUser,
        },
        targetDate: input.date,
        lastSnapshotUpdated,
        checklistItem: checklistItem
          ? {
            id: checklistItem.id,
            isPosted: checklistItem.isPosted,
            isSynced: checklistItem.isSynced,
            isCompleted: checklistItem.isCompleted,
            notes: checklistItem.notes,
            checklistId: checklistItem.checklistId,
            operatorName: checklistItem.checklist?.user?.fullName || checklistItem.checklist?.user?.name || "—",
          }
          : null,
        targetDateVideos,
        otherRecentVideos,
        totalVideosCount: formattedVideos.length,
      });
    }),
});

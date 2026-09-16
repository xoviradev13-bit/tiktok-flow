import { router, protectedProcedure, leadProcedure, adminProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { calculateWorkdayScore, getCutoffTimeInfo, DEFAULT_SCORING_CONFIG, ScoringRuleConfig } from "@/lib/scoring-engine";

async function getScoringConfig(prisma: any): Promise<ScoringRuleConfig> {
  try {
    const record = await prisma.systemConfig.findUnique({
      where: { key: "scoring_rules" },
    });
    if (record && record.value) {
      const parsed = JSON.parse(record.value);
      return {
        ...DEFAULT_SCORING_CONFIG,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn("Failed to load scoring_rules config:", e);
  }
  return DEFAULT_SCORING_CONFIG;
}

function getTodayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

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

export const checklistRouter = router({
  // 1. Get or initialize today's checklist for current operator (or specified user for lead/admin)
  getToday: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const targetUserId =
        (ctx.session.user.role === "LEAD" || ctx.session.user.role === "ADMIN") && input?.userId
          ? input.userId
          : ctx.session.user.id;

      const today = getTodayDateOnly();

      let checklist = await ctx.prisma.dailyChecklist.findUnique({
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
                  status: true,
                  totalViews: true,
                  totalRevenue: true,
                  totalVideos: true,
                  lastSyncedAt: true,
                },
              },
            },
            orderBy: { updatedAt: "asc" },
          },
        },
      });

      // If no checklist exists for today, automatically generate one based on assigned accounts
      if (!checklist) {
        const assignedAccounts = await ctx.prisma.tiktokAccount.findMany({
          where: {
            assignedUserId: targetUserId,
            status: { in: ["ACTIVE", "WARMING"] },
          },
        });

        checklist = await ctx.prisma.dailyChecklist.create({
          data: {
            userId: targetUserId,
            date: today,
            totalAssigned: assignedAccounts.length,
            completedCount: 0,
            completionRate: 0,
            workdayScore: 0,
            items: {
              create: assignedAccounts.map((acc) => ({
                accountId: acc.id,
                isPosted: false,
                isSynced: !!acc.lastSyncedAt,
                isCompleted: false,
              })),
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
                    status: true,
                    totalViews: true,
                    totalRevenue: true,
                    totalVideos: true,
                    lastSyncedAt: true,
                  },
                },
              },
            },
          },
        });
      }

      return serializeBigInt(checklist);
    }),

  // 2. Comprehensive Roll Call & Timesheet View (Single Date or Date Range for Staffs)
  getByDate: protectedProcedure
    .input(
      z
        .object({
          date: z.string().optional(), // YYYY-MM-DD
          startDate: z.string().optional(), // YYYY-MM-DD
          endDate: z.string().optional(), // YYYY-MM-DD
          userId: z.string().optional(), // "ALL" or specific user
          search: z.string().optional(),
          scoreFilter: z.enum(["ALL", "FULL", "HALF", "ZERO"]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const isRangeMode = !!(input?.startDate && input?.endDate);
      const todayDateStr = new Date().toISOString().split("T")[0];
      const targetDateStr = input?.date || todayDateStr;

      // 1. Ensure checklists exist for all active staff for the requested date (only when single day mode)
      if (!isRangeMode) {
        const dateObj = parseDateOnly(targetDateStr);
        const activeUsers = await ctx.prisma.user.findMany({
          where: { isActive: true, role: { in: ["STAFF", "LEAD", "ADMIN"] }, deletedAt: null },
          include: { tiktokAccounts: { where: { status: { in: ["ACTIVE", "WARMING"] } } } },
        });

        const usersWithAccounts = activeUsers.filter((u) => u.tiktokAccounts.length > 0);
        if (usersWithAccounts.length > 0) {
          const candidateUserIds = usersWithAccounts.map((u) => u.id);
          const existingChecklists = await ctx.prisma.dailyChecklist.findMany({
            where: {
              date: dateObj,
              userId: { in: candidateUserIds },
            },
            select: { userId: true },
          });

          const existingSet = new Set(existingChecklists.map((c) => c.userId));
          const missingUsers = usersWithAccounts.filter((u) => !existingSet.has(u.id));

          if (missingUsers.length > 0) {
            await Promise.all(
              missingUsers.map((u) =>
                ctx.prisma.dailyChecklist.create({
                  data: {
                    userId: u.id,
                    date: dateObj,
                    totalAssigned: u.tiktokAccounts.length,
                    completedCount: 0,
                    completionRate: 0,
                    workdayScore: 0,
                    items: {
                      create: u.tiktokAccounts.map((acc) => ({
                        accountId: acc.id,
                        isPosted: false,
                        isSynced: !!acc.lastSyncedAt,
                        isCompleted: false,
                      })),
                    },
                  },
                })
              )
            );
          }
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

      if (ctx.session.user.role === "STAFF") {
        whereClause.userId = ctx.session.user.id;
      } else if (input?.userId && input.userId !== "ALL") {
        whereClause.userId = input.userId;
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
                  totalViews: true,
                  totalRevenue: true,
                  totalVideos: true,
                  lastSyncedAt: true,
                },
              },
            },
            orderBy: { updatedAt: "asc" },
          },
        },
        orderBy: isRangeMode ? [{ date: "desc" }, { createdAt: "asc" }] : [{ createdAt: "asc" }],
      });

      // Filter by search query if provided
      let formattedChecklists = checklists.map((c) => {
        const fullName =
          [c.user.firstName, c.user.lastName].filter(Boolean).join(" ") ||
          c.user.name ||
          c.user.username ||
          c.user.email;

        return {
          ...c,
          user: {
            ...c.user,
            fullName,
          },
        };
      });

      if (input?.search) {
        const s = input.search.toLowerCase().trim().replace(/^@/, "");
        formattedChecklists = formattedChecklists.filter(
          (c) =>
            c.user.fullName.toLowerCase().includes(s) ||
            (c.user.username && c.user.username.toLowerCase().includes(s)) ||
            (c.user.email && c.user.email.toLowerCase().includes(s)) ||
            c.items.some((item) => item.account.username.toLowerCase().includes(s))
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
        totalAssignedAccounts += c.items.length;
        for (const item of c.items) {
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

      const scoringConfig = await getScoringConfig(ctx.prisma);
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
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const todayDateStr = new Date().toISOString().split("T")[0];
      const targetDateObj = parseDateOnly(input?.date || todayDateStr);

      if (input?.checklistId) {
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
            completionRate: 100,
            workdayScore: 1.0,
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
      if (ctx.session.user.role === "STAFF") {
        whereClause.userId = ctx.session.user.id;
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

      if (
        ctx.session.user.role === "STAFF" &&
        item.checklist.userId !== ctx.session.user.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not permitted to modify this checklist",
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

      // Recalculate checklist counts and workday score using rule engine (>=85% -> 1.0, >=50% -> 0.5, <50% -> 0.0)
      const allItems = await ctx.prisma.dailyChecklistItem.findMany({
        where: { checklistId: item.checklistId },
      });

      const totalAssigned = allItems.length;
      const completedCount = allItems.filter((i) => i.isCompleted || i.isPosted).length;
      const { completionRate, workdayScore } = calculateWorkdayScore(totalAssigned, completedCount);

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

      // Permission check: ADMIN, LEAD, or the owner of the checklist
      const userRole = ctx.session.user.role;
      const isOwner = item.checklist.userId === ctx.session.user.id;
      const isAdminOrLead = userRole === "ADMIN" || userRole === "LEAD";

      if (!isAdminOrLead && !isOwner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn không có quyền chỉnh sửa ghi chú của nhân sự khác.",
        });
      }

      const updated = await ctx.prisma.dailyChecklistItem.update({
        where: { id: input.itemId },
        data: { notes: input.notes },
        include: { account: true },
      });

      return updated;
    }),

  // 6. Auto-Scan & Check Attendance across ALL Staffs / Accounts (or specific user)
  autoScanAndCheck: protectedProcedure
    .input(
      z
        .object({
          date: z.string().optional(), // YYYY-MM-DD
          userId: z.string().optional(), // "ALL" or specific user
          checklistId: z.string().optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const todayDateStr = new Date().toISOString().split("T")[0];
      const targetDateObj = parseDateOnly(input?.date || todayDateStr);

      const whereClause: any = { date: targetDateObj };
      if (input?.checklistId) {
        whereClause.id = input.checklistId;
      } else if (ctx.session.user.role === "STAFF") {
        whereClause.userId = ctx.session.user.id;
      } else if (input?.userId && input.userId !== "ALL") {
        whereClause.userId = input.userId;
      }

      const targetChecklists = await ctx.prisma.dailyChecklist.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, username: true, name: true } },
          items: {
            include: { account: true },
          },
        },
      });

      if (targetChecklists.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No checklists found for the specified criteria",
        });
      }

      const totalStaffScanned = targetChecklists.length;
      let totalAccountsScanned = 0;
      let scannedCount = 0;
      let postedCount = 0;
      let syncedCount = 0;

      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

      // Enqueue SyncQueue sweep for the targeted staff members so their Client Agents sweep local GPM
      for (const checklist of targetChecklists) {
        try {
          await ctx.prisma.syncQueue.create({
            data: {
              requestedById: ctx.session.user.id,
              status: "PENDING",
              targetScope: checklist.userId,
              requestedAt: new Date(),
            },
          });
        } catch { }
      }

      for (const checklist of targetChecklists) {
        for (const item of checklist.items) {
          totalAccountsScanned++;
          scannedCount++;

          // Check if account has been synced today by Client Agent or Extension
          const isSyncedToday = Boolean(
            item.account.lastSyncedAt && new Date(item.account.lastSyncedAt) >= todayStart
          );

          // Check if there is a revenue record or activity recorded today
          const hasRevenueToday = await ctx.prisma.dailyRevenue.findFirst({
            where: {
              accountId: item.account.id,
              date: todayStart,
            },
          });

          const isPosted = item.isPosted || Boolean(hasRevenueToday);
          const isSynced = item.isSynced || isSyncedToday;
          const isCompleted = isPosted && isSynced;

          if (isPosted) postedCount++;
          if (isSynced) syncedCount++;

          await ctx.prisma.dailyChecklistItem.update({
            where: { id: item.id },
            data: {
              isPosted,
              isSynced,
              isCompleted,
            },
          });
        }

        // Recalculate total checklist score for this staff
        const allItems = await ctx.prisma.dailyChecklistItem.findMany({
          where: { checklistId: checklist.id },
        });

        const totalAssigned = allItems.length;
        const completedCount = allItems.filter((i) => i.isCompleted || i.isPosted).length;
        const { completionRate, workdayScore } = calculateWorkdayScore(totalAssigned, completedCount);

        await ctx.prisma.dailyChecklist.update({
          where: { id: checklist.id },
          data: {
            totalAssigned,
            completedCount,
            completionRate,
            workdayScore,
          },
        });
      }

      return {
        totalStaffScanned,
        totalAccountsScanned,
        scannedCount,
        postedCount,
        syncedCount,
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

      // 1. Retrieve video snapshot from AccountAnalytics SSOT or SystemConfig fallback
      let rawVideos: any[] = [];
      let lastSnapshotUpdated: string | null = null;

      const rawSnapshot = (account.analytics?.rawSnapshot as any);
      if (rawSnapshot && Array.isArray(rawSnapshot.videosList)) {
        rawVideos = rawSnapshot.videosList;
        lastSnapshotUpdated = rawSnapshot.updatedAt || null;
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
          } catch {}
        }
      }

      // 2. Fetch DailyChecklistItem for this account on target date
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

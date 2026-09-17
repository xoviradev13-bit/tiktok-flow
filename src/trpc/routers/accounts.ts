import { router, protectedProcedure, leadProcedure, adminProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { calculateWorkdayScore } from "@/lib/scoring-engine";

function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

export const accountsRouter = router({
  // 1. List accounts with filters & overall fleet statistics
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["ALL", "ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]).optional(),
        onlineStatus: z.enum(["ALL", "ONLINE", "OFFLINE"]).optional(),
        country: z.string().optional(),
        assignedUserId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: any = {};

      // If user is STAFF (not LEAD or ADMIN), strictly show assigned accounts only
      if (ctx.session.user.role === "STAFF") {
        where.assignedUserId = ctx.session.user.id;
      } else if (input?.assignedUserId && input.assignedUserId !== "ALL") {
        where.assignedUserId = input.assignedUserId;
      }

      if (input?.search) {
        const s = input.search.trim();
        where.OR = [
          { username: { contains: s, mode: "insensitive" } },
          { groupName: { contains: s, mode: "insensitive" } },
        ];
      }

      if (input?.status && input.status !== "ALL") {
        where.status = input.status;
      }

      if (input?.onlineStatus && input.onlineStatus !== "ALL") {
        where.isOnline = input.onlineStatus === "ONLINE";
      }

      if (input?.country && input.country !== "ALL") {
        where.country = input.country;
      }

      const [accounts, statusGroups, onlineCount] = await Promise.all([
        ctx.prisma.tiktokAccount.findMany({
          where,
          include: {
            assignedUser: {
              select: {
                id: true,
                username: true,
                name: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
            alerts: {
              where: { status: "OPEN" },
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
        ctx.prisma.tiktokAccount.groupBy({
          by: ["status"],
          where,
          _count: { id: true },
        }),
        ctx.prisma.tiktokAccount.count({
          where: {
            ...where,
            isOnline: true,
          },
        }),
      ]);

      const statusMap = statusGroups.reduce<Record<string, number>>((acc, curr) => {
        acc[curr.status] = curr._count.id;
        return acc;
      }, {});

      const totalCount = statusGroups.reduce((sum, curr) => sum + curr._count.id, 0);
      const activeCount = statusMap["ACTIVE"] || 0;
      const restrictedCount = statusMap["RESTRICTED"] || 0;
      const bannedCount = statusMap["BANNED"] || 0;
      const warmingCount = statusMap["WARMING"] || 0;

      const totalFleetRevenue = accounts.reduce(
        (sum, acc) => sum + Number(acc.totalRevenue || 0),
        0
      );

      return {
        items: serializeBigInt(accounts),
        stats: {
          total: totalCount,
          active: activeCount,
          restricted: restrictedCount,
          banned: bannedCount,
          warming: warmingCount,
          online: onlineCount,
          totalRevenue: Math.round(totalFleetRevenue * 100) / 100,
        },
      };
    }),

  // 2. Get single account by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.tiktokAccount.findUnique({
        where: { id: input.id },
        include: {
          assignedUser: {
            select: {
              id: true,
              username: true,
              name: true,
              fullName: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          alerts: {
            orderBy: { createdAt: "desc" },
          },
          logs: {
            orderBy: { createdAt: "desc" },
            take: 50,
          },
          dailyRevenues: {
            orderBy: { date: "desc" },
            take: 60,
          },
        },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      // Staff access check
      if (ctx.session.user.role === "STAFF" && account.assignedUserId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to view this account.",
        });
      }

      return serializeBigInt(account);
    }),

  // 3. Create TikTok Account (LEAD / ADMIN)
  create: leadProcedure
    .input(
      z.object({
        username: z.string().min(1),
        country: z.string().default("US"),
        gpmProfileId: z.string().optional().nullable(),
        gpmPort: z.number().optional().nullable(),
        groupName: z.string().optional().nullable(),
        status: z.enum(["ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]).default("ACTIVE"),
        assignedUserId: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanUsername = input.username.replace(/^@/, "").trim();

      const existing = await ctx.prisma.tiktokAccount.findUnique({
        where: { username: cleanUsername },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this username already exists.",
        });
      }

      const account = await ctx.prisma.tiktokAccount.create({
        data: {
          username: cleanUsername,
          country: input.country,
          gpmProfileId: input.gpmProfileId,
          gpmPort: input.gpmPort,
          groupName: input.groupName,
          status: input.status,
          assignedUserId: input.assignedUserId || null,
          lastSyncedAt: new Date(),
        },
        include: {
          assignedUser: true,
        },
      });

      // Audit Log
      await ctx.prisma.accountLog.create({
        data: {
          accountId: account.id,
          oldStatus: null,
          newStatus: account.status,
          logType: "STATUS_CHANGE",
          message: `Account created and assigned to ${account.assignedUser?.name || account.assignedUser?.username || "Unassigned"}`,
          actorName: ctx.session.user.name || ctx.session.user.email || "Lead",
        },
      });

      return serializeBigInt(account);
    }),

  // 4. Update TikTok Account (LEAD / ADMIN, or assigned user updating note/group)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        country: z.string().optional(),
        gpmProfileId: z.string().optional().nullable(),
        gpmPort: z.number().optional().nullable(),
        groupName: z.string().optional().nullable(),
        status: z.enum(["ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]).optional(),
        assignedUserId: z.string().optional().nullable(),
        isAssignmentLocked: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.tiktokAccount.findUnique({
        where: { id: input.id },
      });

      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      if (ctx.session.user.role === "STAFF" && current.assignedUserId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not permitted to update this account",
        });
      }

      const isReassigning = input.assignedUserId !== undefined && input.assignedUserId !== current.assignedUserId;
      if (isReassigning && current.isAssignmentLocked && ctx.session.user.role === "STAFF") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tài khoản này đã bị khóa phân công. Chỉ Quản trị viên mới có quyền chuyển giao.",
        });
      }

      const statusChanged = input.status && input.status !== current.status;
      if (statusChanged && ctx.session.user.role === "STAFF") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền thay đổi trạng thái tài khoản.",
        });
      }

      const countryChanged = input.country !== undefined && input.country !== current.country;
      if (countryChanged && ctx.session.user.role === "STAFF") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền thay đổi quốc gia của tài khoản.",
        });
      }

      const groupChanged = input.groupName !== undefined && input.groupName !== current.groupName;
      if (groupChanged && ctx.session.user.role === "STAFF") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền thay đổi nhóm GPM của tài khoản.",
        });
      }

      const updated = await ctx.prisma.tiktokAccount.update({
        where: { id: input.id },
        data: {
          country: ctx.session.user.role !== "STAFF" ? input.country : undefined,
          gpmProfileId: ctx.session.user.role !== "STAFF" ? input.gpmProfileId : undefined,
          gpmPort: ctx.session.user.role !== "STAFF" && input.gpmPort !== undefined ? input.gpmPort : undefined,
          groupName: ctx.session.user.role !== "STAFF" ? input.groupName : undefined,
          status: ctx.session.user.role !== "STAFF" ? input.status : undefined,
          assignedUserId: ctx.session.user.role !== "STAFF" ? input.assignedUserId : undefined,
          isAssignmentLocked: ctx.session.user.role !== "STAFF" && input.isAssignmentLocked !== undefined ? input.isAssignmentLocked : undefined,
        },
        include: {
          assignedUser: true,
        },
      });

      if (isReassigning) {
        const oldUser = current.assignedUserId
          ? await ctx.prisma.user.findUnique({ where: { id: current.assignedUserId }, select: { name: true, username: true } })
          : null;
        const newUser = input.assignedUserId
          ? await ctx.prisma.user.findUnique({ where: { id: input.assignedUserId }, select: { name: true, username: true } })
          : null;

        await ctx.prisma.accountLog.create({
          data: {
            accountId: current.id,
            oldStatus: current.status,
            newStatus: current.status,
            logType: "HANDOVER",
            message: `[CHUYỂN GIAO QUẢN LÝ] Tài khoản @${current.username} đã được chuyển giao từ ${oldUser?.name || oldUser?.username || "Chưa gán"} sang ${newUser?.name || newUser?.username || "Chưa gán"} bởi ${ctx.session.user.name || ctx.session.user.email || "Admin"}.`,
            actorName: ctx.session.user.name || ctx.session.user.email || "Admin",
          },
        });
      }

      if (statusChanged) {
        await ctx.prisma.accountLog.create({
          data: {
            accountId: current.id,
            oldStatus: current.status,
            newStatus: input.status!,
            logType: "STATUS_CHANGE",
            message: `Status changed from ${current.status} to ${input.status}`,
            actorName: ctx.session.user.name || ctx.session.user.email || "Operator",
          },
        });
      }

      return serializeBigInt(updated);
    }),

  // 12. Toggle Lock Assignment (LEAD / ADMIN)
  toggleLockAssignment: leadProcedure
    .input(
      z.object({
        id: z.string(),
        isLocked: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.tiktokAccount.update({
        where: { id: input.id },
        data: { isAssignmentLocked: input.isLocked },
      });

      await ctx.prisma.accountLog.create({
        data: {
          accountId: input.id,
          newStatus: updated.status,
          logType: "STATUS_CHANGE",
          message: input.isLocked
            ? `[KHÓA PHÂN CÔNG] Quản trị viên ${ctx.session.user.name || "Admin"} đã khóa phân công tài khoản này.`
            : `[MỞ KHÓA PHÂN CÔNG] Quản trị viên ${ctx.session.user.name || "Admin"} đã mở khóa, cho phép chuyển giao tự động.`,
          actorName: ctx.session.user.name || ctx.session.user.email || "Admin",
        },
      });

      return { success: true, isAssignmentLocked: updated.isAssignmentLocked };
    }),

  // 5. Delete TikTok Account (ADMIN)
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.tiktokAccount.delete({
        where: { id: input.id },
      });
      return { success: true };
    }),

  // 6. Get Account Logs
  getLogs: protectedProcedure
    .input(z.object({ accountId: z.string(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const logs = await ctx.prisma.accountLog.findMany({
        where: { accountId: input.accountId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
      return logs;
    }),

  // 8. Sync Account with Live TikTok Studio Scraper
  syncAccount: protectedProcedure
    .input(z.object({ accountId: z.string() }))
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

      // Enqueue sync job in SyncQueue for Client Agent to sweep on the member's machine
      const targetUserId = account.assignedUserId || ctx.session.user.id;
      try {
        await ctx.prisma.syncQueue.create({
          data: {
            requestedById: ctx.session.user.id,
            status: "PENDING",
            targetScope: targetUserId,
            requestedAt: new Date(),
          },
        });
      } catch (e: any) {
        console.warn("[syncAccount] SyncQueue enqueue error:", e);
      }

      const updated = await ctx.prisma.tiktokAccount.update({
        where: { id: input.accountId },
        data: {
          lastSyncedAt: new Date(),
        },
        include: {
          assignedUser: true,
          alerts: { orderBy: { createdAt: "desc" } },
          logs: { orderBy: { createdAt: "desc" }, take: 50 },
          dailyRevenues: { orderBy: { date: "desc" }, take: 60 },
        },
      });

      // Auto-update today's checklist item for this account if one exists
      try {
        const now = new Date();
        const todayOnly = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        
        const openChecklistItem = await ctx.prisma.dailyChecklistItem.findFirst({
          where: {
            accountId: account.id,
            checklist: { date: todayOnly },
          },
          include: { checklist: true },
        });

        if (openChecklistItem) {
          const isSynced = true;
          const isPosted = openChecklistItem.isPosted;
          const isCompleted = isPosted && isSynced;

          await ctx.prisma.dailyChecklistItem.update({
            where: { id: openChecklistItem.id },
            data: { isSynced, isCompleted },
          });

          // Recalculate score for that checklist
          const allItems = await ctx.prisma.dailyChecklistItem.findMany({
            where: { checklistId: openChecklistItem.checklistId },
          });
          const totalAssigned = allItems.length;
          const completedCount = allItems.filter((i) => i.isCompleted || i.isPosted).length;
          const { completionRate, workdayScore } = calculateWorkdayScore(totalAssigned, completedCount);

          await ctx.prisma.dailyChecklist.update({
            where: { id: openChecklistItem.checklistId },
            data: { totalAssigned, completedCount, completionRate, workdayScore },
          });
        }
      } catch (checkErr) {
        console.warn("[syncAccount] Could not auto-update checklist item:", checkErr);
      }

      return {
        account: serializeBigInt(updated),
        queued: true,
      };
    }),

  // 8.1 Resolve Alert
  resolveAlert: protectedProcedure
    .input(z.object({ alertId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const alert = await ctx.prisma.accountAlert.update({
        where: { id: input.alertId },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });
      return alert;
    }),

  // 8.2 Add Manual Audit Log / Note
  addLog: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        message: z.string().min(1),
        logType: z.string().default("NOTE"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const log = await ctx.prisma.accountLog.create({
        data: {
          accountId: input.accountId,
          newStatus: "NOTE",
          logType: input.logType,
          message: input.message,
          actorName: ctx.session.user.name || ctx.session.user.email || "Staff",
        },
      });
      return log;
    }),

  // 9. Bulk Delete Accounts (ADMIN)
  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.prisma.tiktokAccount.deleteMany({
        where: { id: { in: input.ids } },
      });
      return { count: res.count };
    }),

  // 10. Bulk Update Status (LEAD / ADMIN)
  bulkUpdateStatus: leadProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        status: z.enum(["ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.prisma.tiktokAccount.updateMany({
        where: { id: { in: input.ids } },
        data: { status: input.status },
      });
      return { count: res.count };
    }),

  // 11. Bulk Assign Staff (LEAD / ADMIN)
  bulkAssign: leadProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        assignedUserId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.prisma.tiktokAccount.updateMany({
        where: { id: { in: input.ids } },
        data: { assignedUserId: input.assignedUserId },
      });
      return { count: res.count };
    }),
});

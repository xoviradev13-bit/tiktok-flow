// NOTE: `delete` / `bulkDelete` perform SOFT deletes (moved to Trash).
//       Use `hardDelete` / `bulkHardDelete` for permanent removal.
// RACE-SAFETY RULE: All mutating procedures verify state inside the
// transaction via updateMany/deleteMany + count check. Never trust a
// pre-transaction read alone.
// RECONCILIATION RULE: Post-commit reconciliation is wrapped in try/catch
// via `reconcileAfterCommit` — never let a checklist error 500 the caller.

import { router, protectedProcedure, leadProcedure, adminProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { calculateWorkdayScore, getScoringConfig } from "@/lib/scoring-engine";
import { isAccountOnline, getOnlineCutoffDate } from "@/lib/account-status";
import { resolveAllTimeRevenue, resolvePeriodRevenue } from "@/lib/resolve-all-time-revenue";
import { Prisma } from "@/generated/prisma/client";
import {
  AccountPurgeSnapshot,
  AccountRestoreDiff,
  ListStats,
} from "@/lib/audit-types";
import { cancelInFlightSyncJobs } from "@/lib/sync-scope";
import { reconcileAfterCommit } from "@/lib/checklist-reconcile";
import {
  recordAccountTransfer,
  recordBulkAccountTransfer,
} from "@/lib/account-assignment-history";

function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

export const accountsRouter = router({
  // 1. List accounts with filters & overall fleet statistics / Trash mode
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          status: z
            .enum(["ALL", "ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"])
            .optional(),
          onlineStatus: z.enum(["ALL", "ONLINE", "OFFLINE"]).optional(),
          syncStatus: z
            .enum(["ALL", "SYNC_OK", "SYNC_ISSUES", "NEVER_SYNCED", "STALE"])
            .optional(),
          country: z.string().optional(),
          assignedUserId: z.string().optional(),
          viewTrash: z.boolean().optional().default(false),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === "ADMIN";
      const viewTrash = Boolean(input?.viewTrash && isAdmin);

      // Fleet mode uses the extended client so the soft-delete extension is the
      // one source of truth for "what counts as active" — not a hand-copied
      // filter that can drift from the extension's own logic.
      const client = viewTrash ? ctx.prismaRaw : ctx.prisma;

      const where: any = viewTrash ? { deletedAt: { not: null } } : {};

      // STAFF scoping
      if (ctx.session.user.role === "STAFF") {
        where.assignedUserId = ctx.session.user.id;
      } else if (!viewTrash && input?.assignedUserId && input.assignedUserId !== "ALL") {
        where.assignedUserId = input.assignedUserId;
      }

      if (input?.search) {
        const s = input.search.trim();
        where.OR = [
          { username: { contains: s, mode: "insensitive" } },
          { groupName: { contains: s, mode: "insensitive" } },
          { gpmProfileName: { contains: s, mode: "insensitive" } },
          { gpmProfileId: { contains: s, mode: "insensitive" } },
        ];
      }

      // In Trash mode: only search and country are honored.
      if (input?.country && input.country !== "ALL") {
        where.country = input.country;
      }

      const onlineCutoff = getOnlineCutoffDate();
      let baseCountWhere = { ...where };

      if (!viewTrash) {
        if (input?.status && input.status !== "ALL") {
          where.status = input.status;
        }

        if (input?.onlineStatus && input.onlineStatus !== "ALL") {
          where.isOnline = input.onlineStatus === "ONLINE";
        }

        if (input?.syncStatus && input.syncStatus !== "ALL") {
          where.syncStatus = input.syncStatus;
        }

        baseCountWhere = { ...where };
        if (input?.onlineStatus && input.onlineStatus !== "ALL") {
          delete baseCountWhere.isOnline;
          if (input?.search) {
            const s = input.search.trim();
            baseCountWhere.OR = [
              { username: { contains: s, mode: "insensitive" } },
              { groupName: { contains: s, mode: "insensitive" } },
              { gpmProfileName: { contains: s, mode: "insensitive" } },
              { gpmProfileId: { contains: s, mode: "insensitive" } },
            ];
          } else {
            delete baseCountWhere.OR;
          }
        }
        if (input?.syncStatus && input.syncStatus !== "ALL") {
          delete baseCountWhere.syncStatus;
        }
      }

      const [accounts, trashCount, statusGroups, onlineCount] = await Promise.all([
        client.tiktokAccount.findMany({
          where,
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
              where: { status: "OPEN" },
              orderBy: { createdAt: "desc" },
            },
            analytics: {
              select: {
                postRewards: true,
                sumRevenue: true,
                sumViews: true,
                rawSnapshot: true,
                revenueBreakdown: true,
                dailyRevenueBreakdown: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
        isAdmin
          ? ctx.prismaRaw.tiktokAccount.count({ where: { deletedAt: { not: null } } })
          : Promise.resolve(null),
        !viewTrash
          ? ctx.prisma.tiktokAccount.groupBy({
            by: ["status"],
            where,
            _count: { id: true },
          })
          : Promise.resolve([]),
        !viewTrash
          ? ctx.prisma.tiktokAccount.count({
            where: {
              ...baseCountWhere,
              isOnline: true,
            },
          })
          : Promise.resolve(0),
      ]);

      // Lazily heal stale online records in the DB when in fleet mode
      if (!viewTrash) {
        ctx.prisma.tiktokAccount
          .updateMany({
            where: {
              isOnline: true,
              OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: onlineCutoff } }],
              deletedAt: null,
            },
            data: { isOnline: false },
          })
          .catch(() => { });
      }

      // Join the latest SystemAuditLog entry per row in Trash mode so UI shows deleter name
      const deleterByAccountId: Record<string, string> = {};
      if (viewTrash && accounts.length > 0) {
        const logs = await ctx.prismaRaw.systemAuditLog.findMany({
          where: {
            entityId: { in: accounts.map((i: any) => i.id) },
            action: { in: ["SOFT_DELETE", "BULK_SOFT_DELETE"] },
          },
          orderBy: { createdAt: "desc" },
          select: { entityId: true, actorName: true, createdAt: true },
        });
        for (const log of logs) {
          if (!deleterByAccountId[log.entityId]) {
            deleterByAccountId[log.entityId] = log.actorName ?? "Hệ thống";
          }
        }
      }

      const statusMap: Record<string, number> = statusGroups.reduce((acc: Record<string, number>, curr: { status: string; _count: { id: number } }) => {
        acc[curr.status] = curr._count.id;
        return acc;
      }, {} as Record<string, number>);

      const totalCount = statusGroups.reduce((sum: number, curr: { _count: { id: number } }) => sum + curr._count.id, 0);
      const activeCount = statusMap["ACTIVE"] || 0;
      const restrictedCount = statusMap["RESTRICTED"] || 0;
      const bannedCount = statusMap["BANNED"] || 0;
      const warmingCount = statusMap["WARMING"] || 0;

      const totalFleetRevenue = accounts.reduce(
        (sum: number, acc: any) => sum + resolveAllTimeRevenue(acc),
        0
      );

      const totalFleetRevenue7d = accounts.reduce(
        (sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 7),
        0
      );

      const totalFleetRevenue28d = accounts.reduce(
        (sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 28),
        0
      );

      const totalFleetRevenue30d = accounts.reduce(
        (sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 30),
        0
      );

      const totalFleetRevenue60d = accounts.reduce(
        (sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 60),
        0
      );

      const totalFleetRevenue365d = accounts.reduce(
        (sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 365),
        0
      );

      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const items = accounts.map((acc: any) => {
        const rawPostRewards = Array.isArray((acc as any).analytics?.postRewards)
          ? (acc as any).analytics.postRewards
          : Array.isArray(((acc as any).analytics?.postRewards as any)?.items)
            ? ((acc as any).analytics?.postRewards as any).items
            : [];

        const punishedVideos30d = rawPostRewards.filter((v: any) => {
          if (!v?.isPunished) return false;
          const ts = v.publishTimeUnix
            ? Number(v.publishTimeUnix) * 1000
            : new Date(v.publishDate || v.postDate || v.postTime || "").getTime();
          return !isNaN(ts) ? now - ts <= THIRTY_DAYS_MS : false;
        });

        const strikeCount = punishedVideos30d.length;
        const strikeLevel = strikeCount >= 5 ? 5 : strikeCount;

        return {
          ...acc,
          isOnline: Boolean(acc.isOnline),
          punishedVideos30d,
          punishedVideosCount30d: strikeCount,
          strikeLevel,
          deletedByName: viewTrash ? deleterByAccountId[acc.id] ?? null : undefined,
        };
      });

      const stats: ListStats = viewTrash
        ? { mode: "trash", trashCount: trashCount ?? 0 }
        : {
          mode: "fleet",
          total: totalCount,
          active: activeCount,
          restricted: restrictedCount,
          banned: bannedCount,
          warming: warmingCount,
          online: onlineCount,
          totalRevenue: Math.round(totalFleetRevenue * 100) / 100,
          totalRevenue7d: Math.round(totalFleetRevenue7d * 100) / 100,
          totalRevenue28d: Math.round(totalFleetRevenue28d * 100) / 100,
          totalRevenue30d: Math.round(totalFleetRevenue30d * 100) / 100,
          totalRevenue60d: Math.round(totalFleetRevenue60d * 100) / 100,
          totalRevenue365d: Math.round(totalFleetRevenue365d * 100) / 100,
          trashCount,
        };

      return {
        items: serializeBigInt(items),
        stats,
      };
    }),

  // 2. Get single account by ID (supports includeDeleted for Admin)
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        includeDeleted: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === "ADMIN";

      if (input.includeDeleted && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view trashed accounts." });
      }

      const account = await ctx.prismaRaw.tiktokAccount.findFirst({
        where: input.includeDeleted ? { id: input.id } : { id: input.id, deletedAt: null },
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
            take: 400,
          },
          analytics: true,
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

      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const rawPostRewards = Array.isArray((account as any).analytics?.postRewards)
        ? (account as any).analytics.postRewards
        : Array.isArray(((account as any).analytics?.postRewards as any)?.items)
          ? ((account as any).analytics?.postRewards as any).items
          : [];

      const punishedVideos30d = rawPostRewards.filter((v: any) => {
        if (!v?.isPunished) return false;
        const ts = v.publishTimeUnix
          ? Number(v.publishTimeUnix) * 1000
          : new Date(v.publishDate || v.postDate || v.postTime || "").getTime();
        return !isNaN(ts) ? now - ts <= THIRTY_DAYS_MS : false;
      });

      const strikeCount = punishedVideos30d.length;
      const strikeLevel = strikeCount >= 5 ? 5 : strikeCount;

      return serializeBigInt({
        ...account,
        isOnline: Boolean(account.isOnline),
        punishedVideos30d,
        punishedVideosCount30d: strikeCount,
        strikeLevel,
      });
    }),

  // 2.1 Check username existence for create modal (LEAD / ADMIN)
  checkUsername: leadProcedure
    .input(z.object({ username: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const clean = input.username.replace(/^@/, "").trim();
      const existing = await ctx.prismaRaw.tiktokAccount.findUnique({
        where: { username: clean },
        select: { id: true, deletedAt: true },
      });
      return {
        exists: !!existing,
        canAutoRestore: !!existing && existing.deletedAt !== null,
      };
    }),

  // 3. Create TikTok Account (LEAD / ADMIN) — Trash-aware & race-safe
  create: leadProcedure
    .input(
      z.object({
        username: z.string().min(1),
        // No defaults here — defaults applied only in the normal create branch.
        country: z.string().optional(),
        gpmProfileId: z.string().optional().nullable(),
        gpmProfileName: z.string().optional().nullable(),
        gpmPort: z.number().optional().nullable(),
        groupName: z.string().optional().nullable(),
        status: z.enum(["ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]).optional(),
        assignedUserId: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanUsername = input.username.replace(/^@/, "").trim();
      const actorName = ctx.session.user.name || ctx.session.user.email || "User";

      const existing = await ctx.prismaRaw.tiktokAccount.findUnique({
        where: { username: cleanUsername },
      });

      if (existing && existing.deletedAt !== null) {
        const before = {
          status: existing.status,
          country: existing.country,
          groupName: existing.groupName,
          assignedUserId: existing.assignedUserId,
          gpmProfileId: existing.gpmProfileId,
          deletedAt: existing.deletedAt.toISOString(),
        };

        const restored = await ctx.prisma.$transaction(async (tx: any) => {
          const res = await tx.tiktokAccount.updateMany({
            where: { id: existing.id, deletedAt: { not: null } },
            data: {
              deletedAt: null,
              deletedById: null,
              ...(input.country !== undefined && { country: input.country }),
              ...(input.gpmProfileId !== undefined && { gpmProfileId: input.gpmProfileId }),
              ...(input.gpmProfileName !== undefined && { gpmProfileName: input.gpmProfileName }),
              ...(input.gpmPort !== undefined && { gpmPort: input.gpmPort }),
              ...(input.groupName !== undefined && { groupName: input.groupName }),
              ...(input.status !== undefined && { status: input.status }),
              ...(input.assignedUserId !== undefined && { assignedUserId: input.assignedUserId }),
            },
          });
          if (res.count === 0) throw new TRPCError({ code: "CONFLICT", message: "Account state changed" });

          await tx.systemAuditLog.create({
            data: {
              actorId: ctx.session.user.id,
              actorName,
              action: "RESTORE",
              entityType: "TiktokAccount",
              entityId: existing.id,
              entityLabel: existing.username,
              snapshot: {
                restoredFromTrash: true,
                actorRole: ctx.session.user.role,
                previousState: before,
                newState: input,
              } satisfies AccountRestoreDiff,
            },
          });

          return tx.tiktokAccount.findFirst({
            where: { id: existing.id },
            include: { assignedUser: true },
          });
        });

        if (!restored) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        if (restored.assignedUserId) {
          await reconcileAfterCommit(ctx.prismaRaw as any, restored.assignedUserId, "create-restore");
        }

        return serializeBigInt(restored);
      }

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this username already exists.",
        });
      }

      // Normal create path: apply defaults HERE
      try {
        const created = await ctx.prisma.tiktokAccount.create({
          data: {
            username: cleanUsername,
            country: input.country ?? "US",
            gpmProfileId: input.gpmProfileId ?? null,
            gpmProfileName: input.gpmProfileName ?? null,
            gpmPort: input.gpmPort ?? null,
            groupName: input.groupName ?? null,
            status: input.status ?? "ACTIVE",
            assignedUserId: input.assignedUserId ?? null,
            lastSyncedAt: new Date(),
          },
          include: {
            assignedUser: true,
          },
        });

        await ctx.prisma.accountLog.create({
          data: {
            accountId: created.id,
            oldStatus: null,
            newStatus: created.status,
            logType: "STATUS_CHANGE",
            message: `Account created and assigned to ${created.assignedUser?.name || created.assignedUser?.username || "Unassigned"}`,
            actorName,
          },
        });

        if (created.assignedUserId) {
          await recordAccountTransfer(ctx.prismaRaw, {
            accountId: created.id,
            newUserId: created.assignedUserId,
            transferredBy: actorName,
            reason: "Account created and assigned",
          });
          await reconcileAfterCommit(ctx.prismaRaw as any, created.assignedUserId, "create");
        }

        return serializeBigInt(created);
      } catch (err) {
        // Two concurrent creates for a brand-new username can both pass the
        // `existing === null` check above and race on the unique constraint.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this username already exists." });
        }
        throw err;
      }
    }),

  // 4. Update TikTok Account (race-safe, STAFF-scoped)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        country: z.string().optional(),
        gpmProfileId: z.string().optional().nullable(),
        gpmProfileName: z.string().optional().nullable(),
        gpmPort: z.number().optional().nullable(),
        groupName: z.string().optional().nullable(),
        status: z.enum(["ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]).optional(),
        assignedUserId: z.string().optional().nullable(),
        isAssignmentLocked: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.tiktokAccount.findFirst({
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

      const isStaff = ctx.session.user.role === "STAFF";

      const isReassigning = input.assignedUserId !== undefined && input.assignedUserId !== current.assignedUserId;
      if (isReassigning && current.isAssignmentLocked && isStaff) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tài khoản này đã bị khóa phân công. Chỉ Quản trị viên mới có quyền chuyển giao.",
        });
      }

      const statusChanged = input.status && input.status !== current.status;
      if (statusChanged && isStaff) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền thay đổi trạng thái tài khoản.",
        });
      }

      const countryChanged = input.country !== undefined && input.country !== current.country;
      if (countryChanged && isStaff) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền thay đổi quốc gia của tài khoản.",
        });
      }

      const groupChanged = input.groupName !== undefined && input.groupName !== current.groupName;
      if (groupChanged && isStaff) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền thay đổi nhóm GPM của tài khoản.",
        });
      }

      if (!isStaff && input.gpmProfileId && input.gpmProfileId !== current.gpmProfileId) {
        const duplicate = await ctx.prisma.tiktokAccount.findFirst({
          where: {
            gpmProfileId: input.gpmProfileId,
            id: { not: input.id },
            deletedAt: null,
          },
          select: { username: true },
        });
        if (duplicate) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `GPM Profile ID này đã được liên kết với tài khoản @${duplicate.username}. Vui lòng kiểm tra lại.`,
          });
        }
      }

      const res = await ctx.prisma.tiktokAccount.updateMany({
        where: { id: input.id, deletedAt: null },
        data: {
          country: !isStaff ? input.country : undefined,
          gpmProfileId: !isStaff ? input.gpmProfileId : undefined,
          gpmProfileName: !isStaff ? input.gpmProfileName : undefined,
          gpmPort: !isStaff && input.gpmPort !== undefined ? input.gpmPort : undefined,
          groupName: !isStaff ? input.groupName : undefined,
          status: !isStaff ? input.status : undefined,
          assignedUserId: !isStaff ? input.assignedUserId : undefined,
          isAssignmentLocked: !isStaff && input.isAssignmentLocked !== undefined ? input.isAssignmentLocked : undefined,
        },
      });

      if (res.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }

      const updated = await ctx.prisma.tiktokAccount.findFirst({
        where: { id: input.id },
        include: { assignedUser: true },
      });

      if (isReassigning) {
        const oldUser = current.assignedUserId
          ? await ctx.prismaRaw.user.findUnique({ where: { id: current.assignedUserId }, select: { name: true, username: true } })
          : null;
        const newUser = input.assignedUserId
          ? await ctx.prismaRaw.user.findUnique({ where: { id: input.assignedUserId }, select: { name: true, username: true } })
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

        await recordAccountTransfer(ctx.prismaRaw, {
          accountId: current.id,
          newUserId: input.assignedUserId ?? null,
          transferredBy: ctx.session.user.name || ctx.session.user.email || "Admin",
          reason: `Handover from ${oldUser?.name || oldUser?.username || "Chưa gán"} to ${newUser?.name || newUser?.username || "Chưa gán"}`,
        });

        if (current.assignedUserId) {
          await reconcileAfterCommit(ctx.prismaRaw as any, current.assignedUserId, "update-unassign");
        }
        if (input.assignedUserId) {
          await reconcileAfterCommit(ctx.prismaRaw as any, input.assignedUserId, "update-assign");
        }
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

        if (updated?.assignedUserId) {
          await reconcileAfterCommit(ctx.prismaRaw as any, updated.assignedUserId, "update-status");
        }
      }

      return serializeBigInt(updated);
    }),

  // 5. Delete TikTok Account (ADMIN) — SOFT DELETE
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.tiktokAccount.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });

      const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

      await ctx.prisma.$transaction(async (tx: any) => {
        const res = await tx.tiktokAccount.updateMany({
          where: { id: account.id, deletedAt: null },
          data: { deletedAt: new Date(), deletedById: ctx.session.user.id, isOnline: false },
        });
        if (res.count === 0) throw new TRPCError({ code: "CONFLICT", message: "Account state changed" });

        // JS-side scope matching — fixes substring bug
        await cancelInFlightSyncJobs(tx, [
          {
            username: account.username,
            gpmProfileId: account.gpmProfileId,
          },
        ]);

        await tx.accountLog.create({
          data: {
            accountId: account.id,
            logType: "DELETED",
            newStatus: account.status,
            message: `[CHUYỂN VÀO THÙNG RÁC] Tài khoản @${account.username} đã được chuyển vào thùng rác bởi ${actorName}.`,
            actorName,
          },
        });

        await tx.systemAuditLog.create({
          data: {
            actorId: ctx.session.user.id,
            actorName,
            action: "SOFT_DELETE",
            entityType: "TiktokAccount",
            entityId: account.id,
            entityLabel: account.username,
            snapshot: { status: account.status, assignedUserId: account.assignedUserId },
          },
        });
      });

      if (account.assignedUserId) {
        await reconcileAfterCommit(ctx.prismaRaw as any, account.assignedUserId, "delete");
      }

      return { success: true };
    }),

  // 6. Bulk Delete Accounts (ADMIN) — SOFT DELETE
  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

      const targets: Array<{ id: string; username: string; status: string; gpmProfileId: string | null; assignedUserId: string | null }> = await ctx.prismaRaw.tiktokAccount.findMany({
        where: { id: { in: input.ids }, deletedAt: null },
        select: { id: true, username: true, status: true, gpmProfileId: true, assignedUserId: true },
      });
      if (targets.length === 0) return { count: 0 };

      const now = new Date();

      await ctx.prisma.$transaction(async (tx: any) => {
        const res = await tx.tiktokAccount.updateMany({
          where: { id: { in: targets.map((t) => t.id) }, deletedAt: null },
          data: { deletedAt: now, deletedById: ctx.session.user.id, isOnline: false },
        });
        if (res.count !== targets.length) {
          throw new TRPCError({ code: "CONFLICT", message: "One or more accounts changed state. Retry." });
        }

        await cancelInFlightSyncJobs(
          tx,
          targets.map((t) => ({
            username: t.username,
            gpmProfileId: t.gpmProfileId,
          }))
        );

        await tx.accountLog.createMany({
          data: targets.map((t) => ({
            accountId: t.id,
            logType: "DELETED",
            newStatus: t.status,
            message: `[CHUYỂN VÀO THÙNG RÁC] Tài khoản @${t.username} đã được chuyển vào thùng rác bởi ${actorName}.`,
            actorName,
          })),
        });

        await tx.systemAuditLog.createMany({
          data: targets.map((t) => ({
            actorId: ctx.session.user.id,
            actorName,
            action: "BULK_SOFT_DELETE",
            entityType: "TiktokAccount",
            entityId: t.id,
            entityLabel: t.username,
            snapshot: { status: t.status, assignedUserId: t.assignedUserId },
          })),
        });
      });

      const affectedUsers = Array.from(
        new Set(targets.map((t: { assignedUserId: string | null }) => t.assignedUserId).filter((u: string | null): u is string => !!u))
      );
      for (const userId of affectedUsers) {
        await reconcileAfterCommit(ctx.prismaRaw as any, userId, "bulkDelete");
      }

      return { count: targets.length };
    }),

  // 7. Restore Single Account from Trash (ADMIN)
  restore: adminProcedure
    .input(
      z.object({
        id: z.string(),
        assignedUserId: z.string().nullable().optional(),
        resetAssignmentLock: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prismaRaw.tiktokAccount.findFirst({
        where: { id: input.id, deletedAt: { not: null } },
      });
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Not in Trash" });

      let resolvedAssignee =
        input.assignedUserId !== undefined ? input.assignedUserId : account.assignedUserId;

      if (resolvedAssignee) {
        const user = await ctx.prismaRaw.user.findFirst({
          where: { id: resolvedAssignee, isActive: true, deletedAt: null },
          select: { id: true },
        });
        if (!user) resolvedAssignee = null;
      }

      const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

      await ctx.prisma.$transaction(async (tx: any) => {
        const res = await tx.tiktokAccount.updateMany({
          where: { id: account.id, deletedAt: { not: null } },
          data: {
            deletedAt: null,
            deletedById: null,
            assignedUserId: resolvedAssignee,
            isAssignmentLocked: input.resetAssignmentLock ? false : account.isAssignmentLocked,
          },
        });
        if (res.count === 0) throw new TRPCError({ code: "CONFLICT", message: "Account state changed" });

        await tx.accountLog.create({
          data: {
            accountId: account.id,
            logType: "RESTORED",
            newStatus: account.status,
            message: `[KHÔI PHỤC TÀI KHOẢN] Tài khoản @${account.username} đã được khôi phục từ thùng rác bởi ${actorName}.`,
            actorName,
          },
        });

        if (resolvedAssignee) {
          await recordAccountTransfer(tx, {
            accountId: account.id,
            newUserId: resolvedAssignee,
            transferredBy: actorName,
            reason: "Account restored from trash",
          });
        }

        await tx.systemAuditLog.create({
          data: {
            actorId: ctx.session.user.id,
            actorName,
            action: "RESTORE",
            entityType: "TiktokAccount",
            entityId: account.id,
            entityLabel: account.username,
            snapshot: {
              restoredFromTrash: true,
              actorRole: ctx.session.user.role,
              previousState: {
                status: account.status,
                country: account.country,
                groupName: account.groupName,
                assignedUserId: account.assignedUserId,
                gpmProfileId: account.gpmProfileId,
                deletedAt: account.deletedAt?.toISOString() ?? null,
              },
              newState: { assignedUserId: resolvedAssignee },
            } satisfies AccountRestoreDiff,
          },
        });
      });

      if (resolvedAssignee) {
        await reconcileAfterCommit(ctx.prismaRaw as any, resolvedAssignee, "restore");
      }

      return { success: true };
    }),

  // 8. Bulk Restore Accounts from Trash (ADMIN)
  bulkRestore: adminProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        resetAssignmentLock: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targets = await ctx.prismaRaw.tiktokAccount.findMany({
        where: { id: { in: input.ids }, deletedAt: { not: null } },
        select: { id: true, username: true, status: true, assignedUserId: true, isAssignmentLocked: true },
      });
      if (targets.length === 0) return { restoredCount: 0 };

      const candidateIds = Array.from(
        new Set(targets.map((t) => t.assignedUserId).filter((u): u is string => !!u))
      );
      const validUsers = candidateIds.length
        ? await ctx.prismaRaw.user.findMany({
          where: { id: { in: candidateIds }, isActive: true, deletedAt: null },
          select: { id: true },
        })
        : [];
      const validSet = new Set(validUsers.map((u) => u.id));

      const resolved = targets.map((t) => ({
        ...t,
        resolvedAssignee:
          t.assignedUserId && validSet.has(t.assignedUserId) ? t.assignedUserId : null,
      }));

      const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

      await ctx.prisma.$transaction(async (tx: any) => {
        for (const t of resolved) {
          const res = await tx.tiktokAccount.updateMany({
            where: { id: t.id, deletedAt: { not: null } },
            data: {
              deletedAt: null,
              deletedById: null,
              assignedUserId: t.resolvedAssignee,
              isAssignmentLocked: input.resetAssignmentLock ? false : t.isAssignmentLocked,
            },
          });
          if (res.count === 0) {
            throw new TRPCError({ code: "CONFLICT", message: `Account ${t.id} state changed` });
          }
        }

        await tx.accountLog.createMany({
          data: resolved.map((t) => ({
            accountId: t.id,
            logType: "RESTORED",
            newStatus: t.status,
            message: `[KHÔI PHỤC TÀI KHOẢN] Tài khoản @${t.username} đã được khôi phục từ thùng rác bởi ${actorName}.`,
            actorName,
          })),
        });

        await tx.systemAuditLog.createMany({
          data: resolved.map((t) => ({
            actorId: ctx.session.user.id,
            actorName,
            action: "BULK_RESTORE",
            entityType: "TiktokAccount",
            entityId: t.id,
            entityLabel: t.username,
            snapshot: {
              restoredFromTrash: true,
              actorRole: ctx.session.user.role,
              previousState: { assignedUserId: t.assignedUserId },
              newState: { assignedUserId: t.resolvedAssignee },
            },
          })),
        });
      });

      const affectedUsers = Array.from(
        new Set(resolved.map((t) => t.resolvedAssignee).filter((u): u is string => !!u))
      );
      for (const userId of affectedUsers) {
        await reconcileAfterCommit(ctx.prismaRaw as any, userId, "bulkRestore");
      }

      return { restoredCount: resolved.length };
    }),

  // 9. Hard Delete Account (ADMIN) — Permanent removal with snapshot
  hardDelete: adminProcedure
    .input(
      z.object({
        id: z.string(),
        forcePurgeHistoricalData: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prismaRaw.tiktokAccount.findFirst({
        where: { id: input.id, deletedAt: { not: null } },
        include: {
          analytics: true,
          _count: { select: { dailyRevenues: true, checklistItems: true } },
        },
      });
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Not in Trash" });

      // ACCEPTED RISK: hasHistory is read pre-transaction; a row inserted in the
      // gap before deleteMany commits won't be reflected in the snapshot below.
      const hasHistory =
        account._count.dailyRevenues > 0 ||
        account._count.checklistItems > 0 ||
        (account.analytics &&
          (Number((account.analytics as any)?.sumRevenue?.totalRevenue ?? 0) > 0 ||
            (Array.isArray((account.analytics as any)?.postRewards) &&
              (account.analytics as any).postRewards.length > 0)));

      if (hasHistory && !input.forcePurgeHistoricalData) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Tài khoản có dữ liệu doanh thu/KPI lịch sử. Gửi forcePurgeHistoricalData: true để xóa vĩnh viễn.",
        });
      }

      const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";
      const snapshot = {
        username: account.username,
        country: account.country,
        status: account.status,
        assignedUserId: account.assignedUserId,
        totalRevenue: resolveAllTimeRevenue(account as any),
        totalVideos: account.totalVideos ?? 0,
        totalFollowers: account.totalFollowers ?? 0,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        dailyRevenueCount: account._count.dailyRevenues,
        checklistItemCount: account._count.checklistItems,
        hasMeaningfulAnalytics: !!account.analytics,
      } satisfies AccountPurgeSnapshot;

      await ctx.prismaRaw.$transaction(async (tx: any) => {
        await tx.systemAuditLog.create({
          data: {
            actorId: ctx.session.user.id,
            actorName,
            action: "HARD_DELETE",
            entityType: "TiktokAccount",
            entityId: account.id,
            entityLabel: account.username,
            snapshot: snapshot,
          },
        });
        const res = await tx.tiktokAccount.deleteMany({
          where: { id: account.id, deletedAt: { not: null } },
        });
        if (res.count === 0) throw new TRPCError({ code: "CONFLICT", message: "Account state changed" });
      });

      return { success: true };
    }),

  // 10. Bulk Hard Delete Accounts (ADMIN) — Partial purge with blocked report
  bulkHardDelete: adminProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        forcePurgeHistoricalData: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targets = await ctx.prismaRaw.tiktokAccount.findMany({
        where: { id: { in: input.ids }, deletedAt: { not: null } },
        include: {
          analytics: true,
          _count: { select: { dailyRevenues: true, checklistItems: true } },
        },
      });

      const purgeable: typeof targets = [];
      const blocked: Array<{ id: string; username: string }> = [];

      for (const t of targets) {
        const hasHistory =
          t._count.dailyRevenues > 0 ||
          t._count.checklistItems > 0 ||
          (t.analytics &&
            (Number((t.analytics as any)?.sumRevenue?.totalRevenue ?? 0) > 0 ||
              (Array.isArray((t.analytics as any)?.postRewards) &&
                (t.analytics as any).postRewards.length > 0)));

        if (hasHistory && !input.forcePurgeHistoricalData) {
          blocked.push({ id: t.id, username: t.username });
        } else {
          purgeable.push(t);
        }
      }

      if (purgeable.length === 0) {
        return { purgedCount: 0, blockedCount: blocked.length, blockedAccounts: blocked };
      }

      const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

      await ctx.prismaRaw.$transaction(async (tx: any) => {
        await tx.systemAuditLog.createMany({
          data: purgeable.map((t) => ({
            actorId: ctx.session.user.id,
            actorName,
            action: "BULK_HARD_DELETE",
            entityType: "TiktokAccount",
            entityId: t.id,
            entityLabel: t.username,
            snapshot: {
              username: t.username,
              country: t.country,
              status: t.status,
              assignedUserId: t.assignedUserId,
              totalRevenue: resolveAllTimeRevenue(t as any),
              totalVideos: t.totalVideos ?? 0,
              totalFollowers: t.totalFollowers ?? 0,
              lastSyncedAt: t.lastSyncedAt?.toISOString() ?? null,
              dailyRevenueCount: t._count.dailyRevenues,
              checklistItemCount: t._count.checklistItems,
              hasMeaningfulAnalytics: !!t.analytics,
            } satisfies AccountPurgeSnapshot,
          })),
        });

        const res = await tx.tiktokAccount.deleteMany({
          where: { id: { in: purgeable.map((t) => t.id) }, deletedAt: { not: null } },
        });
        if (res.count !== purgeable.length) {
          throw new TRPCError({ code: "CONFLICT", message: "One or more accounts changed state. Retry." });
        }
      });

      return {
        purgedCount: purgeable.length,
        blockedCount: blocked.length,
        blockedAccounts: blocked,
      };
    }),

  // 11. Toggle Lock Assignment (LEAD / ADMIN)
  toggleLockAssignment: leadProcedure
    .input(
      z.object({
        id: z.string(),
        isLocked: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.prisma.tiktokAccount.updateMany({
        where: { id: input.id, deletedAt: null },
        data: { isAssignmentLocked: input.isLocked },
      });
      if (res.count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

      const updated = await ctx.prisma.tiktokAccount.findFirst({
        where: { id: input.id },
      });

      await ctx.prisma.accountLog.create({
        data: {
          accountId: input.id,
          newStatus: updated?.status ?? "ACTIVE",
          logType: "STATUS_CHANGE",
          message: input.isLocked
            ? `[KHÓA PHÂN CÔNG] Quản trị viên ${ctx.session.user.name || "Admin"} đã khóa phân công tài khoản này.`
            : `[MỞ KHÓA PHÂN CÔNG] Quản trị viên ${ctx.session.user.name || "Admin"} đã mở khóa, cho phép chuyển giao tự động.`,
          actorName: ctx.session.user.name || ctx.session.user.email || "Admin",
        },
      });

      return { success: true, isAssignmentLocked: updated?.isAssignmentLocked ?? input.isLocked };
    }),

  // 12. Get Account Logs
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

  // 13. Sync Account with Live TikTok Studio Scraper (Targeted Single Profile)
  syncAccount: protectedProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.tiktokAccount.findFirst({
        where: { id: input.accountId, deletedAt: null },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      // Enqueue sync job in SyncQueue scoped specifically to THIS profile & account
      const targetUserId = account.assignedUserId || ctx.session.user.id;
      const targetScope = `USER:${targetUserId}|PROFILE:${account.gpmProfileId || ""}|HANDLE:${account.username || ""}`;
      try {
        await ctx.prisma.syncQueue.create({
          data: {
            requestedById: ctx.session.user.id,
            status: "PENDING",
            targetScope,
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
          analytics: true,
        },
      });

      return {
        account: serializeBigInt(updated),
        queued: true,
      };
    }),

  // 14. Stop Sync for a specific account or user's active jobs
  stopSyncAccount: protectedProcedure
    .input(z.object({ accountId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const isLeadOrAdmin = ctx.session.user.role === "ADMIN" || ctx.session.user.role === "LEAD";
      const whereClause: any = {
        status: { in: ["PENDING", "PROCESSING"] },
      };

      if (input.accountId) {
        const account = await ctx.prismaRaw.tiktokAccount.findUnique({
          where: { id: input.accountId },
          select: { gpmProfileId: true, username: true, assignedUserId: true },
        });
        if (account) {
          const accountMatches: any[] = [];
          if (account.gpmProfileId) {
            accountMatches.push({ targetScope: { contains: `PROFILE:${account.gpmProfileId}` } });
            accountMatches.push({ targetScope: { contains: account.gpmProfileId } });
          }
          if (account.username) {
            accountMatches.push({ targetScope: { contains: `HANDLE:${account.username}` } });
            accountMatches.push({ targetScope: { contains: account.username } });
          }

          if (accountMatches.length > 0) {
            whereClause.OR = accountMatches;
          }

          if (!isLeadOrAdmin && account.assignedUserId !== ctx.session.user.id) {
            whereClause.requestedById = ctx.session.user.id;
          }
        }
      } else {
        whereClause.OR = [
          { requestedById: ctx.session.user.id },
          { targetScope: `USER:${ctx.session.user.id}` },
          { targetScope: ctx.session.user.id },
          { targetScope: { startsWith: `USER:${ctx.session.user.id}|` } },
        ];
      }

      const actorName = ctx.session.user.name || ctx.session.user.email || "Người dùng";
      const updated = await ctx.prisma.syncQueue.updateMany({
        where: whereClause,
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          errorMessage: `Đã dừng bởi ${actorName}`,
        },
      });

      return { success: true, count: updated.count };
    }),

  // 15. Resolve Alert
  resolveAlert: protectedProcedure
    .input(z.object({ alertId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const alert = await ctx.prisma.accountAlert.findFirst({
        where: { id: input.alertId, account: { deletedAt: null } },
      });
      if (!alert) throw new TRPCError({ code: "FORBIDDEN", message: "Account is in Trash." });

      const updated = await ctx.prisma.accountAlert.update({
        where: { id: input.alertId },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });
      return updated;
    }),

  // 16. Add Manual Audit Log / Note
  addLog: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        message: z.string().min(1),
        logType: z.string().default("NOTE"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === "ADMIN";
      const account = await ctx.prismaRaw.tiktokAccount.findUnique({
        where: { id: input.accountId },
        select: { id: true, deletedAt: true },
      });
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });
      if (account.deletedAt && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admin can log notes on trashed accounts.",
        });
      }

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

  // 17. Bulk Update Status (LEAD / ADMIN)
  bulkUpdateStatus: leadProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        status: z.enum(["ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.prisma.tiktokAccount.updateMany({
        where: { id: { in: input.ids }, deletedAt: null },
        data: { status: input.status },
      });
      return { count: res.count };
    }),

  // 18. Bulk Assign Staff (LEAD / ADMIN)
  bulkAssign: leadProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        assignedUserId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.prisma.tiktokAccount.updateMany({
        where: { id: { in: input.ids }, deletedAt: null },
        data: { assignedUserId: input.assignedUserId },
      });

      await recordBulkAccountTransfer(ctx.prismaRaw, {
        accountIds: input.ids,
        newUserId: input.assignedUserId,
        transferredBy: ctx.session.user.name || ctx.session.user.email || "Lead",
        reason: "Bulk assign",
      });

      // Reconcile checklist for target assignee if present
      if (input.assignedUserId) {
        await reconcileAfterCommit(ctx.prismaRaw as any, input.assignedUserId, "bulkAssign");
      }

      return { count: res.count };
    }),
});

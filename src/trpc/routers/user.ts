import { router, publicProcedure, protectedProcedure, leadProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { clearUserCache } from "@/lib/auth";
import {
  generatePersonalToken,
  persistPersonalTokenValue,
  revealPersonalToken,
  writeMachineBindingLog,
} from "@/lib/extension-auth";
import { isAccountOnline } from "@/lib/account-status";
import {
  resolveAllTimeRevenue,
  resolvePeriodRevenue,
} from "@/lib/resolve-all-time-revenue";
import { insightViewsContribution } from "@/lib/insights-ui";

function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

export const userRouter = router({
  // 1. Get current logged-in user profile
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        image: true,
        phone: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        lastActiveAt: true,
        extensionToken: true,
        extensionAccessEnabled: true,
        extensionRevokedAt: true,
        boundMachineId: true,
        boundMachineName: true,
        boundOsUser: true,
        boundMachineAt: true,
        groupId: true,
        group: {
          select: { id: true, name: true, color: true },
        },
        password: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const { password, ...safeUser } = user;
    return {
      ...safeUser,
      extensionToken: revealPersonalToken(user.extensionToken),
      hasExtensionToken: Boolean(user.extensionToken),
      hasPassword: Boolean(password),
    };
  }),

  // 2. Update self profile (name, username, avatar, phone)
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        username: z.string().min(3, "Username tối thiểu 3 ký tự").optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        avatar: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check username uniqueness if changing
      if (input.username) {
        const cleanUsername = input.username.trim().toLowerCase();
        const existing = await ctx.prisma.user.findFirst({
          where: {
            username: cleanUsername,
            NOT: { id: ctx.session.user.id },
          },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Username này đã được sử dụng bởi thành viên khác.",
          });
        }
      }

      const updated = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          ...input,
          image: input.avatar !== undefined ? input.avatar : undefined,
          username: input.username ? input.username.trim().toLowerCase() : undefined,
        },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
        },
      });

      clearUserCache(ctx.session.user.id);
      return updated;
    }),

  // 2b. Secure Password Update
  updatePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().optional(),
        newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { id: true, password: true },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy người dùng.",
        });
      }

      // If user currently has a password, verify it
      if (user.password) {
        if (!input.currentPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vui lòng nhập mật khẩu hiện tại.",
          });
        }
        const isMatch = await bcrypt.compare(input.currentPassword, user.password);
        if (!isMatch) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Mật khẩu hiện tại không chính xác.",
          });
        }
      }

      // Hash new password securely with bcrypt (10 rounds)
      const hashedPassword = await bcrypt.hash(input.newPassword, 10);

      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      clearUserCache(user.id);

      return {
        success: true,
        message: "Mật khẩu đã được thay đổi thành công.",
      };
    }),

  // 2c. Self-service Personal Token Regeneration
  regenerateToken: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { id: true, extensionAccessEnabled: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tài khoản của bạn đã bị khóa.",
      });
    }

    if (user.extensionAccessEnabled === false) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Quyền sử dụng Token của bạn đã bị Quản trị viên vô hiệu hóa.",
      });
    }

    const newToken = generatePersonalToken();
    await ctx.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          extensionToken: persistPersonalTokenValue(newToken),
          extensionSessionVersion: { increment: 1 },
        },
      });
      await tx.extensionRefreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.extensionPairingCode.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
    });

    return { token: newToken };
  }),

  // 3. List all staff / operators for account assignment
  listStaff: protectedProcedure.query(async ({ ctx }) => {
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
        email: true,
        avatar: true,
        role: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username || u.email.split("@")[0],
      fullName: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.email,
      email: u.email,
      avatar: u.avatar,
      role: u.role,
    }));
  }),

  // 4. Get User Detail with all assigned TikTok accounts & checklist history
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        days: z.number().optional().default(0),
        startDate: z.string().optional(), // yyyy-MM-dd custom range
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (
        ctx.session.user.role === "STAFF" &&
        ctx.session.user.id !== input.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only view your own staff profile",
        });
      }

      const hasCustomRange = Boolean(input.startDate && input.endDate);
      // Legacy days=0 (Toàn Bộ) → 365 (Studio daily data capped at 365 days)
      const days = hasCustomRange ? 0 : input.days && input.days > 0 ? input.days : 365;

      let rangeStart: Date | null = null;
      let rangeEnd: Date | null = null;
      let rangeStartStr = "";
      let rangeEndStr = "";
      if (hasCustomRange) {
        rangeStart = new Date(input.startDate! + "T00:00:00.000Z");
        rangeEnd = new Date(input.endDate! + "T00:00:00.000Z");
        if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Khoảng ngày không hợp lệ",
          });
        }
        if (rangeStart > rangeEnd) {
          const tmp = rangeStart;
          rangeStart = rangeEnd;
          rangeEnd = tmp;
        }
        // Cap at 365 calendar-day span (same rule as the date picker UI)
        const dayMs = 24 * 60 * 60 * 1000;
        const spanDays = Math.round(
          (rangeEnd.getTime() - rangeStart.getTime()) / dayMs
        );
        if (spanDays > 365) {
          rangeEnd = new Date(rangeStart.getTime() + 365 * dayMs);
        }
        rangeStartStr = rangeStart.toISOString().split("T")[0];
        rangeEndStr = rangeEnd.toISOString().split("T")[0];
        // Inclusive end-of-day for checklist / DailyRevenue filters
        rangeEnd = new Date(rangeEndStr + "T23:59:59.999Z");
      }

      const checklistTake = hasCustomRange
        ? Math.min(
            Math.ceil(
              (rangeEnd!.getTime() - rangeStart!.getTime()) / (24 * 60 * 60 * 1000)
            ) + 10,
            400
          )
        : days > 0
          ? days + 5
          : 100;

      const user = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        include: {
          tiktokAccounts: {
            orderBy: { createdAt: "desc" },
            include: {
              alerts: { where: { status: "OPEN" } },
              analytics: {
                select: {
                  sumRevenue: true,
                  sumViews: true,
                  postRewards: true,
                  rawSnapshot: true,
                  dailyRevenueBreakdown: true,
                  dailyViewsBreakdown: true,
                },
              },
            },
          },
          dailyChecklists: {
            orderBy: { date: "desc" },
            take: checklistTake,
            include: {
              items: {
                include: { account: true },
              },
            },
          },
        },
      });

      if (!user || user.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const totalAssigned = user.tiktokAccounts.length;
      const activeAccounts = user.tiktokAccounts.filter((a) => a.status === "ACTIVE").length;
      const warmingAccounts = user.tiktokAccounts.filter((a) => a.status === "WARMING").length;
      const restrictedAccounts = user.tiktokAccounts.filter((a) => a.status === "RESTRICTED" || a.status === "BANNED").length;

      const totalFollowers = user.tiktokAccounts.reduce(
        (sum, a) => sum + (a.totalFollowers || 0),
        0
      );

      // Filter checklists by selected time window
      let filteredChecklists = user.dailyChecklists;
      if (hasCustomRange && rangeStart && rangeEnd) {
        filteredChecklists = user.dailyChecklists.filter((c) => {
          const d = new Date(c.date);
          return d >= rangeStart! && d <= rangeEnd!;
        });
      } else if (days > 0) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - days);
        filteredChecklists = user.dailyChecklists.filter(
          (c) => new Date(c.date) >= pastDate
        );
      }

      // Workdays score sum for selected window
      const periodWorkdays = filteredChecklists.reduce(
        (sum, c) => sum + Number(c.workdayScore || 0),
        0
      );

      const avgCompletionRate =
        filteredChecklists.length > 0
          ? Math.round(
            (filteredChecklists.reduce((sum, c) => sum + Number(c.completionRate || 0), 0) /
              filteredChecklists.length) *
            10
          ) / 10
          : 0;

      // Calculate revenue & views for the window
      let totalViews = 0;
      let totalRevenue = 0;
      const accountDisplayRevenue = new Map<string, number>();

      if (!hasCustomRange && days <= 0) {
        for (const a of user.tiktokAccounts) {
          const rev = resolveAllTimeRevenue(a as any);
          accountDisplayRevenue.set(a.id, rev);
          totalRevenue += rev;
          const v = insightViewsContribution(
            a.analytics as any,
            Number(a.totalViews ?? 0),
            (sv) => Number(sv?.totalViews ?? a.totalViews ?? 0)
          );
          totalViews += v ?? 0;
        }
      } else {
        const accountIds = user.tiktokAccounts.map((a) => a.id);
        let pastDate: Date;
        let pastStr: string;
        let endStr: string | null = null;

        if (hasCustomRange && rangeStart && rangeEnd) {
          pastDate = new Date(rangeStart);
          pastDate.setUTCHours(0, 0, 0, 0);
          pastStr = rangeStartStr;
          endStr = rangeEndStr;
        } else {
          pastDate = new Date();
          pastDate.setUTCHours(0, 0, 0, 0);
          pastDate.setUTCDate(pastDate.getUTCDate() - days);
          pastStr = pastDate.toISOString().split("T")[0];
        }

        const periodRevenues =
          accountIds.length > 0
            ? await ctx.prisma.dailyRevenue.findMany({
                where: {
                  accountId: { in: accountIds },
                  date: hasCustomRange && rangeEnd
                    ? { gte: pastDate, lte: rangeEnd }
                    : { gte: pastDate },
                },
                select: { accountId: true, date: true, revenue: true, views: true },
              })
            : [];

        const dailyByAccount = new Map<
          string,
          { revenue: number; views: number; keys: Set<string> }
        >();
        for (const id of accountIds) {
          dailyByAccount.set(id, { revenue: 0, views: 0, keys: new Set() });
        }
        for (const r of periodRevenues) {
          const entry = dailyByAccount.get(r.accountId);
          if (!entry) continue;
          const dStr = r.date.toISOString().split("T")[0];
          entry.keys.add(dStr);
          entry.revenue += Number(r.revenue || 0);
          entry.views += Number(r.views || 0);
        }

        for (const a of user.tiktokAccounts) {
          const entry = dailyByAccount.get(a.id) || {
            revenue: 0,
            views: 0,
            keys: new Set<string>(),
          };
          const breakdown =
            (a.analytics?.dailyRevenueBreakdown as any[]) ||
            ((a.analytics as any)?.dailyBreakdown as any[]) ||
            [];
          if (Array.isArray(breakdown)) {
            for (const item of breakdown) {
              if (!item?.date) continue;
              const dStr = String(item.date);
              if (dStr < pastStr) continue;
              if (endStr && dStr > endStr) continue;
              if (entry.keys.has(dStr)) continue;
              entry.keys.add(dStr);
              entry.revenue += Number(item.revenue || 0);
              entry.views += Number(item.views || 0);
            }
          }

          // Custom range: use merged daily only (no Studio presets).
          // Preset windows: merge daily + Studio sumRevenue buckets.
          const accountRev = hasCustomRange
            ? entry.revenue
            : resolvePeriodRevenue(a as any, days, entry.revenue);
          accountDisplayRevenue.set(a.id, accountRev);
          totalRevenue += accountRev;

          const sv = (a.analytics?.sumViews ?? {}) as Record<string, unknown>;
          let presetViews = 0;
          if (!hasCustomRange) {
            if (days === 7) presetViews = Number(sv.views7d ?? 0) || 0;
            else if (days === 28 || days === 30) presetViews = Number(sv.views28d ?? 0) || 0;
            else if (days === 60) presetViews = Number(sv.views60d ?? 0) || 0;
            else if (days === 365) presetViews = Number(sv.views365d ?? 0) || 0;
          }
          const contrib = insightViewsContribution(
            a.analytics as any,
            entry.views,
            () => Math.max(entry.views, presetViews)
          );
          totalViews += contrib ?? Math.max(entry.views, presetViews);
        }
      }

      return serializeBigInt({
        user: {
          id: user.id,
          email: user.email,
          username: user.username || user.email.split("@")[0],
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName:
            user.name ||
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            user.username ||
            user.email,
          avatar: user.avatar,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          lastActiveAt: user.lastActiveAt,
          boundMachineId: user.boundMachineId,
          boundMachineName: user.boundMachineName,
        },
        stats: {
          days: hasCustomRange
            ? Math.ceil(
                (rangeEnd!.getTime() - rangeStart!.getTime()) / (24 * 60 * 60 * 1000)
              ) + 1
            : days,
          startDate: hasCustomRange ? rangeStartStr : null,
          endDate: hasCustomRange ? rangeEndStr : null,
          isCustomRange: hasCustomRange,
          totalAssigned,
          activeAccounts,
          warmingAccounts,
          restrictedAccounts,
          totalViews,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalFollowers,
          monthlyWorkdays: periodWorkdays,
          avgCompletionRate,
          checklistsCount: filteredChecklists.length,
        },
        tiktokAccounts: (user.tiktokAccounts || []).map((acc) => ({
          ...acc,
          isOnline: isAccountOnline(acc),
          displayRevenue:
            Math.round(
              (accountDisplayRevenue.get(acc.id) ??
                resolveAllTimeRevenue(acc as any)) * 100
            ) / 100,
        })),
        dailyChecklists: filteredChecklists,
      });
    }),

  requestMachineChange: protectedProcedure
    .input(z.object({ reason: z.string().min(5).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          boundMachineId: true,
          boundMachineName: true,
          boundOsUser: true,
        },
      });
      if (!user?.boundMachineId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tài khoản chưa gắn máy.",
        });
      }
      const pending = await ctx.prisma.machineChangeRequest.findFirst({
        where: { userId: user.id, status: "PENDING" },
      });
      if (pending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Đã có yêu cầu đang chờ duyệt.",
        });
      }

      const COOLDOWN_MS = 15 * 60 * 1000;
      const DAY_MS = 24 * 60 * 60 * 1000;
      const recent = await ctx.prisma.machineChangeRequest.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
      if (recent && Date.now() - new Date(recent.createdAt).getTime() < COOLDOWN_MS) {
        const mins = Math.ceil(
          (COOLDOWN_MS - (Date.now() - new Date(recent.createdAt).getTime())) / 60000
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Vui lòng chờ ${mins} phút trước khi gửi yêu cầu đổi máy mới (chống spam).`,
        });
      }
      const dayCount = await ctx.prisma.machineChangeRequest.count({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - DAY_MS) },
        },
      });
      if (dayCount >= 5) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Bạn đã gửi quá nhiều yêu cầu đổi máy trong 24 giờ. Thử lại sau.",
        });
      }

      const row = await ctx.prisma.machineChangeRequest.create({
        data: {
          userId: user.id,
          reason: input.reason,
          fromMachineId: user.boundMachineId,
          fromMachineName: user.boundMachineName,
          fromOsUsername: user.boundOsUser,
          status: "PENDING",
        },
      });
      await writeMachineBindingLog(ctx.prisma, {
        userId: user.id,
        action: "CHANGE_REQUESTED",
        machineId: user.boundMachineId,
        machineName: user.boundMachineName,
        osUsername: user.boundOsUser,
        reason: input.reason,
        actorUserId: user.id,
      });
      return row;
    }),

  myMachineChangeRequest: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.machineChangeRequest.findFirst({
      where: { userId: ctx.session.user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
  }),

  requestExtensionAccess: protectedProcedure
    .input(z.object({ reason: z.string().min(5).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          extensionAccessEnabled: true,
          deletedAt: true,
          isActive: true,
        },
      });
      if (!user || user.deletedAt || !user.isActive) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tài khoản không hợp lệ.",
        });
      }
      if (user.extensionAccessEnabled !== false) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Quyền Extension đang hoạt động — không cần gửi yêu cầu.",
        });
      }
      const pending = await ctx.prisma.extensionAccessRequest.findFirst({
        where: { userId: user.id, status: "PENDING" },
      });
      if (pending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Đã có yêu cầu kích hoạt Extension đang chờ duyệt.",
        });
      }

      const COOLDOWN_MS = 15 * 60 * 1000;
      const DAY_MS = 24 * 60 * 60 * 1000;
      const recent = await ctx.prisma.extensionAccessRequest.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
      if (recent && Date.now() - new Date(recent.createdAt).getTime() < COOLDOWN_MS) {
        const mins = Math.ceil(
          (COOLDOWN_MS - (Date.now() - new Date(recent.createdAt).getTime())) / 60000
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Vui lòng chờ ${mins} phút trước khi gửi yêu cầu kích hoạt mới (chống spam).`,
        });
      }
      const dayCount = await ctx.prisma.extensionAccessRequest.count({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - DAY_MS) },
        },
      });
      if (dayCount >= 5) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Bạn đã gửi quá nhiều yêu cầu kích hoạt trong 24 giờ. Thử lại sau.",
        });
      }

      return ctx.prisma.extensionAccessRequest.create({
        data: {
          userId: user.id,
          reason: input.reason,
          status: "PENDING",
        },
      });
    }),

  /** List current user's own requests (for Settings). */
  listMyRequests: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [machineChangeRequests, extensionAccessRequests] = await Promise.all([
      ctx.prisma.machineChangeRequest.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      ctx.prisma.extensionAccessRequest.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return { machineChangeRequests, extensionAccessRequests };
  }),

  myExtensionAccessRequest: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.extensionAccessRequest.findFirst({
      where: { userId: ctx.session.user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
  }),

  /** List machine + extension requests for a user (self or admin). */
  listRequestsForUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === "ADMIN";
      if (!isAdmin && ctx.session.user.id !== input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn chỉ xem được yêu cầu của chính mình.",
        });
      }

      const [machineChangeRequests, extensionAccessRequests] = await Promise.all([
        ctx.prisma.machineChangeRequest.findMany({
          where: { userId: input.userId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        ctx.prisma.extensionAccessRequest.findMany({
          where: { userId: input.userId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);

      return { machineChangeRequests, extensionAccessRequests };
    }),

  deleteMachineChangeRequest: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.prisma.machineChangeRequest.findUnique({
        where: { id: input.requestId },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy yêu cầu." });
      }
      const isAdmin = ctx.session.user.role === "ADMIN";
      if (!isAdmin && row.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn chỉ xóa được yêu cầu của chính mình.",
        });
      }
      await ctx.prisma.machineChangeRequest.delete({ where: { id: row.id } });
      return { success: true };
    }),

  deleteExtensionAccessRequest: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.prisma.extensionAccessRequest.findUnique({
        where: { id: input.requestId },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy yêu cầu." });
      }
      const isAdmin = ctx.session.user.role === "ADMIN";
      if (!isAdmin && row.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn chỉ xóa được yêu cầu của chính mình.",
        });
      }
      await ctx.prisma.extensionAccessRequest.delete({ where: { id: row.id } });
      return { success: true };
    }),
});

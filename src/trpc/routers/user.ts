import { router, publicProcedure, protectedProcedure, leadProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

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
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return user;
  }),

  // 2. Update self profile
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        avatar: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          ...input,
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

      return updated;
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

      const days = input.days;
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        include: {
          tiktokAccounts: {
            orderBy: { createdAt: "desc" },
            include: {
              alerts: { where: { status: "OPEN" } },
            },
          },
          dailyChecklists: {
            orderBy: { date: "desc" },
            take: days > 0 ? days + 5 : 100,
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
      if (days > 0) {
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
      let totalViews = user.tiktokAccounts.reduce(
        (sum, a) => sum + Number(a.totalViews || 0),
        0
      );
      let totalRevenue = user.tiktokAccounts.reduce(
        (sum, a) => sum + Number(a.totalRevenue || 0),
        0
      );

      if (days > 0) {
        const accountIds = user.tiktokAccounts.map((a) => a.id);
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - days);

        const periodRevenues = await ctx.prisma.dailyRevenue.findMany({
          where: {
            accountId: { in: accountIds },
            date: { gte: pastDate },
          },
        });

        if (periodRevenues.length > 0) {
          totalRevenue = periodRevenues.reduce(
            (sum, r) => sum + Number(r.revenue || 0),
            0
          );
          totalViews = periodRevenues.reduce(
            (sum, r) => sum + Number(r.views || 0),
            0
          );
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
        },
        stats: {
          days,
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
        tiktokAccounts: user.tiktokAccounts,
        dailyChecklists: filteredChecklists,
      });
    }),
});

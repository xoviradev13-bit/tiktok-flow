import { router, protectedProcedure, adminProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

export const extensionRouter = router({
  // 1. List all available extensions (all logged in users)
  list: protectedProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          search: z.string().optional(),
          sortBy: z.enum(["name", "version", "createdAt", "category"]).optional().default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { category, search, sortBy = "createdAt", sortOrder = "desc" } = input || {};

      const where: any = {
        isActive: true,
      };

      if (category && category !== "ALL") {
        where.category = category;
      }

      if (search && search.trim()) {
        const q = search.trim();
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { shortDesc: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ];
      }

      const extensions = await ctx.prisma.extension.findMany({
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          _count: {
            select: { installations: true },
          },
          installations: {
            where: { userId: ctx.session.user.id },
            take: 1,
          },
        },
      });

      return extensions.map((ext) => ({
        ...ext,
        totalInstalls: ext._count.installations,
        userInstallation: ext.installations[0] || null,
      }));
    }),

  // 2. Get details of a single extension by ID or Slug
  getById: protectedProcedure
    .input(z.object({ idOrSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const extension = await ctx.prisma.extension.findFirst({
        where: {
          OR: [{ id: input.idOrSlug }, { slug: input.idOrSlug }],
        },
        include: {
          _count: {
            select: { installations: true },
          },
          installations: {
            where: { userId: ctx.session.user.id },
            take: 1,
          },
        },
      });

      if (!extension) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy tiện ích mở rộng.",
        });
      }

      // Fetch user's personal token and permission status
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          extensionToken: true,
          extensionAccessEnabled: true,
          extensionRevokedAt: true,
          lastActiveAt: true,
        },
      });

      return {
        ...extension,
        totalInstalls: extension._count.installations,
        userInstallation: extension.installations[0] || null,
        userToken: user?.extensionToken || null,
        accessEnabled: user?.extensionAccessEnabled ?? true,
        revokedAt: user?.extensionRevokedAt || null,
        lastActiveAt: user?.lastActiveAt || null,
      };
    }),

  // 3. Self-service Regenerate Token (Member can only do this if access is NOT revoked)
  regenerateMyToken: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        extensionAccessEnabled: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tài khoản của bạn đã bị tạm khóa.",
      });
    }

    if (user.extensionAccessEnabled === false) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Quyền Extension của bạn đã bị Quản trị viên vô hiệu hóa. Bạn không thể tự tạo lại Token.",
      });
    }

    const newToken = `ttf_sec_${crypto.randomBytes(16).toString("hex")}`;
    await ctx.prisma.user.update({
      where: { id: user.id },
      data: {
        extensionToken: newToken,
        extensionAccessEnabled: true,
      },
    });

    return {
      token: newToken,
    };
  }),

  // 4. Admin Create / Update Extension
  upsert: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        slug: z.string(),
        name: z.string(),
        version: z.string().default("1.0.0"),
        category: z.string().default("AUTOMATION"),
        shortDesc: z.string().optional(),
        description: z.string().optional(),
        changelog: z.string().optional(),
        folderPath: z.string().optional().default("extension"),
        downloadUrl: z.string().optional(),
        supportedBrowsers: z.array(z.string()).optional(),
        permissions: z.array(z.string()).optional(),
        isActive: z.boolean().optional().default(true),
        isFeatured: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (id) {
        return await ctx.prisma.extension.update({
          where: { id },
          data,
        });
      }

      return await ctx.prisma.extension.upsert({
        where: { slug: input.slug },
        create: data,
        update: data,
      });
    }),
});

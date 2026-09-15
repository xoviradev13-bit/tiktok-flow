import { router, protectedProcedure, adminProcedure } from "@/trpc/init";
import { z } from "zod";

export const settingsRouter = router({
  // 1. Get all system configs (Lead/Admin gets all, Staff gets safe configs only)
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const isLeadOrAdmin = ctx.session.user.role === "ADMIN" || ctx.session.user.role === "LEAD";
    const configs = await ctx.prisma.systemConfig.findMany({
      where: isLeadOrAdmin
        ? undefined
        : { key: { in: ["scoring_rules", "app_theme", "app_version", "sync_schedule"] } },
    });
    const configMap: Record<string, any> = {};
    for (const c of configs) {
      try {
        configMap[c.key] = JSON.parse(c.value);
      } catch {
        configMap[c.key] = c.value;
      }
    }
    return configMap;
  }),

  // 2. Get single config by key
  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      const config = await ctx.prisma.systemConfig.findUnique({
        where: { key: input.key },
      });
      if (!config) return null;
      try {
        return JSON.parse(config.value);
      } catch {
        return config.value;
      }
    }),

  // 3. Set config (ADMIN)
  set: adminProcedure
    .input(
      z.object({
        key: z.string(),
        value: z.any(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stringified =
        typeof input.value === "string"
          ? input.value
          : JSON.stringify(input.value);

      const saved = await ctx.prisma.systemConfig.upsert({
        where: { key: input.key },
        create: {
          key: input.key,
          value: stringified,
          description: input.description,
        },
        update: {
          value: stringified,
          description: input.description,
        },
      });

      return saved;
    }),
});

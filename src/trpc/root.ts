import { router } from "@/trpc/init";
import { userRouter } from "@/trpc/routers/user";
import { accountsRouter } from "@/trpc/routers/accounts";
import { checklistRouter } from "@/trpc/routers/checklist";
import { revenueRouter } from "@/trpc/routers/revenue";
import { leaderboardRouter } from "@/trpc/routers/leaderboard";
import { gpmRouter } from "@/trpc/routers/gpm";
import { settingsRouter } from "@/trpc/routers/settings";
import { adminRouter } from "@/trpc/routers/admin";

export const appRouter = router({
  user: userRouter,
  accounts: accountsRouter,
  checklist: checklistRouter,
  revenue: revenueRouter,
  leaderboard: leaderboardRouter,
  gpm: gpmRouter,
  settings: settingsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;

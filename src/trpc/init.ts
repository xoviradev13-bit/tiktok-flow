import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const createContext = async () => {
  const session = await auth();
  return {
    session,
    prisma,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof Error ? error.cause.message : null,
      },
    };
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

// 1. Authenticated User (Any valid logged in staff, lead, admin)
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action.",
    });
  }

  // Check if user is active in database
  const currentUser = await ctx.prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { isActive: true },
  });

  if (currentUser && !currentUser.isActive) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Tài khoản của bạn đã bị quản trị viên chặn quyền truy cập.",
    });
  }

  const role = String((ctx.session.user as any).role || (ctx.session.user as any).userType || "STAFF").toUpperCase();

  return next({
    ctx: {
      ...ctx,
      session: {
        ...ctx.session,
        user: {
          ...ctx.session.user,
          id: ctx.session.user.id,
          role,
        },
      },
    },
  });
});

// 2. Team Lead or Admin
export const leadProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const role = ctx.session.user.role;
  if (role !== "LEAD" && role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only Team Leads or Admins are allowed to perform this operation.",
    });
  }
  return next({ ctx });
});

// 3. Admin Only
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const role = ctx.session.user.role;
  if (role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin privileges required for this action.",
    });
  }
  return next({ ctx });
});

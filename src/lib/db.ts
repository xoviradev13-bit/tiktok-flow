import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/** Bump when AccountAnalytics (or other) schema fields change so the Next.js
 *  global singleton does not keep a stale PrismaClient that rejects new args
 *  (e.g. Unknown argument `dailyViewsBreakdown`). */
const PRISMA_CLIENT_REV = 5;

type SoftDeletePrismaClient = ReturnType<typeof createSoftDeleteClient>;

const globalForPrisma = globalThis as unknown as {
  prismaRaw: PrismaClient | undefined;
  prisma: SoftDeletePrismaClient | undefined;
  prismaRev: number | undefined;
  pool: Pool | undefined;
};

if (
  globalForPrisma.prismaRaw &&
  globalForPrisma.prismaRev !== PRISMA_CLIENT_REV
) {
  void globalForPrisma.prismaRaw.$disconnect().catch(() => {});
  globalForPrisma.prismaRaw = undefined;
  globalForPrisma.prisma = undefined;
}

const connectionString =
  process.env.DATABASE_URL || process.env.DIRECT_URL || "";

// Prefer Supabase Transaction Pooler (DATABASE_URL on port 6543) for runtime queries.
// Use a balanced pool capacity (15) so concurrent operations (NextAuth, Extension reports,
// GPM background sync) do not starve the pool while keeping memory and connections stable.
const poolMax = Number(process.env.PG_POOL_MAX || 15);
const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString,
    ssl:
      connectionString.includes("localhost") ||
      connectionString.includes("sslmode=disable") ||
      connectionString.includes("supabase-db") ||
      process.env.PG_SSL === "false"
        ? undefined
        : { rejectUnauthorized: false },
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 30_000),
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

pool.on("error", (err) => {
  console.error("[pg pool] idle client error:", err.message);
});

if (process.env.NODE_ENV !== "production") globalForPrisma.pool = pool;

const adapter = new PrismaPg(pool);

// ─── 1. Base client (no extension) — sees ALL rows including Trash ───
export const prismaRaw =
  globalForPrisma.prismaRaw ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaRaw = prismaRaw;
  globalForPrisma.prismaRev = PRISMA_CLIENT_REV;
}

// ─── 2. Extension helper ───
function shouldInjectSoftDeleteFilter(where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  if (!("deletedAt" in where)) return true;
  if (where.deletedAt === undefined) return true;
  return false;
}

function createSoftDeleteClient(base: PrismaClient) {
  return base.$extends({
    name: "softDelete",
    query: {
      tiktokAccount: {
        async findMany({ args, query }) {
          if (shouldInjectSoftDeleteFilter(args.where as Record<string, unknown> | undefined)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          if (shouldInjectSoftDeleteFilter(args.where as Record<string, unknown> | undefined)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
        async count({ args, query }) {
          if (shouldInjectSoftDeleteFilter(args.where as Record<string, unknown> | undefined)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
        async groupBy({ args, query }) {
          if (shouldInjectSoftDeleteFilter(args.where as Record<string, unknown> | undefined)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
        async aggregate({ args, query }) {
          if (shouldInjectSoftDeleteFilter(args.where as Record<string, unknown> | undefined)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
      },
    },
  });
}

// ─── 3. Extended client — hides Trash by default ───
export const prisma: SoftDeletePrismaClient =
  globalForPrisma.prisma ?? createSoftDeleteClient(prismaRaw);

export type { SoftDeletePrismaClient };

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

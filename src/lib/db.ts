import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/** Bump when AccountAnalytics (or other) schema fields change so the Next.js
 *  global singleton does not keep a stale PrismaClient that rejects new args
 *  (e.g. Unknown argument `dailyViewsBreakdown`). */
const PRISMA_CLIENT_REV = 3;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaRev: number | undefined;
  pool: Pool | undefined;
};

if (
  globalForPrisma.prisma &&
  globalForPrisma.prismaRev !== PRISMA_CLIENT_REV
) {
  void globalForPrisma.prisma.$disconnect().catch(() => {});
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
    ssl: connectionString.includes("localhost")
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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaRev = PRISMA_CLIENT_REV;
}

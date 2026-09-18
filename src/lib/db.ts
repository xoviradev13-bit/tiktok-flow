import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const connectionString =
  process.env.DATABASE_URL || process.env.DIRECT_URL || "";

// Prefer Supabase Transaction Pooler (DATABASE_URL on port 6543) for runtime queries.
// Use a balanced pool capacity (15) so concurrent operations (NextAuth, Extension reports,
// GPM background sync) do not starve the pool while keeping memory and connections stable.
const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString,
    ssl: connectionString.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 15),
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

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

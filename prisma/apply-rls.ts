import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import "dotenv/config";

async function applyRls() {
  const connectionString =
    process.env.DIRECT_URL || process.env.DATABASE_URL || "";

  if (!connectionString) {
    console.error("❌ Error: DIRECT_URL or DATABASE_URL not found in environment.");
    process.exit(1);
  }

  console.log("🔒 Connecting to database to apply Row Level Security (RLS)...");

  const pool = new Pool({
    connectionString,
    ssl:
      connectionString.includes("localhost") ||
      connectionString.includes("sslmode=disable") ||
      connectionString.includes("supabase-db") ||
      process.env.PG_SSL === "false"
        ? undefined
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });

  const client = await pool.connect();

  try {
    const sqlFilePath = path.join(__dirname, "rls.sql");
    const sqlContent = fs.readFileSync(sqlFilePath, "utf-8");

    console.log("📄 Reading prisma/rls.sql...");
    console.log("⚙️  Executing RLS policies migration...");

    await client.query("BEGIN;");
    await client.query(sqlContent);
    await client.query("COMMIT;");

    console.log("✅ Successfully executed prisma/rls.sql!");

    // Query pg_tables to report RLS status for each table in public schema
    const checkResult = await client.query<{
      tablename: string;
      rowsecurity: boolean;
    }>(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename ASC;
    `);

    console.log("\n📊 Public Schema Tables - RLS Status Verification:");
    console.log("─".repeat(50));
    let enabledCount = 0;
    for (const row of checkResult.rows) {
      const statusIcon = row.rowsecurity ? "🛡️  ENABLED " : "⚠️  DISABLED";
      console.log(` ${statusIcon} | ${row.tablename}`);
      if (row.rowsecurity) enabledCount++;
    }
    console.log("─".repeat(50));
    console.log(`🎉 Total tables verified: ${checkResult.rows.length} (${enabledCount} with RLS enabled)\n`);

  } catch (err: any) {
    await client.query("ROLLBACK;").catch(() => {});
    console.error("❌ Failed to apply RLS migration:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyRls().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});

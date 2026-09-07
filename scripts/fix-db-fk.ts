import { Pool } from "pg";
import "dotenv/config";

async function fixForeignKeys() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  console.log("Connecting to Postgres...");
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log("Truncating dependent log & metric tables with invalid foreign keys...");
    await pool.query('TRUNCATE TABLE "account_logs", "account_alerts", "daily_checklist_items", "daily_revenues" CASCADE;');
    console.log("✅ Dependent tables truncated successfully.");
  } catch (err: any) {
    console.warn("⚠️ Direct truncate notice (tables might not exist yet):", err.message);
  } finally {
    await pool.end();
  }
}

fixForeignKeys();

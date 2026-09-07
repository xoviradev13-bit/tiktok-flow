import { Pool } from "pg";
import "dotenv/config";

async function testConnection() {
  const directUrl = process.env.DIRECT_URL || "";
  const databaseUrl = process.env.DATABASE_URL || "";

  console.log("Testing DIRECT_URL:", directUrl.replace(/:[^:]*@/, ":***@"));
  const poolDirect = new Pool({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    const res = await poolDirect.query("SELECT NOW()");
    console.log("✅ DIRECT_URL connection OK:", res.rows[0]);
  } catch (err: any) {
    console.error("❌ DIRECT_URL error:", err.message);
  } finally {
    await poolDirect.end();
  }

  console.log("\nTesting DATABASE_URL (port 6543):", databaseUrl.replace(/:[^:]*@/, ":***@"));
  const poolDb = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    const res = await poolDb.query("SELECT NOW()");
    console.log("✅ DATABASE_URL connection OK:", res.rows[0]);
  } catch (err: any) {
    console.error("❌ DATABASE_URL error:", err.message);
  } finally {
    await poolDb.end();
  }
}

testConnection();

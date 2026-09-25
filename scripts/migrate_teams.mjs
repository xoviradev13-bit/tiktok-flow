import { Pool } from "pg";
import "dotenv/config";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "";

async function inspectAndMigrate() {
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    console.log("Connected to PostgreSQL successfully!");

    // Check if table 'groups' or 'teams' exists
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('groups', 'teams');
    `);
    const tableNames = tablesRes.rows.map(r => r.table_name);
    console.log("Found tables:", tableNames);

    if (tableNames.includes("groups") && !tableNames.includes("teams")) {
      console.log("Renaming table 'groups' to 'teams'...");
      await client.query(`ALTER TABLE "groups" RENAME TO "teams";`);
      console.log("Table renamed to 'teams'.");
    }

    // Check columns on users table
    const userCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('group_id', 'team_id');
    `);
    const userColNames = userCols.rows.map(r => r.column_name);
    console.log("Found user columns:", userColNames);

    if (userColNames.includes("group_id") && !userColNames.includes("team_id")) {
      console.log("Renaming users.group_id to team_id...");
      await client.query(`ALTER TABLE "users" RENAME COLUMN "group_id" TO "team_id";`);
      console.log("users.group_id renamed to team_id.");
    }

    // Check columns on invitations table if it exists
    const invCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name IN ('group_id', 'team_id');
    `);
    const invColNames = invCols.rows.map(r => r.column_name);
    console.log("Found invitations columns:", invColNames);

    if (invColNames.includes("group_id") && !invColNames.includes("team_id")) {
      console.log("Renaming invitations.group_id to team_id...");
      await client.query(`ALTER TABLE "invitations" RENAME COLUMN "group_id" TO "team_id";`);
      console.log("invitations.group_id renamed to team_id.");
    }

    client.release();
    await pool.end();
    console.log("Inspection & DB migration check complete!");
  } catch (err) {
    console.error("Error during DB inspection:", err);
    await pool.end();
    process.exit(1);
  }
}

inspectAndMigrate();

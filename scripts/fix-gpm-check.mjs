import "dotenv/config";
import pg from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString: url,
  ssl: String(url).includes("localhost")
    ? undefined
    : { rejectUnauthorized: false },
  max: 1,
});

const CORRECT = "4b36c020-e4d8-4ad4-90a6-125eefef965f";
const WRONG = "80d8f999-e7f6-4f06-bb33-15896a70b332";

const before = await pool.query(
  `select username, "gpmProfileId" from tiktok_accounts where username in ($1,$2) or "gpmProfileId"=$3`,
  ["dat.nguyen6284", "ceotelamonix", WRONG]
);
console.log("before", JSON.stringify(before.rows));

const acc = await pool.query(
  `select id, username, "gpmProfileId", status from tiktok_accounts where username=$1`,
  ["dat.nguyen6284"]
);

if (acc.rows[0] && acc.rows[0].gpmProfileId !== CORRECT) {
  await pool.query(
    `update tiktok_accounts set "gpmProfileId"=$1, "groupName"=$2 where id=$3`,
    [CORRECT, "Profile 3708", acc.rows[0].id]
  );
  console.log("updated dat.nguyen6284 ->", CORRECT);
} else {
  console.log("dat.nguyen6284 status", acc.rows[0] || null);
}

const after = await pool.query(
  `select username, "gpmProfileId" from tiktok_accounts where username in ($1,$2)`,
  ["dat.nguyen6284", "ceotelamonix"]
);
console.log("after", JSON.stringify(after.rows));
await pool.end();

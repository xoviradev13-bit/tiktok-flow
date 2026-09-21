/**
 * Simpler version using direct pg query — no Prisma client needed.
 * Run: node --env-file=.env client-agent/reveal-attest-secret2.mjs
 */
import crypto from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

const EMAIL = config.memberEmail;
if (!EMAIL) { console.error("ERROR: config.json has no memberEmail"); process.exit(1); }

const EXTENSION_SECRET = process.env.EXTENSION_SESSION_SECRET || process.env.AUTH_SECRET;
if (!EXTENSION_SECRET) { console.error("ERROR: set EXTENSION_SESSION_SECRET or AUTH_SECRET in .env"); process.exit(1); }

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DATABASE_URL) { console.error("ERROR: DATABASE_URL not found in .env"); process.exit(1); }

function getKey() {
  return crypto.createHash("sha256").update(EXTENSION_SECRET, "utf8").digest();
}

function reveal(stored) {
  if (!stored || !stored.startsWith("a1.")) return null;
  const parts = stored.split(".");
  if (parts.length !== 4) return null;
  const [, ivHex, encHex, tagHex] = parts;
  try {
    const key = getKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  } catch { return null; }
}

function seal(plain) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `a1.${iv.toString("hex")}.${enc.toString("hex")}.${tag.toString("hex")}`;
}

// Use pg package (available in the project)
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const res = await client.query(
  `SELECT "id", "agent_attest_secret_sealed" FROM "users" WHERE "email" = $1 LIMIT 1`,
  [EMAIL]
);

if (!res.rows.length) {
  console.error(`ERROR: No user found for email ${EMAIL}`);
  await client.end();
  process.exit(1);
}

const row = res.rows[0];
let plain;

if (row.agent_attest_secret_sealed) {
  plain = reveal(row.agent_attest_secret_sealed);
  if (!plain) {
    console.error("ERROR: Could not decrypt — check EXTENSION_SESSION_SECRET matches server env.");
    await client.end();
    process.exit(1);
  }
  console.log("\n✅ Existing agentAttestSecret revealed:");
} else {
  // Generate new one, seal it, store in DB
  plain = crypto.randomBytes(32).toString("hex");
  const sealed = seal(plain);
  await client.query(
    `UPDATE "users" SET "agent_attest_secret_sealed" = $1 WHERE "id" = $2`,
    [sealed, row.id]
  );
  console.log("\n✅ Generated + stored new agentAttestSecret:");
}

await client.end();
console.log(plain);

// Auto-update config.json
config.agentAttestSecret = plain;
writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(`\n✅ config.json updated automatically. Restart the agent to apply.\n`);

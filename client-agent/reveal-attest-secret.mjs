/**
 * One-off script: reveal agentAttestSecret for the user in config.json.
 * Run: node --env-file=.env.local client-agent/reveal-attest-secret.mjs
 */
import crypto from "crypto";
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf8"));

// ── replicate revealAgentAttestSecret from extension-auth.ts ──────────────
function getKey(extensionSecret) {
  return crypto.createHash("sha256").update(extensionSecret, "utf8").digest();
}

function reveal(stored, extensionSecret) {
  if (!stored || !stored.startsWith("a1.")) return null;
  const parts = stored.split(".");
  if (parts.length !== 4) return null;
  const [, ivHex, encHex, tagHex] = parts;
  try {
    const key = getKey(extensionSecret);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(encHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch (e) {
    return null;
  }
}

// ── Connect to Prisma (uses DATABASE_URL from .env.local) ─────────────────
const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
const prisma = new PrismaClient();

const EXTENSION_SECRET =
  process.env.EXTENSION_SESSION_SECRET || process.env.AUTH_SECRET;
if (!EXTENSION_SECRET) {
  console.error(
    "ERROR: EXTENSION_SESSION_SECRET or AUTH_SECRET must be set in environment."
  );
  process.exit(1);
}

const EMAIL = config.memberEmail;
if (!EMAIL) {
  console.error("ERROR: config.json has no memberEmail field.");
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email: EMAIL },
  select: { id: true, agentAttestSecretSealed: true },
});

if (!user) {
  console.error(`ERROR: No user found for email ${EMAIL}`);
  process.exit(1);
}

if (!user.agentAttestSecretSealed) {
  // Generate + seal + store a new one, then reveal it
  const plain = crypto.randomBytes(32).toString("hex");
  const key = getKey(EXTENSION_SECRET);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sealed = `a1.${iv.toString("hex")}.${enc.toString("hex")}.${tag.toString("hex")}`;

  await prisma.user.update({
    where: { id: user.id },
    data: { agentAttestSecretSealed: sealed },
  });

  console.log("\n✅ Generated new agentAttestSecret:");
  console.log(plain);
  console.log(
    '\nPaste the value above into config.json → "agentAttestSecret" and restart the agent.\n'
  );
} else {
  const plain = reveal(user.agentAttestSecretSealed, EXTENSION_SECRET);
  if (!plain) {
    console.error(
      "ERROR: Could not decrypt agentAttestSecretSealed. Check EXTENSION_SESSION_SECRET."
    );
    process.exit(1);
  }
  console.log("\n✅ Your agentAttestSecret:");
  console.log(plain);
  console.log(
    '\nPaste the value above into config.json → "agentAttestSecret" and restart the agent.\n'
  );
}

await prisma.$disconnect();

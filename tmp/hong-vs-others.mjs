import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";
import fs from "fs";
import path from "path";

const storage = "D:\\Tiktok automation";
const hits = [];

function walkMeta(root) {
  if (!fs.existsSync(root)) return;
  let dirs = [];
  try {
    dirs = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const name of dirs) {
    const full = path.join(root, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    // GPM profile folders are usually UUIDs
    const metaCandidates = [
      path.join(full, "profile.json"),
      path.join(full, "Default", "GPMLogin"),
      path.join(full, "Default", "Preferences"),
    ];
    // Also check sibling/json next to folder via common GPM layouts
    for (const c of [
      path.join(root, `${name}.json`),
      path.join(full, "data.json"),
      path.join(full, "config.json"),
    ]) {
      if (!fs.existsSync(c)) continue;
      try {
        const raw = fs.readFileSync(c, "utf8");
        if (/5404|hong\.minh|minh3808/i.test(raw)) {
          hits.push({ file: c, snippet: raw.slice(0, 300) });
        }
      } catch {}
    }
  }
}

walkMeta(storage);

// Also list UUID dirs and try agent-style meta reader if present
const { createRequire } = await import("module");
const require = createRequire(import.meta.url);

console.log("meta hits", hits.length);
for (const h of hits.slice(0, 20)) console.log(h.file, h.snippet.slice(0, 120));

// DB: any account with gpmProfileId that might conflict — list recent accounts missing nothing
const recent = await prisma.tiktokAccount.findMany({
  where: { lastSyncedAt: { gte: new Date("2026-09-20T19:00:00Z") } },
  select: {
    username: true,
    gpmProfileId: true,
    gpmProfileName: true,
    gpmPort: true,
    groupName: true,
    lastSyncedAt: true,
  },
  orderBy: { lastSyncedAt: "desc" },
  take: 40,
});
console.log("\nrecent syncs:");
for (const r of recent) {
  console.log(
    `@${r.username} id=${r.gpmProfileId?.slice(0, 8) || "NULL"} name=${r.gpmProfileName} port=${r.gpmPort} group=${r.groupName}`
  );
}

const nullIds = await prisma.tiktokAccount.findMany({
  where: { gpmProfileId: null },
  select: {
    username: true,
    gpmProfileName: true,
    gpmPort: true,
    groupName: true,
    lastSyncedAt: true,
  },
});
console.log("\nALL accounts with null gpmProfileId:", nullIds.length);
console.log(JSON.stringify(nullIds, null, 2));

await prisma.$disconnect();

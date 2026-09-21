import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";
import fs from "fs";
import path from "path";

const withNameNoId = await prisma.tiktokAccount.findMany({
  where: { gpmProfileId: null, NOT: { gpmProfileName: null } },
  select: {
    username: true,
    gpmProfileName: true,
    groupName: true,
    lastSyncedAt: true,
    status: true,
  },
  take: 50,
});
console.log("accounts with name but no gpmProfileId:", withNameNoId.length);
console.log(JSON.stringify(withNameNoId, null, 2));

const hong = await prisma.tiktokAccount.findFirst({
  where: { username: "hong.minh3808" },
});
console.log("\nhong raw:", {
  gpmProfileId: hong?.gpmProfileId,
  gpmProfileName: hong?.gpmProfileName,
  groupName: hong?.groupName,
  metadata: hong?.metadata,
});

// Search local sessions for handle
const sessDir = path.join(process.env.LOCALAPPDATA || "", "TikTokFlow", "sessions");
const hits = [];
if (fs.existsSync(sessDir)) {
  for (const f of fs.readdirSync(sessDir).filter((x) => x.endsWith(".json"))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(sessDir, f), "utf8"));
      const blob = JSON.stringify(j).toLowerCase();
      if (
        blob.includes("hong.minh") ||
        blob.includes("minh3808") ||
        blob.includes("5404")
      ) {
        hits.push({
          id: f.replace(".json", ""),
          handle: j.handle || j.username || j.tiktokHandle,
          keys: Object.keys(j).slice(0, 20),
        });
      }
    } catch {}
  }
}
console.log("\nsession hits:", hits);

// Search GPM storage folder names / User data for profile name files
const storageCandidates = [
  "D:\\Tiktok automation",
  process.env.GPM_STORAGE_PATH,
].filter(Boolean);

for (const root of storageCandidates) {
  if (!root || !fs.existsSync(root)) continue;
  console.log("\nscanning", root);
  const dirs = fs.readdirSync(root).slice(0, 500);
  for (const name of dirs) {
    const full = path.join(root, name);
    try {
      // Check Default Preferences or a sidecare for profile name
      const prefs = path.join(full, "Default", "Preferences");
      const meta = path.join(full, "profile.json");
      if (fs.existsSync(meta)) {
        const m = JSON.parse(fs.readFileSync(meta, "utf8"));
        const s = JSON.stringify(m).toLowerCase();
        if (s.includes("5404") || s.includes("hong") || s.includes("minh3808")) {
          console.log("meta hit", name, m);
        }
      }
    } catch {}
  }
}

await prisma.$disconnect();

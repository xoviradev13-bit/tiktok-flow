/**
 * Backfill tiktok_accounts.groupName from local GPM profile group_id + /api/v1/groups.
 * Run on the workstation with GPM Login open.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/db";

function getStoragePath() {
  const appData = process.env.APPDATA || "";
  const setting = path.join(appData, "GPMLoginGlobal", "setting.dat");
  try {
    if (fs.existsSync(setting)) {
      const parsed = JSON.parse(fs.readFileSync(setting, "utf8"));
      const p = parsed.local_storage_path || parsed.profile_path || parsed.storage_path;
      if (p && fs.existsSync(p)) return p;
    }
  } catch {
    /* ignore */
  }
  for (const fb of ["D:\\Tiktok automation", "C:\\Tiktok automation"]) {
    if (fs.existsSync(fb)) return fb;
  }
  return null;
}

function readGroupId(storageRoot, profileId) {
  try {
    const pi = path.join(storageRoot, profileId, "Default", "GPMSoft", "gpm_pi.dat");
    if (!fs.existsSync(pi)) return null;
    let raw = fs.readFileSync(pi, "utf8").trim();
    try {
      raw = Buffer.from(raw, "base64").toString("utf8");
    } catch {
      /* plain */
    }
    const parsed = JSON.parse(raw);
    return (
      parsed?.group_id ||
      parsed?.groupId ||
      parsed?.Group?.id ||
      null
    );
  } catch {
    return null;
  }
}

async function loadGroups(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // 1. Read from disk cache if available
  const cacheCandidates = [
    path.join(process.env.ProgramData || "C:\\ProgramData", "TikTokFlow", "gpm-groups-cache.json"),
    path.join(process.env.APPDATA || "", "TikTokFlow", "gpm-groups-cache.json"),
    "C:\\Users\\datng\\AppData\\Roaming\\TikTokFlow\\gpm-groups-cache.json",
  ];
  for (const cp of cacheCandidates) {
    if (fs.existsSync(cp)) {
      try {
        const raw = JSON.parse(fs.readFileSync(cp, "utf8"));
        const byId = raw?.byId && typeof raw.byId === "object" ? raw.byId : {};
        for (const [k, v] of Object.entries(byId)) {
          map.set(String(k), String(v));
        }
      } catch {
        /* ignore */
      }
    }
  }

  // 2. Try live GPM API ports if available
  const ports = [9495, 19995, 19996, 19994];
  for (const port of ports) {
    for (const ver of ["v1", "v3"]) {
      try {
        const resp = await fetch(
          `http://127.0.0.1:${port}/api/${ver}/groups?page=1&page_size=200`,
          { signal: AbortSignal.timeout(1200) }
        );
        if (!resp.ok) continue;
        const json = (await resp.json()) as any;
        const rows = Array.isArray(json?.data?.data)
          ? json.data.data
          : Array.isArray(json?.data)
            ? json.data
            : [];
        for (const g of rows) {
          if (g?.id != null) map.set(String(g.id), String(g.name || g.id));
        }
      } catch {
        /* next */
      }
    }
  }
  return map;
}

async function main() {
  const storage = getStoragePath();
  if (!storage) throw new Error("GPM storage path not found");
  const groups = await loadGroups();
  if (!groups.size) throw new Error("GPM groups unavailable");

  const rows = await prisma.tiktokAccount.findMany({
    where: { gpmProfileId: { not: null } },
    select: { id: true, username: true, gpmProfileId: true, groupName: true },
  });

  let updated = 0;
  for (const row of rows) {
    const gid = readGroupId(storage, row.gpmProfileId);
    let name = gid ? groups.get(String(gid)) : null;
    if (!name) {
      console.log(`skip @${row.username}: no group for ${gid || "null"}`);
      continue;
    }
    if (row.groupName === name) continue;
    await prisma.tiktokAccount.update({
      where: { id: row.id },
      data: { groupName: name },
    });
    updated++;
    console.log(`@${row.username}: ${row.groupName || "null"} → ${name}`);
  }
  console.log(JSON.stringify({ accounts: rows.length, groups: groups.size, updated }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

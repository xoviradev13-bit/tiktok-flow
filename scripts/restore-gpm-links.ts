/**
 * Restore known GPM links + group names.
 * Uses GPM /groups when online; otherwise disk group_id + known/cached map.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "../src/lib/db";

const KNOWN = [
  {
    username: "ceotelamonix",
    gpmProfileId: "b57d9f1b-4dae-4377-a870-99d5b8be8434",
    gpmProfileName: "Profile 2524",
  },
  {
    username: "dat.nguyen6284",
    gpmProfileId: "5c7067f3-df4a-44f6-af28-41cd7425a89c",
    gpmProfileName: "Profile 2228",
  },
  {
    username: "hong.minh3808",
    gpmProfileId: "b255d876-c886-450f-a4a8-3451206b9346",
    gpmProfileName: "Profile 5404",
  },
  {
    username: "user008437433",
    gpmProfileId: "30dabc91-9f51-49e9-9b6b-007d4c086b3b",
    gpmProfileName: "Profile 4712",
  },
];

/** Last known group UUID → name from a successful Groups API pull. */
const KNOWN_GROUPS: Record<string, string> = {
  "95b47728-46ad-46e2-ab5a-5ffdee565978": "Default group",
  "6fa6b905-43f9-4d51-be01-6c2ca34df57a": "test 1",
  "6fbf5fa6-747c-4ba4-afb2-c9ffacd7d9f9": "test 2",
};

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

function readGroupId(storageRoot: string, profileId: string) {
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
    return parsed?.group_id || parsed?.groupId || parsed?.Group?.id || null;
  } catch {
    return null;
  }
}

function cachePath() {
  return path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "TikTokFlow",
    "gpm-groups-cache.json"
  );
}

function loadDiskGroupCache(): Map<string, string> {
  const map = new Map<string, string>(Object.entries(KNOWN_GROUPS));
  try {
    const p = cachePath();
    if (!fs.existsSync(p)) return map;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    const byId = raw?.byId || {};
    for (const [k, v] of Object.entries(byId)) map.set(String(k), String(v));
  } catch {
    /* ignore */
  }
  return map;
}

function saveDiskGroupCache(map: Map<string, string>) {
  try {
    const p = cachePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const byId: Record<string, string> = {};
    for (const [k, v] of map.entries()) byId[k] = v;
    fs.writeFileSync(p, JSON.stringify({ at: Date.now(), base: "restore", byId }, null, 2));
  } catch {
    /* ignore */
  }
}

async function loadGroupsFromApi(): Promise<Map<string, string>> {
  const ports = [9495, 19995, 19996];
  for (const port of ports) {
    try {
      const resp = await fetch(
        `http://127.0.0.1:${port}/api/v1/groups?page=1&page_size=200`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (!resp.ok) continue;
      const json = await resp.json();
      const rows = Array.isArray(json?.data?.data)
        ? json.data.data
        : Array.isArray(json?.data)
          ? json.data
          : [];
      const map = new Map<string, string>();
      for (const g of rows) {
        if (g?.id != null) map.set(String(g.id), String(g.name || g.id));
      }
      if (map.size) return map;
    } catch {
      /* next */
    }
  }
  return new Map();
}

async function main() {
  const storage = getStoragePath();
  if (!storage) throw new Error("GPM storage path not found");

  let groups = await loadGroupsFromApi();
  if (groups.size) {
    // merge + persist for offline agent use
    const disk = loadDiskGroupCache();
    for (const [k, v] of groups.entries()) disk.set(k, v);
    saveDiskGroupCache(disk);
    groups = disk;
    console.log(`groups from API: ${groups.size}`);
  } else {
    groups = loadDiskGroupCache();
    saveDiskGroupCache(groups);
    console.log(`groups from disk/known cache: ${groups.size} (GPM API offline)`);
  }

  let restored = 0;
  for (const row of KNOWN) {
    const gid = readGroupId(storage, row.gpmProfileId);
    let groupName = gid ? groups.get(String(gid)) || null : null;
    if (!groupName && /^(all|default)$/i.test(String(gid || ""))) {
      groupName = "Default group";
    }
    const updated = await prisma.tiktokAccount.updateMany({
      where: { username: row.username },
      data: {
        gpmProfileId: row.gpmProfileId,
        gpmProfileName: row.gpmProfileName,
        groupName: groupName,
      },
    });
    if (updated.count) {
      restored++;
      console.log(
        `@${row.username} → ${row.gpmProfileName} / ${groupName || "null"} (gid=${gid || "n/a"})`
      );
    } else {
      console.log(`missing account @${row.username}`);
    }
  }
  console.log(JSON.stringify({ restored, groups: groups.size }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

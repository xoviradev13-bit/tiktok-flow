import "dotenv/config";
import path from "path";
import fs from "fs";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  extractProfileStudio,
} from "../client-agent/agent.js";

async function main() {
  const storagePath = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const entries = fs.readdirSync(storagePath, { withFileTypes: true });
  const diskDirs = entries.filter(
    (e) =>
      e.isDirectory() &&
      !e.name.startsWith("_") &&
      /^[0-9a-f-]{36}$/i.test(e.name) &&
      fs.existsSync(path.join(storagePath, e.name, "Default"))
  );

  console.log(`=== CHECKING ALL ${diskDirs.length} PROFILES ===`);
  for (let i = 0; i < diskDirs.length; i++) {
    const d = diskDirs[i];
    const fullDir = path.join(storagePath, d.name);
    console.log(`\n[${i + 1}/${diskDirs.length}] Profile ${d.name}...`);
    try {
      const res = await Promise.race([
        extractProfileStudio(fullDir, d.name, chromePath, null),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout 35s")), 35000)),
      ]);
      if (res.success && res.data) {
        console.log(` -> SUCCESS! @${res.data.username}`);
        console.log(`    Followers: ${res.data.followersCount}, Views: ${res.data.totalViews}, Videos: ${res.data.totalVideos}, Revenue: ${res.data.totalRevenue}`);
        console.log(`    SumRevenue:`, res.data.sumRevenue);
        console.log(`    SumViews:`, res.data.sumViews);
      } else {
        console.log(` -> FAILED: ${res.error}`);
      }
    } catch (e: any) {
      console.log(` -> ERROR: ${e.message}`);
    }
  }
}

main().catch(console.error);

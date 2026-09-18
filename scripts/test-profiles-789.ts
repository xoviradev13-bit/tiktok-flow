import "dotenv/config";
import path from "path";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  extractProfileStudio,
} from "../client-agent/agent.js";

async function main() {
  const storagePath = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const targetProfiles = [
    "91d83a58-0226-4a1c-9829-a53738842afe",
    "b255d876-c886-450f-a4a8-3451206b9346",
    "b57d9f1b-4dae-4377-a870-99d5b8be8434",
  ];

  for (const id of targetProfiles) {
    const fullDir = path.join(storagePath, id);
    console.log(`\n=== Testing Profile ${id} ===`);
    const t0 = Date.now();
    try {
      const res = await extractProfileStudio(fullDir, id, chromePath, null);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`Completed in ${elapsed}s:`, {
        success: res.success,
        error: res.error,
        username: res.data?.username,
        followers: res.data?.followersCount,
        views: res.data?.totalViews,
        videos: res.data?.totalVideos,
      });
    } catch (e: any) {
      console.log(`Failed with exception:`, e.message);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));

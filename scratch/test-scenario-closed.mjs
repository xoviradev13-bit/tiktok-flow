import path from "path";
import { extractProfileStudio, getChromeExecutablePath, getGpmStoragePath } from "../client-agent/agent.js";

async function main() {
  const profileId = "30dabc91-9f51-49e9-9b6b-007d4c086b3b";
  const storageRoot = getGpmStoragePath();
  const profileDir = path.join(storageRoot, profileId);
  const chromePath = getChromeExecutablePath();

  console.log(`[TEST] Testing closed profile: ${profileId}`);
  console.log(`[TEST] Profile Dir: ${profileDir}`);
  console.log(`[TEST] Chrome Path: ${chromePath}`);

  const t0 = performance.now();
  const result = await extractProfileStudio(profileDir, profileId, chromePath, "ousnowfan");
  const dur = ((performance.now() - t0) / 1000).toFixed(2);

  console.log(`\n[RESULT] Duration: ${dur}s`);
  console.log(`[RESULT] Success: ${result.success}`);
  if (result.success) {
    const d = result.data;
    console.log(`[DATA] Username: @${d.username}`);
    console.log(`[DATA] Method: ${d.extractionMethod}`);
    console.log(`[DATA] Followers: ${d.followersCount}`);
    console.log(`[DATA] Videos: ${d.videoCount}`);
    console.log(`[DATA] Total Revenue: ${d.currency}${d.totalRevenue}`);
    console.log(`[DATA] Post Rewards count: ${d.postRewards?.length || 0}`);
    console.log(`[DATA] Active Programs:`, d.revenueBreakdown?.activePrograms);
  } else {
    console.error(`[ERROR] ${result.error}`);
  }
}

main().catch(console.error);

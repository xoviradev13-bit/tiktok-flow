import path from "path";
import fs from "fs";
import {
  extractProfileStudio,
  getGpmStoragePath,
  getChromeExecutablePath,
  clearProfileSession,
} from "../client-agent/agent.js";

async function testSyncQueueWhileProfileOpen() {
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  clearProfileSession(profileId);

  const storageRoot = getGpmStoragePath();
  const profileDir = path.join(storageRoot, profileId);
  const chromePath = getChromeExecutablePath();

  console.log("=== TESTING CLIENT AGENT WHILE GPM APP & PROFILE ARE OPEN ===");
  console.log("Profile ID:", profileId);
  console.log("Profile Dir:", profileDir);
  console.log("Chrome Path:", chromePath);

  const t0 = Date.now();
  const result = await extractProfileStudio(profileDir, profileId, chromePath, "ousnowfan");
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log(`\n=== EXTRACTION COMPLETED IN ${elapsed}s ===`);
  console.log("Success:", result.success);

  if (!result.success) {
    console.error("[FAILED]:", result.error);
    process.exit(1);
  }

  const d = result.data;
  console.log("\n[SUCCESS] Extracted Data:");
  console.log(`- Username: @${d.username}`);
  console.log(`- Nickname: ${d.nickname}`);
  console.log(`- Followers: ${d.followersCount.toLocaleString()}`);
  console.log(`- Total Likes: ${d.totalLikes.toLocaleString()}`);
  console.log(`- Total Views: ${d.totalViews.toLocaleString()}`);
  console.log(`- Total Videos: ${d.videoCount || d.totalVideos}`);
  console.log(`- Total Revenue: ${d.currency}${d.totalRevenue}`);
  console.log(`- Country: ${d.country}`);
  console.log(`- RPM: ${d.rpm}`);
  console.log(`- Post Rewards: ${d.postRewards?.length || 0}`);
  console.log(`- 7d Views: ${d.sumViews?.views7d}`);
  console.log(`- 7d Likes: ${d.sumLikes?.likes7d}`);
  console.log(`- 7d Shares: ${d.sumShares?.shares7d}`);
  console.log(`- 7d Profile Views: ${d.sumProfileViews?.profileViews7d}`);

  fs.writeFileSync("scratch/sync_queue_test_live_result.json", JSON.stringify(d, null, 2), "utf8");
  console.log("\n[OK] Successfully saved scratch/sync_queue_test_live_result.json");
}

testSyncQueueWhileProfileOpen().catch((e) => {
  console.error("Test Exception:", e);
  process.exit(1);
});

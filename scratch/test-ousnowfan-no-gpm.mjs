import path from "path";
import fs from "fs";
import {
  extractProfileStudio,
  getGpmStoragePath,
  getChromeExecutablePath,
  clearProfileSession,
} from "../client-agent/agent.js";

async function run() {
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  clearProfileSession(profileId);

  const storageRoot = getGpmStoragePath();
  const profileDir = path.join(storageRoot, profileId);
  const chromePath = getChromeExecutablePath();

  console.log("=== RUNNING FRESH EXTRACTION FOR OUSNOWFAN ===");
  console.log("Profile Dir:", profileDir);
  console.log("Chrome Path:", chromePath);

  const t0 = Date.now();
  const result = await extractProfileStudio(profileDir, profileId, chromePath, "ousnowfan");
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Extraction took: ${elapsed}s`);
  console.log("Success:", result.success);

  if (result.success && result.data) {
    const d = result.data;
    console.log("Extracted Metrics Summary:");
    console.log(`- Username: @${d.username}`);
    console.log(`- Nickname: ${d.nickname}`);
    console.log(`- Followers: ${d.followersCount.toLocaleString()}`);
    console.log(`- Total Likes: ${d.totalLikes.toLocaleString()}`);
    console.log(`- Total Views (365d): ${d.totalViews.toLocaleString()}`);
    console.log(`- Videos in List: ${d.videosList?.length || 0}`);
    console.log(`- Total Revenue: ${d.currency}${d.totalRevenue}`);
    console.log(`- Country: ${d.country}`);
    console.log(`- Account RPM: ${d.rpm}`);
    console.log(`- Post Rewards Count: ${d.postRewards?.length || 0}`);
    console.log(`- Sample Post Reward RPM: ${d.postRewards?.[1]?.rpm || "N/A"}`);

    fs.writeFileSync("ousnowfan_data.json", JSON.stringify(d, null, 2), "utf8");
    fs.writeFileSync("scratch/ousnowfan_test_result_no_gpm.json", JSON.stringify(d, null, 2), "utf8");
    console.log("\n[OK] Successfully saved fresh ousnowfan_data.json!");
  } else {
    console.error("Failed:", result.error);
  }
}

run().catch(console.error);

import path from "path";
import fs from "fs";
import { getGpmStoragePath, getChromeExecutablePath, extractProfileStudio } from "../client-agent/agent.js";

async function main() {
  console.log("=== TESTING ISOLATED PROGRAM REWARDS ON @ousnowfan ===");
  const storagePath = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const profileDir = path.join(storagePath, profileId);

  console.log("Profile Dir:", profileDir);
  console.log("Chrome Path:", chromePath);

  if (!fs.existsSync(profileDir)) {
    console.error("Profile dir does not exist!");
    process.exit(1);
  }

  const startTime = Date.now();
  console.log("Starting extractProfileStudio...");
  const result = await extractProfileStudio(profileDir, profileId, chromePath, "ousnowfan");
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Finished in ${elapsedSec}s. Success:`, result.success);

  if (!result.success) {
    console.error("Extraction error:", result.error);
    process.exit(1);
  }

  const d = result.data;
  console.log("\n--- ACCOUNT SUMMARY ---");
  console.log("Username:", d.username);
  console.log("Followers:", d.followersCount);
  console.log("Total Views:", d.totalViews);
  console.log("Total Revenue (calculated):", d.currency, d.totalRevenue);
  console.log("Published Videos count in videosList:", d.videosList?.length);

  const postRewards = d.postRewards || [];
  console.log("\n--- POST REWARDS BREAKDOWN ---");
  console.log("Total reward-bearing video entries:", postRewards.length);

  // Group by program
  const programMap = {};
  for (const item of postRewards) {
    const prog = item.programName || "Unknown";
    if (!programMap[prog]) {
      programMap[prog] = { count: 0, total: 0, items: [] };
    }
    const val = Number(item.reward || item.rewards) || 0;
    programMap[prog].count++;
    programMap[prog].total += val;
    programMap[prog].items.push({
      id: item.id || item.videoId,
      title: item.title,
      reward: item.reward,
      rpm: item.rpm,
      views: item.views,
      postDate: item.postDate,
      isPunished: item.isPunished
    });
  }

  for (const [progName, data] of Object.entries(programMap)) {
    console.log(`\n▶ Program: [${progName}]`);
    console.log(`  - Video Count: ${data.count}`);
    console.log(`  - Total Earnings: $${data.total.toFixed(2)}`);
    console.log(`  - Sample Videos (first 3):`);
    for (const v of data.items.slice(0, 3)) {
      console.log(`    * [${v.id}] ${v.postDate || 'N/A'} | Reward: $${v.reward} | Views: ${v.views} | RPM: ${v.rpm || 'N/A'} | ${v.title.slice(0, 50)}...`);
    }
  }

  // Check videosList enrichment
  console.log("\n--- VIDEOS LIST ENRICHMENT VERIFICATION ---");
  const enrichedVideos = (d.videosList || []).filter(v => v.programName || v.reward > 0);
  console.log(`Published videos enriched with program/reward info: ${enrichedVideos.length}/${d.videosList?.length}`);
  if (enrichedVideos.length > 0) {
    console.log("Sample enriched video:", {
      id: enrichedVideos[0].id,
      title: enrichedVideos[0].title.slice(0, 40),
      programName: enrichedVideos[0].programName,
      reward: enrichedVideos[0].reward,
      isPunished: enrichedVideos[0].isPunished
    });
  }

  console.log("\n--- TOP VIDEOS 365D OUTPUT ---");
  console.log("topVideos365d:", JSON.stringify(d.topVideos365d, null, 2));

  console.log("\n=== TEST COMPLETED SUCCESSFULLY ===");
}

main().catch(console.error);

/**
 * test-ousnowfan-dev.mjs
 * Tests @ousnowfan extraction using agent-dev.js (patched version)
 * to verify full 469 video extraction with correct followers/totalViews.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  extractProfileStudio,
  getGpmStoragePath,
  getChromeExecutablePath,
} from "./agent-dev.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_ID = "500a1071-8dd2-43dd-9685-220721b0c4a4";
const TIMEOUT_MS = 180000;

async function main() {
  const storageRoot = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const profileDir = path.join(storageRoot, PROFILE_ID);

  console.log("============================================================");
  console.log("  OUSNOWFAN EXTRACTION TEST (agent-dev.js)");
  console.log("============================================================");
  console.log("[*] Profile  :", PROFILE_ID);
  console.log("[*] Storage  :", storageRoot);
  console.log("[*] Chrome   :", chromePath);
  console.log("[*] Timeout  :", TIMEOUT_MS / 1000, "s");
  console.log("");

  if (!fs.existsSync(profileDir)) {
    console.error("[!] Profile directory not found:", profileDir);
    process.exit(1);
  }

  const t0 = Date.now();
  let result;
  try {
    result = await Promise.race([
      extractProfileStudio(profileDir, PROFILE_ID, chromePath, "ousnowfan"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    result = { success: false, error: err.message };
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("\n============================================================");
  if (!result.success) {
    console.log(`  FAILED in ${elapsed}s`);
    console.log("  Error:", result.error);
    process.exit(1);
  }

  const d = result.data;
  const videosList = Array.isArray(d.videosList) ? d.videosList : [];
  const postRewards = Array.isArray(d.postRewards) ? d.postRewards : [];
  console.log(`  OK in ${elapsed}s | method=${result.extractionMethod || "unknown"}`);
  console.log("============================================================\n");

  console.log("--- ACCOUNT IDENTITY ---");
  console.log("  username      :", d.username);
  console.log("  nickname      :", d.nickname);
  console.log("  country       :", d.country);

  console.log("\n--- KEY METRICS (should match TikTok Studio) ---");
  console.log("  followersCount:", d.followersCount, " (expected: ~10,300)");
  console.log("  totalVideos   :", d.totalVideos, "  (expected: 469)");
  console.log("  totalViews    :", d.totalViews, " (expected: ~2,548,462)");
  console.log("  totalRevenue  :", d.currency, d.totalRevenue, "(expected: $29.4)");
  console.log("  rpm           :", d.rpm);

  console.log("\n--- VIDEO LIST ---");
  console.log("  videosList.length   :", videosList.length, " (expected: up to 469)");
  if (videosList.length > 0) {
    const v = videosList[0];
    console.log("  First video id      :", v.id);
    console.log("  First video title   :", v.title?.slice(0, 60));
    console.log("  First video views   :", v.views);
    console.log("  First video postDate:", v.postDate);
  }
  const missingIds = videosList.filter(v => !v.id).length;
  const missingDates = videosList.filter(v => !v.postDate && !v.postTime).length;
  console.log("  Videos missing id   :", missingIds);
  console.log("  Videos missing date :", missingDates);

  console.log("\n--- POST REWARDS ---");
  console.log("  postRewards.length  :", postRewards.length, " (expected: 58)");
  const revenueSum = postRewards.reduce((s, p) => s + (Number(p.reward) || 0), 0);
  console.log("  Sum reward          : $" + revenueSum.toFixed(2));
  const punished = postRewards.filter(p => p.isPunished).length;
  console.log("  Punished videos     :", punished);

  console.log("\n--- TOP VIDEOS 365d ---");
  const tv = d.topVideos365d || {};
  console.log("  mostViews.length    :", Array.isArray(tv.mostViews) ? tv.mostViews.length : tv.mostViews ?? 0, " (expected: 15)");
  console.log("  mostNewViewers.len  :", Array.isArray(tv.mostNewViewers) ? tv.mostNewViewers.length : tv.mostNewViewers ?? 0, " (expected: 15)");
  console.log("  mostLikes.length    :", Array.isArray(tv.mostLikes) ? tv.mostLikes.length : tv.mostLikes ?? 0, " (expected: 15)");

  // Write output for inspection
  const outDir = path.join(__dirname, "test-results", "dev-test-ousnowfan");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "ousnowfan_dev.full.json");
  fs.writeFileSync(outPath, JSON.stringify({ success: true, elapsedMs: Math.round((Date.now() - t0)), data: d }, null, 2), "utf8");
  console.log("\n[*] Full result written to:", outPath);
}

main().catch(console.error);

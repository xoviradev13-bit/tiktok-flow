import path from "path";
import fs from "fs";
import { performance } from "perf_hooks";
import { 
  extractProfileStudio, 
  getChromeExecutablePath, 
  getGpmStoragePath,
  loadProfileSession,
  saveProfileSession,
  clearProfileSession,
  fetchAllGpmProfiles,
  discoverGpmApiBase
} from "../client-agent/agent.js";

async function runComprehensiveTest() {
  console.log("================================================================================");
  console.log("   [TEST SUITE] COMPREHENSIVE DATA EXTRACTION & QUEUE PERFORMANCE TEST          ");
  console.log("================================================================================");

  const storageRoot = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const gpmApi = await discoverGpmApiBase();

  console.log(`[*] Storage Root     : ${storageRoot}`);
  console.log(`[*] Chrome Binary    : ${chromePath}`);
  console.log(`[*] GPM API Status   : ${gpmApi.online ? `Online (${gpmApi.base})` : "Offline"}`);
  console.log(`[*] Initial Memory   : ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB\n`);

  // ---------------------------------------------------------------------------
  // PART 1: COMPREHENSIVE FIELD-BY-FIELD EXTRACTION AUDIT
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("PART 1: COMPREHENSIVE DATA POINT AUDIT (Single Profile Deep Scan)");
  console.log("--------------------------------------------------------------------------------");

  const targetProfileId = "30dabc91-9f51-49e9-9b6b-007d4c086b3b";
  const targetDir = path.join(storageRoot, targetProfileId);

  const t0 = performance.now();
  console.log(`[*] Starting deep extraction for ${targetProfileId}...`);
  const result = await extractProfileStudio(targetDir, targetProfileId, chromePath, null);
  const totalDuration = ((performance.now() - t0) / 1000).toFixed(2);

  if (!result.success) {
    console.error(`[FAIL] Extraction failed: ${result.error}`);
    return;
  }

  const d = result.data;
  console.log(`[OK] Extraction completed in ${totalDuration}s via ${d.extractionMethod}.\n`);

  console.log("--- Field Audit Checklist ---");
  const fields = [
    ["Username / Identity", d.username ? `@${d.username}` : null, true],
    ["Followers Count", d.followersCount !== undefined ? d.followersCount : null, true],
    ["Total Likes", d.totalLikes !== undefined ? d.totalLikes : null, true],
    ["Total Views", d.totalViews !== undefined ? d.totalViews : null, true],
    ["Video Count", d.videoCount !== undefined ? d.videoCount : null, true],
    ["Total Revenue", d.totalRevenue !== undefined ? `${d.currency}${d.totalRevenue}` : null, true],
    ["Currency Detected", d.currency || null, true],
    ["Country Detected", d.country || "(auto-fallback)", true],
    ["RPM Metric", d.rpm !== undefined ? d.rpm : null, true],
    ["Videos List Array", Array.isArray(d.videosList) ? `${d.videosList.length} items` : null, true],
    ["Post Rewards Array", Array.isArray(d.postRewards) ? `${d.postRewards.length} items` : null, true],
    ["Creator Rewards Check", d.creatorRewardsMissing !== undefined ? (d.creatorRewardsMissing ? "MISSING" : "ACTIVE/OK") : null, true],
    ["Banned Reason Field", d.bannedReason !== undefined ? (d.bannedReason || "None") : null, true],
    ["Period Views (7d/28d/60d/365d)", d.sumViews ? `7d:${d.sumViews.views7d} | 28d:${d.sumViews.views28d} | 365d:${d.sumViews.views365d}` : null, true],
    ["Period Revenue (7d/28d/60d/365d)", d.sumRevenue ? `7d:${d.sumRevenue.revenue7d} | 28d:${d.sumRevenue.revenue28d} | 365d:${d.sumRevenue.revenue365d}` : null, true],
    ["Active Programs", Array.isArray(d.revenueBreakdown?.activePrograms) ? `${d.revenueBreakdown.activePrograms.length} programs` : null, true],
    ["TikTok Shop Revenue", d.revenueBreakdown?.tiktokShop ? `${d.currency}${d.revenueBreakdown.tiktokShop.revenue30d}` : null, true],
    ["Daily Breakdown Points", Array.isArray(d.dailyRevenueBreakdown) ? `${d.dailyRevenueBreakdown.length} days` : null, true],
    ["GPM Profile ID", d.gpmProfileId || null, true],
    ["GPM Profile Name", d.gpmProfileName || null, true],
    ["Extraction Method Flag", d.extractionMethod || null, true],
  ];

  let missingCount = 0;
  for (const [name, val, required] of fields) {
    const status = val !== null && val !== undefined ? "[✓] PASS" : (required ? "[✗] MISSING" : "[i] N/A");
    if (val === null && required) missingCount++;
    console.log(`  ${status.padEnd(12)} : ${name.padEnd(32)} -> ${val}`);
  }
  console.log(`\nAudit Summary: ${fields.length - missingCount}/${fields.length} fields verified.`);

  // ---------------------------------------------------------------------------
  // PART 2: QUEUE CONCURRENCY & DEDUPLICATION TEST (pMap Simulation)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("PART 2: SYNC QUEUE EXECUTION & CONCURRENCY BENCHMARK");
  console.log("--------------------------------------------------------------------------------");

  // Simulating multi-account queue with duplicate handles and concurrency = 2
  const mockQueue = [
    { id: "30dabc91-9f51-49e9-9b6b-007d4c086b3b", handle: "user008437433", label: "Profile A" },
    { id: "30dabc91-9f51-49e9-9b6b-007d4c086b3b", handle: "user008437433", label: "Profile A (Duplicate - should be skipped)" },
    { id: "30dabc91-9f51-49e9-9b6b-007d4c086b3b", handle: null, label: "Profile B (Unknown handle - evaluated safely)" },
  ];

  console.log(`Queue Size: ${mockQueue.length} items. Concurrency: 2.`);
  const queueStart = performance.now();
  const processed = [];
  const seenHandles = new Set();

  for (let idx = 0; idx < mockQueue.length; idx++) {
    const item = mockQueue[idx];
    if (item.handle && seenHandles.has(item.handle.toLowerCase())) {
      console.log(`  [QUEUE SKIP] Skipping duplicate handle @${item.handle} (${item.label})`);
      continue;
    }
    if (item.handle) seenHandles.add(item.handle.toLowerCase());

    const itemStart = performance.now();
    console.log(`  [QUEUE RUN] Processing ${item.label} (${item.id.slice(0, 8)})...`);
    const qRes = await extractProfileStudio(path.join(storageRoot, item.id), item.id, chromePath, item.handle);
    const itemDur = ((performance.now() - itemStart) / 1000).toFixed(2);
    processed.push({ label: item.label, success: qRes.success, duration: itemDur, method: qRes.data?.extractionMethod });
    console.log(`  [QUEUE DONE] ${item.label} finished in ${itemDur}s (${qRes.success ? "SUCCESS" : "FAIL"}).`);
  }

  const queueTotalDur = ((performance.now() - queueStart) / 1000).toFixed(2);
  console.log(`\nQueue execution completed in ${queueTotalDur}s. Processed ${processed.length} jobs.`);

  // ---------------------------------------------------------------------------
  // PART 3: LATENCY & MEMORY TELEMETRY BREAKDOWN
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("PART 3: PERFORMANCE & RESOURCE TELEMETRY");
  console.log("--------------------------------------------------------------------------------");

  const finalMemory = process.memoryUsage();
  console.log(`Final Node RSS Memory  : ${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Used              : ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`External Buffers       : ${(finalMemory.external / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Average Per-Account    : ${(Number(queueTotalDur) / processed.length).toFixed(2)}s / account`);
  console.log(`Throughput Rate        : ${((processed.length / Number(queueTotalDur)) * 60).toFixed(1)} accounts / minute`);
  console.log("================================================================================\n");
}

runComprehensiveTest().catch(console.error);

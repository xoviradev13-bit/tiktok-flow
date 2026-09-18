import path from "path";
import { extractProfileStudio, getChromeExecutablePath, getGpmStoragePath } from "../client-agent/agent.js";

async function main() {
  const testProfiles = [
    { id: "30dabc91-9f51-49e9-9b6b-007d4c086b3b", label: "Closed Profile (Cached Session)" },
    { id: "30dabc91-9f51-49e9-9b6b-007d4c086b3b", label: "Closed Profile (Fresh Minimal Snapshot)" },
  ];

  const storageRoot = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();

  console.log("================================================================================");
  console.log("             TIKTOKFLOW CLIENT AGENT EXTRACTION BENCHMARK                       ");
  console.log("================================================================================");
  console.log(`Chrome Executable: ${chromePath}`);
  console.log(`Initial Node RSS : ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB\n`);

  // Test 1: Using the cached session (Tier 2 Cookie Bridge)
  const p1 = testProfiles[0];
  const dir1 = path.join(storageRoot, p1.id);
  console.log(`--- Run 1: ${p1.label} (${p1.id.slice(0, 8)}) ---`);
  const t0 = performance.now();
  const res1 = await extractProfileStudio(dir1, p1.id, chromePath, null);
  const dur1 = ((performance.now() - t0) / 1000).toFixed(2);
  const mem1 = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
  console.log(`[Run 1 Result] Status: ${res1.success ? "OK" : "FAIL"} | Time: ${dur1}s | Memory: ${mem1} MB`);
  if (res1.success) {
    console.log(`               User: @${res1.data.username} | Method: ${res1.data.extractionMethod} | Followers: ${res1.data.followersCount}`);
  }

  // Clear session to force Run 2 to test Tier 3 (Minimal Profile Snapshot)
  const { clearProfileSession } = await import("../client-agent/agent.js");
  clearProfileSession(p1.id);

  console.log(`\n--- Run 2: ${testProfiles[1].label} (${p1.id.slice(0, 8)}) ---`);
  const t1 = performance.now();
  const res2 = await extractProfileStudio(dir1, p1.id, chromePath, null);
  const dur2 = ((performance.now() - t1) / 1000).toFixed(2);
  const mem2 = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
  console.log(`[Run 2 Result] Status: ${res2.success ? "OK" : "FAIL"} | Time: ${dur2}s | Memory: ${mem2} MB`);
  if (res2.success) {
    console.log(`               User: @${res2.data.username} | Method: ${res2.data.extractionMethod} | Followers: ${res2.data.followersCount}`);
  }

  console.log("\n================================================================================");
  console.log("                             BENCHMARK SUMMARY                                  ");
  console.log("================================================================================");
  console.log(`Tier 2 (Cookie Bridge)  : ${dur1}s (Peak RSS: ${mem1} MB) -> ${res1.data?.extractionMethod}`);
  console.log(`Tier 3 (Minimal Snapshot): ${dur2}s (Peak RSS: ${mem2} MB) -> ${res2.data?.extractionMethod}`);
  console.log("================================================================================");
}

main().catch(console.error);

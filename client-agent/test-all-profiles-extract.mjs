/**
 * Run extractProfileStudio on every local GPM profile and dump JSON results
 * for offline consistency checks (videosList, postRewards, metrics, etc.).
 *
 * Usage:
 *   node test-all-profiles-extract.mjs
 *   node test-all-profiles-extract.mjs --limit 2
 *   node test-all-profiles-extract.mjs --timeout 120000
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  extractProfileStudio,
  getGpmStoragePath,
  getChromeExecutablePath,
  readGpmProfileMetaFromDisk,
  findTikTokHandleInProfileAsync,
  acquireAgentLock,
  cancelExtensionSweep,
} from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const TIMEOUT_MS = Number(argValue("--timeout", "180000")) || 180000;
const LIMIT = Number(argValue("--limit", "0")) || 0;
const PROFILE_FILTER = argValue("--profile", null);
// --concurrency N: how many profiles to extract simultaneously (default 3).
// Higher = faster total time; lower = less RAM. Safe ceiling ~5 (each headless
// Chrome uses ~300 MB). Cap at 9 to avoid OOM on lighter machines.
const CONCURRENCY = Math.max(1, Math.min(9, Number(argValue("--concurrency", "3")) || 3));

function safeName(s) {
  return String(s || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "unknown";
}

function summarizeData(data) {
  if (!data) return null;
  const videosList = Array.isArray(data.videosList) ? data.videosList : [];
  const postRewards = Array.isArray(data.postRewards) ? data.postRewards : [];
  const programs = {};
  for (const pr of postRewards) {
    const name = pr.programName || "Unknown";
    if (!programs[name]) programs[name] = { count: 0, sumReward: 0 };
    programs[name].count += 1;
    programs[name].sumReward += Number(pr.reward || pr.rewards) || 0;
  }
  for (const p of Object.values(programs)) {
    p.sumReward = Math.round(p.sumReward * 100) / 100;
  }
  const enriched = videosList.filter((v) => v.programName || Number(v.reward) > 0).length;
  const tv = data.topVideos365d;
  return {
    username: data.username || null,
    nickname: data.nickname || null,
    followersCount: data.followersCount ?? null,
    videoCount: data.videoCount ?? data.totalVideos ?? null,
    videosListCount: videosList.length,
    postRewardsCount: postRewards.length,
    videosEnrichedWithRewards: enriched,
    totalViews: data.totalViews ?? null,
    totalRevenue: data.totalRevenue ?? null,
    currency: data.currency ?? null,
    country: data.country ?? null,
    rpm: data.rpm ?? null,
    programs,
    hasSumRevenue: !!data.sumRevenue,
    hasSumViews: !!data.sumViews,
    hasRevenueBreakdown: !!data.revenueBreakdown,
    hasDailyRevenueBreakdown: !!data.dailyRevenueBreakdown,
    hasInsightsHistory: !!data.insightsHistory,
    topVideos365d: tv
      ? {
          mostViews: tv.mostViews?.length || 0,
          mostNewViewers: tv.mostNewViewers?.length || 0,
          mostLikes: tv.mostLikes?.length || 0,
          fetchedAt: tv.fetchedAt || null,
        }
      : null,
    creatorRewardsMissing: !!data.creatorRewardsMissing,
    bannedReason: data.bannedReason || null,
    extractionMethod: data.extractionMethod || null,
    gpmProfileName: data.gpmProfileName || null,
    gpmGroupName: data.gpmGroupName || null,
  };
}

function consistencyChecks(data) {
  const issues = [];
  if (!data) return ["no_data"];
  if (!data.username) issues.push("missing_username");
  const videosList = Array.isArray(data.videosList) ? data.videosList : [];
  const postRewards = Array.isArray(data.postRewards) ? data.postRewards : [];
  if (videosList.length === 0 && (Number(data.videoCount) > 0 || Number(data.totalVideos) > 0 || postRewards.length > 0)) {
    issues.push(`empty_videosList_but_has_videos(${data.videoCount || postRewards.length})`);
  }
  if (videosList.some((v) => !v.id)) issues.push("videosList_missing_ids");
  if (postRewards.some((v) => !v.id && !v.videoId)) issues.push("postRewards_missing_ids");
  if (data.videoCount != null && Number(data.videoCount) > 0 && videosList.length > Number(data.videoCount) + 50) {
    issues.push(`videosList_gt_videoCount(${videosList.length}>${data.videoCount})`);
  }
  const rewardIds = new Set(postRewards.map((p) => String(p.id || p.videoId || "")).filter(Boolean));
  const videoIds = new Set(videosList.map((v) => String(v.id || "")).filter(Boolean));
  let overlap = 0;
  for (const id of rewardIds) if (videoIds.has(id)) overlap += 1;
  if (postRewards.length > 0 && videosList.length > 0 && overlap < rewardIds.size) {
    issues.push(`partial_reward_overlap(${overlap}/${rewardIds.size})`);
  }
  return issues;
}

async function main() {
  const storageRoot = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outRoot = path.join(__dirname, "test-results", `run-${stamp}`);
  const profilesOut = path.join(outRoot, "profiles");
  fs.mkdirSync(profilesOut, { recursive: true });

  // Kill any existing agent process holding port 39741 so the test can
  // acquire the lock and receive extension poll requests in its own process.
  // Uses netstat (reliable on Windows) instead of Get-NetTCPConnection which
  // returns arrays and conflicts with PowerShell's $PID built-in variable.
  try {
    const { execSync } = await import("child_process");
    const netOut = execSync(
      `netstat -ano | findstr ":39741 " | findstr "LISTENING"`,
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    const match = netOut.match(/(\d+)\s*$/m);
    if (match) {
      const agentPid = match[1];
      console.log(`[*] Killing existing agent process PID ${agentPid} on :39741...`);
      try {
        execSync(`taskkill /PID ${agentPid} /F`, { timeout: 5000 });
        await new Promise((r) => setTimeout(r, 1200)); // allow port to free
      } catch { /* already dead */ }
    }
  } catch { /* port free or netstat unavailable */ }

  // Boot the local HTTP server so the extension can poll /pending-extension-sweep
  // and POST sweep results back during Tier 0 tests.
  // acquireAgentLock resolves false if port is already taken (agent running).
  const locked = await acquireAgentLock();
  if (locked) {
    console.log("[*] Agent lock acquired (HTTP server on :39741 ready for Tier 0)");
  } else {
    console.log("[*] Port :39741 in use — Tier 0 server already running (existing agent)");
  }


  console.log("============================================================");
  console.log("  CLIENT-AGENT ALL-PROFILES EXTRACTION TEST");
  console.log("============================================================");
  console.log("[*] Storage :", storageRoot);
  console.log("[*] Chrome  :", chromePath);
  console.log("[*] Output  :", outRoot);
  console.log("[*] Timeout     :", TIMEOUT_MS, "ms / profile");
  console.log("[*] Concurrency :", CONCURRENCY === 1 ? "1 (sequential)" : `${CONCURRENCY} parallel`);
  console.log("");


  if (!fs.existsSync(storageRoot)) {
    console.error("[!] Storage path does not exist.");
    process.exit(1);
  }
  if (!chromePath || !fs.existsSync(chromePath)) {
    console.error("[!] Chrome executable not found.");
    process.exit(1);
  }

  let profileIds = fs
    .readdirSync(storageRoot)
    .filter((d) => /^[0-9a-f-]{36}$/i.test(d))
    .filter((d) => fs.existsSync(path.join(storageRoot, d, "Default")))
    .sort();

  if (PROFILE_FILTER) {
    profileIds = profileIds.filter((d) => d.toLowerCase().includes(PROFILE_FILTER.toLowerCase()));
  }

  if (LIMIT > 0) profileIds = profileIds.slice(0, LIMIT);

  console.log(`[*] Found ${profileIds.length} profile(s) with Default/\n`);

  // Pre-read all profile metadata upfront (fast disk reads — no Playwright yet).
  const profileMeta = await Promise.all(
    profileIds.map(async (profileId) => {
      const profileDir = path.join(storageRoot, profileId);
      const meta = readGpmProfileMetaFromDisk(storageRoot, profileId);
      const diskHandle = await findTikTokHandleInProfileAsync(profileDir).catch(() => null);
      const cookiePath = path.join(profileDir, "Default", "Network", "Cookies");
      const cookieSize = fs.existsSync(cookiePath) ? fs.statSync(cookiePath).size : 0;
      return { profileDir, meta, diskHandle, cookieSize };
    })
  );

  // summaryRows is pre-allocated in profile order. Concurrent workers fill
  // each slot in-place, so the final summary is always in the original order.
  const summaryRows = profileIds.map((profileId, i) => ({
    index: i + 1,
    profileId,
    gpmName: profileMeta[i].meta.name || null,
    diskHandle: profileMeta[i].diskHandle || null,
    cookieKb: Number((profileMeta[i].cookieSize / 1024).toFixed(1)),
    status: "PENDING",
    elapsedMs: 0,
    error: null,
    issues: [],
    summary: null,
    files: {},
  }));

  // Flush running summary after each profile so partial results survive crashes.
  const flushSummary = () => {
    try {
      fs.writeFileSync(
        path.join(outRoot, "summary.json"),
        JSON.stringify(
          {
            startedAt: stamp,
            updatedAt: new Date().toISOString(),
            storageRoot,
            chromePath,
            concurrency: CONCURRENCY,
            timeoutMs: TIMEOUT_MS,
            totals: {
              profiles: summaryRows.length,
              ok: summaryRows.filter((r) => r.status === "OK").length,
              failed: summaryRows.filter((r) => r.status === "FAILED").length,
              skipped: summaryRows.filter((r) => r.status.startsWith("SKIPPED")).length,
            },
            profiles: summaryRows,
          },
          null,
          2
        ),
        "utf8"
      );
    } catch { /* ignore flush errors */ }
  };

  // Process a single profile, writing results to disk.
  // Called concurrently by the worker pool below.
  async function processProfile(i) {
    const profileId = profileIds[i];
    const { profileDir, meta, diskHandle, cookieSize } = profileMeta[i];
    const row = summaryRows[i];
    const label = `[${i + 1}/${profileIds.length}]`;

    console.log("------------------------------------------------------------");
    console.log(
      `${label} ${profileId.slice(0, 8)} | "${meta.name || "N/A"}" | @${diskHandle || "unknown"} | cookies=${(cookieSize / 1024).toFixed(0)}KB`
    );

    if (cookieSize === 0) {
      row.status = "SKIPPED_NO_COOKIES";
      row.error = "No Default/Network/Cookies database";
      console.log(`${label} -> SKIP: no cookies`);
      flushSummary();
      return;
    }

    const t0 = Date.now();
    let result;
    const ctl = { closers: new Set() };
    let timer;
    try {
      result = await Promise.race([
        extractProfileStudio(profileDir, profileId, chromePath, diskHandle, ctl),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      cancelExtensionSweep(profileId);
      await Promise.allSettled(
        [...ctl.closers].map((fn) => Promise.resolve().then(fn).catch(() => {}))
      );
      result = { success: false, error: err.message };
    } finally {
      if (timer) clearTimeout(timer);
    }
    row.elapsedMs = Date.now() - t0;

    const base =
      safeName(result?.data?.username || diskHandle || meta.name) +
      "__" +
      profileId.slice(0, 8);
    const fullPath = path.join(profilesOut, `${base}.full.json`);
    const slimPath = path.join(profilesOut, `${base}.summary.json`);

    if (result?.success && result.data) {
      row.status = "OK";
      row.summary = summarizeData(result.data);
      row.issues = consistencyChecks(result.data);

      const payload = {
        extractedAt: new Date().toISOString(),
        elapsedMs: row.elapsedMs,
        profileId,
        gpmName: meta.name || null,
        diskHandle: diskHandle || null,
        success: true,
        data: result.data,
        issues: row.issues,
      };
      fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), "utf8");
      fs.writeFileSync(
        slimPath,
        JSON.stringify(
          {
            extractedAt: payload.extractedAt,
            elapsedMs: row.elapsedMs,
            profileId,
            status: row.status,
            issues: row.issues,
            ...row.summary,
          },
          null,
          2
        ),
        "utf8"
      );
      row.files = { full: path.relative(outRoot, fullPath), summary: path.relative(outRoot, slimPath) };

      console.log(
        `${label} -> OK in ${(row.elapsedMs / 1000).toFixed(1)}s | @${row.summary.username} | videos=${row.summary.videosListCount} | postRewards=${row.summary.postRewardsCount} | revenue=${row.summary.currency || ""}${row.summary.totalRevenue ?? "?"} | method=${row.summary.extractionMethod}`
      );
      if (row.issues.length) console.log(`${label} -> issues:`, row.issues.join(", "));
    } else if (result?.skipped || result?.error === "browser_open_sweep_failed") {
      row.status = "SKIPPED_BROWSER_OPEN";
      row.error = result?.error || "browser_open_sweep_failed";
      console.log(`${label} -> SKIPPED (browser open — close it and rerun) in ${(row.elapsedMs / 1000).toFixed(1)}s`);
    } else {
      row.status = "FAILED";
      row.error = result?.error || "unknown_error";
      const failPath = path.join(profilesOut, `${base}.failed.json`);
      fs.writeFileSync(
        failPath,
        JSON.stringify(
          {
            extractedAt: new Date().toISOString(),
            elapsedMs: row.elapsedMs,
            profileId,
            gpmName: meta.name || null,
            diskHandle: diskHandle || null,
            success: false,
            error: row.error,
          },
          null,
          2
        ),
        "utf8"
      );
      row.files = { failed: path.relative(outRoot, failPath) };
      console.log(`${label} -> FAIL in ${(row.elapsedMs / 1000).toFixed(1)}s: ${row.error}`);
    }

    flushSummary();
  }

  // Concurrent worker pool: N workers each drain the shared index queue.
  // Profiles are always started in order (worker 1 takes index 0, worker 2
  // takes index 1, etc.) but may finish out of order — the label prefix
  // makes parallel output traceable.
  const queue = Array.from({ length: profileIds.length }, (_, i) => i);
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, profileIds.length) }, async () => {
      while (queue.length > 0) {
        const i = queue.shift();
        if (i !== undefined) await processProfile(i);
      }
    })
  );

  const ok = summaryRows.filter((r) => r.status === "OK");
  const failed = summaryRows.filter((r) => r.status === "FAILED");
  const skipped = summaryRows.filter((r) => r.status.startsWith("SKIPPED"));

  // Cross-profile consistency snapshot
  const byUser = {};
  for (const r of ok) {
    const u = (r.summary?.username || "").toLowerCase();
    if (!u) continue;
    if (!byUser[u]) byUser[u] = [];
    byUser[u].push({
      profileId: r.profileId,
      videosListCount: r.summary.videosListCount,
      postRewardsCount: r.summary.postRewardsCount,
      followersCount: r.summary.followersCount,
      totalRevenue: r.summary.totalRevenue,
      extractionMethod: r.summary.extractionMethod,
    });
  }

  const finalSummary = {
    startedAt: stamp,
    finishedAt: new Date().toISOString(),
    storageRoot,
    chromePath,
    concurrency: CONCURRENCY,
    timeoutMs: TIMEOUT_MS,
    totals: {
      profiles: summaryRows.length,
      ok: ok.length,
      failed: failed.length,
      skipped: skipped.length,
    },
    byUsername: byUser,
    profiles: summaryRows,
  };

  fs.writeFileSync(path.join(outRoot, "summary.json"), JSON.stringify(finalSummary, null, 2), "utf8");

  const latestDir = path.join(__dirname, "test-results", "latest");
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(path.join(latestDir, "summary.json"), JSON.stringify(finalSummary, null, 2), "utf8");
  fs.writeFileSync(
    path.join(latestDir, "README.txt"),
    `Full run output: ${outRoot}\nProfiles JSON: ${profilesOut}\n`,
    "utf8"
  );

  console.log("\n============================================================");
  console.log("  DONE");
  console.log("============================================================");
  console.log(`OK=${ok.length}  FAILED=${failed.length}  SKIPPED=${skipped.length}`);
  console.log(`Summary: ${path.join(outRoot, "summary.json")}`);
  console.log(`Latest : ${path.join(latestDir, "summary.json")}`);
  console.log(`Per-profile full dumps: ${profilesOut}`);

  // acquireAgentLock() keeps an HTTP server on :39741 which would otherwise
  // leave the Node process alive forever after main() resolves.
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("[!] Fatal:", err);
  process.exit(1);
});


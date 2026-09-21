/**
 * Four-scenario Tier consistency autotest.
 *
 * Scenarios (in order):
 *   A) 4 profile browsers OPEN  + GPM Login OPEN   → expect Tier-0 extension
 *   B) 4 profile browsers OPEN  + GPM Login CLOSED → expect Tier-0 extension
 *   C) all browsers CLOSED      + GPM Login CLOSED → expect Tier-2 cookie_bridge
 *   D) all browsers CLOSED      + GPM Login OPEN   → expect Tier-2 cookie_bridge
 *
 * Then deep-compares account metrics / videosList / postRewards across scenarios
 * so the same TikTok account yields aligned data regardless of tier.
 *
 * Usage:
 *   node test-tier-consistency.mjs
 *   node test-tier-consistency.mjs --profiles 500a1071,55e8115c,b255d876,997ff963
 *   node test-tier-consistency.mjs --count 4 --timeout 180000 --concurrency 2
 *   node test-tier-consistency.mjs --skip-gpm-control   # you manage GPM open/close manually
 *   node test-tier-consistency.mjs --scenarios A,B      # subset
 */
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, execFileSync } from "child_process";
import { fileURLToPath } from "url";
import {
  extractProfileStudio,
  getGpmStoragePath,
  getChromeExecutablePath,
  readGpmProfileMetaFromDisk,
  findTikTokHandleInProfileAsync,
  acquireAgentLock,
  cancelExtensionSweep,
  discoverGpmApiBase,
} from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

const TIMEOUT_MS = Number(argValue("--timeout", "180000")) || 180000;
const CONCURRENCY = Math.max(1, Math.min(4, Number(argValue("--concurrency", "2")) || 2));
const OPEN_COUNT = Math.max(1, Math.min(6, Number(argValue("--count", "4")) || 4));
const SKIP_GPM_CONTROL = hasFlag("--skip-gpm-control");
const SCENARIO_FILTER = new Set(
  String(argValue("--scenarios", "A,B,C,D"))
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);

const GPM_EXE_CANDIDATES = [
  path.join(process.env.LOCALAPPDATA || "", "Programs", "GPMLoginGlobal", "GPMLoginGlobal.exe"),
  path.join(process.env.APPDATA || "", "GPMLoginGlobal", "GPMLoginGlobal.exe"),
];

const PREFERRED_OPEN_PREFIXES = [
  "500a1071", // ousnowfan
  "55e8115c", // taolaongnoimay8484
  "b255d876", // hong.minh3808
  "997ff963", // nguyen.dat1479
  "4b36c020",
  "91d83a58",
];

const FLOAT_EPS = 0.02;
const RPM_EPS = 0.001;

// Account-level fields that must align across tiers (extractionMethod excluded).
const SCALAR_FIELDS = [
  "username",
  "country",
  "currency",
  "followersCount",
  "totalLikes",
  "totalViews",
  "videoCount",
  "totalVideos",
  "totalRevenue",
  "rpm",
];

const WINDOW_GROUPS = [
  ["sumRevenue", ["revenue7d", "revenue28d", "revenue60d", "totalRevenue"]],
  ["sumViews", ["views7d", "views28d", "views60d", "views365d", "totalViews"]],
  ["sumLikes", ["likes7d", "likes28d", "likes60d", "likes365d", "totalLikes"]],
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeName(s) {
  return (
    String(s || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "unknown"
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nearlyEqual(a, b, eps = FLOAT_EPS) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return String(a) === String(b);
  return Math.abs(na - nb) <= eps;
}

async function gpmApiOnline() {
  try {
    const gpm = await discoverGpmApiBase();
    return !!(gpm?.online && gpm?.base);
  } catch {
    return false;
  }
}

async function getGpmBase() {
  const gpm = await discoverGpmApiBase();
  if (!gpm?.online || !gpm.base) throw new Error("GPM API offline");
  return gpm.base;
}

function findGpmExe() {
  for (const p of GPM_EXE_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function listGpmProcesses() {
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'GPMLogin' -and $_.Name -notmatch 'chrome|orbita' } | Select-Object -ExpandProperty ProcessId",
      ],
      { encoding: "utf8", timeout: 15000 }
    );
    return String(out)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

async function ensureGpmOpen({ timeoutMs = 90_000 } = {}) {
  if (await gpmApiOnline()) {
    console.log("   [GPM] already online");
    return true;
  }
  if (SKIP_GPM_CONTROL) {
    throw new Error("GPM API offline and --skip-gpm-control set");
  }
  const exe = findGpmExe();
  if (!exe) throw new Error("GPMLoginGlobal.exe not found");
  console.log(`   [GPM] starting ${exe}`);
  spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2000);
    if (await gpmApiOnline()) {
      console.log("   [GPM] API ready");
      return true;
    }
  }
  throw new Error("GPM API did not come online in time");
}

async function ensureGpmClosed() {
  if (!(await gpmApiOnline()) && listGpmProcesses().length === 0) {
    console.log("   [GPM] already closed");
    return;
  }
  if (SKIP_GPM_CONTROL) {
    if (await gpmApiOnline()) throw new Error("GPM still online and --skip-gpm-control set");
    return;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const pids = listGpmProcesses();
    console.log(`   [GPM] close attempt ${attempt}: ${pids.length} process(es) (no /T — keep profile browsers alive)`);
    for (const pid of pids) {
      // IMPORTANT: do NOT use taskkill /T — GPM is the parent of profile Chromium
      // processes, and /T would kill open browsers (breaking scenario B).
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore" });
      } catch {
        try {
          process.kill(pid);
        } catch {
          /* ignore */
        }
      }
    }
    // Image-name kill also without /T
    for (const image of ["GPMLoginGlobal.exe", "GPMLogin.exe"]) {
      try {
        execFileSync("taskkill", ["/IM", image, "/F"], { stdio: "ignore" });
      } catch {
        /* ignore */
      }
    }
    await sleep(2000);
    if (!(await gpmApiOnline()) && listGpmProcesses().length === 0) {
      console.log("   [GPM] closed");
      return;
    }
  }

  if (listGpmProcesses().length === 0) {
    await sleep(2000);
    if (!(await gpmApiOnline())) {
      console.log("   [GPM] closed");
      return;
    }
    console.warn("   [GPM] no process left but API probe still responds — continuing as closed");
    return;
  }
  throw new Error("Failed to close GPM Login");
}

function listOpenBrowserProfileIds(storageRoot) {
  const open = [];
  for (const id of fs.readdirSync(storageRoot)) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    const dir = path.join(storageRoot, id);
    if (!fs.existsSync(path.join(dir, "Default"))) continue;
    const lock = fs.existsSync(path.join(dir, "SingletonLock"));
    const dt = fs.existsSync(path.join(dir, "DevToolsActivePort"));
    if (lock || dt) open.push(id.toLowerCase());
  }
  // Also detect via chrome command line (more reliable than SingletonLock on some builds)
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { $_.CommandLine }`,
      ],
      { encoding: "utf8", timeout: 20000 }
    );
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    for (const line of String(out).split(/\r?\n/)) {
      const m = line.match(uuidRe);
      if (m) {
        for (const id of m) {
          const low = id.toLowerCase();
          if (!open.includes(low) && fs.existsSync(path.join(storageRoot, low, "Default"))) {
            open.push(low);
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(open)];
}

async function closeProfileBrowser(profileId, storageRoot) {
  // Prefer GPM API when online
  try {
    if (await gpmApiOnline()) {
      const base = await getGpmBase();
      await fetch(`${base}/profiles/close/${profileId}`, {
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      await sleep(800);
    }
  } catch {
    /* ignore */
  }
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$id='${profileId}'; Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape($id) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ],
      { stdio: "ignore", timeout: 20000 }
    );
  } catch {
    /* ignore */
  }
  await sleep(500);
}

async function closeAllProfileBrowsers(storageRoot) {
  const open = listOpenBrowserProfileIds(storageRoot);
  console.log(`   [BROWSER] closing ${open.length} open profile(s)`);
  for (const id of open) await closeProfileBrowser(id, storageRoot);
  await sleep(1000);
  const left = listOpenBrowserProfileIds(storageRoot);
  if (left.length) {
    console.warn(`   [BROWSER] still open: ${left.map((x) => x.slice(0, 8)).join(", ")}`);
  }
}

async function startProfileBrowser(profileId) {
  const base = await getGpmBase();
  const url = encodeURIComponent("https://www.tiktok.com/tiktokstudio");
  const resp = await fetch(
    `${base}/profiles/start/${profileId}?skip_proxy_check=true&url=${url}`,
    { signal: AbortSignal.timeout(60000) }
  );
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok && !/already|in\s*use|running/i.test(JSON.stringify(json))) {
    throw new Error(`start ${profileId.slice(0, 8)} failed: HTTP ${resp.status} ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

function pickOpenProfiles(storageRoot, explicitCsv) {
  const all = fs
    .readdirSync(storageRoot)
    .filter((d) => /^[0-9a-f-]{36}$/i.test(d))
    .filter((d) => fs.existsSync(path.join(storageRoot, d, "Default")))
    .map((d) => d.toLowerCase());

  if (explicitCsv) {
    const wanted = explicitCsv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const picked = [];
    for (const w of wanted) {
      const hit = all.find((id) => id.includes(w) || id.startsWith(w));
      if (hit) picked.push(hit);
    }
    if (!picked.length) throw new Error(`No profiles matched --profiles ${explicitCsv}`);
    return [...new Set(picked)].slice(0, OPEN_COUNT);
  }

  const ranked = [];
  for (const pref of PREFERRED_OPEN_PREFIXES) {
    const hit = all.find((id) => id.startsWith(pref));
    if (hit) ranked.push(hit);
  }
  for (const id of all) {
    if (!ranked.includes(id)) ranked.push(id);
  }
  // Prefer profiles that already have a TikTokFlow session cookie cache
  const sessionsDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "TikTokFlow", "sessions");
  ranked.sort((a, b) => {
    const sa = fs.existsSync(path.join(sessionsDir, `${a}.json`)) ? 0 : 1;
    const sb = fs.existsSync(path.join(sessionsDir, `${b}.json`)) ? 0 : 1;
    return sa - sb;
  });
  return ranked.slice(0, OPEN_COUNT);
}

function listAllProfileIds(storageRoot) {
  return fs
    .readdirSync(storageRoot)
    .filter((d) => /^[0-9a-f-]{36}$/i.test(d))
    .filter((d) => fs.existsSync(path.join(storageRoot, d, "Default")))
    .map((d) => d.toLowerCase())
    .sort();
}

async function extractMany(profileIds, { label, outDir, chromePath, storageRoot, concurrency }) {
  fs.mkdirSync(path.join(outDir, "profiles"), { recursive: true });
  const rows = [];
  const queue = [...profileIds];
  const pool = Math.max(1, Math.min(concurrency || CONCURRENCY, profileIds.length));
  const workers = Array.from({ length: pool }, async () => {
    while (queue.length) {
      const profileId = queue.shift();
      if (!profileId) break;
      const profileDir = path.join(storageRoot, profileId);
      const meta = readGpmProfileMetaFromDisk(storageRoot, profileId);
      const diskHandle = await findTikTokHandleInProfileAsync(profileDir).catch(() => null);
      const idx = rows.length + 1;
      console.log(
        `   [${label}] ${profileId.slice(0, 8)} | "${meta.name || "N/A"}" | @${diskHandle || "unknown"}`
      );
      const t0 = Date.now();
      const ctl = { closers: new Set() };
      let timer;
      let result;
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
        result = { success: false, error: err?.message || String(err) };
      } finally {
        if (timer) clearTimeout(timer);
      }
      const elapsedMs = Date.now() - t0;
      const username = result?.data?.username || diskHandle || null;
      const base = `${safeName(username)}__${profileId.slice(0, 8)}`;
      const row = {
        profileId,
        gpmName: meta.name || null,
        diskHandle,
        elapsedMs,
        success: !!result?.success,
        error: result?.error || null,
        skipped: !!result?.skipped,
        method: result?.data?.extractionMethod || null,
        username,
      };
      if (result?.success && result.data) {
        const fullPath = path.join(outDir, "profiles", `${base}.full.json`);
        fs.writeFileSync(
          fullPath,
          JSON.stringify(
            {
              scenario: label,
              extractedAt: new Date().toISOString(),
              elapsedMs,
              profileId,
              gpmName: meta.name || null,
              success: true,
              data: result.data,
            },
            null,
            2
          ),
          "utf8"
        );
        row.file = fullPath;
        row.data = result.data;
        console.log(
          `   [${label}] OK @${username} method=${row.method} videos=${result.data.videoCount} list=${result.data.videosList?.length || 0} rewards=${result.data.postRewards?.length || 0} country=${result.data.country} likes=${result.data.totalLikes} (${(elapsedMs / 1000).toFixed(1)}s)`
        );
      } else {
        const failPath = path.join(outDir, "profiles", `${base || profileId.slice(0, 8)}.failed.json`);
        fs.writeFileSync(failPath, JSON.stringify({ scenario: label, profileId, ...row }, null, 2));
        console.log(`   [${label}] FAIL ${profileId.slice(0, 8)}: ${row.error}`);
      }
      rows.push(row);
    }
  });
  await Promise.all(workers);
  return rows;
}

function videoKey(v) {
  return String(v?.id || v?.videoId || "");
}

function rewardKey(pr) {
  const id = String(pr?.id || pr?.videoId || "");
  const prog = String(pr?.programId ?? pr?.programName ?? "9");
  return `${id}|${prog}`;
}

function canonicalizeAccount(data) {
  if (!data) return null;
  const videos = {};
  for (const v of data.videosList || []) {
    const k = videoKey(v);
    if (!k) continue;
    videos[k] = {
      views: num(v.views) ?? 0,
      likes: num(v.likes) ?? 0,
      comments: num(v.comments) ?? 0,
      shares: num(v.shares) ?? 0,
      reward: num(v.reward ?? v.rewards) ?? 0,
      programName: v.programName || null,
      duration: v.duration || null,
    };
  }
  const rewards = {};
  for (const pr of data.postRewards || []) {
    const k = rewardKey(pr);
    if (!k.startsWith("|")) {
      rewards[k] = {
        reward: num(pr.reward ?? pr.rewards) ?? 0,
        views: num(pr.views) ?? 0,
        programName: pr.programName || null,
        programId: pr.programId ?? null,
        rpm: pr.rpm ?? null,
      };
    }
  }
  const out = {
    username: data.username || null,
    country: data.country || null,
    currency: data.currency || null,
    followersCount: num(data.followersCount),
    totalLikes: num(data.totalLikes),
    totalViews: num(data.totalViews),
    videoCount: num(data.videoCount ?? data.totalVideos),
    totalVideos: num(data.totalVideos ?? data.videoCount),
    totalRevenue: num(data.totalRevenue),
    rpm: num(data.rpm),
    method: data.extractionMethod || null,
    videos,
    rewards,
    windows: {},
  };
  for (const [group, keys] of WINDOW_GROUPS) {
    const src = data[group] || {};
    out.windows[group] = {};
    for (const k of keys) out.windows[group][k] = num(src[k]);
  }
  return out;
}

function diffAccounts(a, b, { softCollection = true } = {}) {
  const mismatches = [];
  const warnings = [];
  if (!a || !b) {
    mismatches.push({ type: "missing_side", detail: !a ? "left_null" : "right_null" });
    return { mismatches, warnings, ok: false };
  }

  for (const field of SCALAR_FIELDS) {
    const av = a[field];
    const bv = b[field];
    const eps = field === "rpm" ? RPM_EPS : field === "totalRevenue" ? FLOAT_EPS : 0;
    if (eps > 0) {
      if (!nearlyEqual(av, bv, eps)) {
        mismatches.push({ type: "scalar", field, left: av, right: bv });
      }
    } else if (av !== bv && !(av == null && bv == null)) {
      // videoCount/totalVideos: allow either side if one is null
      if ((field === "videoCount" || field === "totalVideos") && (av == null || bv == null)) {
        warnings.push({ type: "scalar_null", field, left: av, right: bv });
      } else {
        mismatches.push({ type: "scalar", field, left: av, right: bv });
      }
    }
  }

  for (const [group, keys] of WINDOW_GROUPS) {
    for (const k of keys) {
      const av = a.windows?.[group]?.[k];
      const bv = b.windows?.[group]?.[k];
      const eps = group === "sumRevenue" ? FLOAT_EPS : 0;
      if (!nearlyEqual(av, bv, eps) && !(av == null && bv == null)) {
        // insights windows should match; treat as mismatch
        mismatches.push({ type: "window", field: `${group}.${k}`, left: av, right: bv });
      }
    }
  }

  const videoIds = new Set([...Object.keys(a.videos), ...Object.keys(b.videos)]);
  let videoShared = 0;
  let videoMismatch = 0;
  for (const id of videoIds) {
    const av = a.videos[id];
    const bv = b.videos[id];
    if (!av || !bv) {
      (softCollection ? warnings : mismatches).push({
        type: "video_missing",
        id,
        side: !av ? "left" : "right",
      });
      continue;
    }
    videoShared += 1;
    for (const f of ["views", "likes", "comments", "shares", "reward", "duration", "programName"]) {
      const eps = f === "reward" ? FLOAT_EPS : 0;
      if (eps > 0) {
        if (!nearlyEqual(av[f], bv[f], eps)) {
          videoMismatch += 1;
          mismatches.push({ type: "video_field", id, field: f, left: av[f], right: bv[f] });
        }
      } else if (av[f] !== bv[f] && !(av[f] == null && bv[f] == null)) {
        // Live play_count can tick between scenario runs — allow ±1 on engagement.
        if (
          (f === "views" || f === "likes" || f === "comments" || f === "shares") &&
          Number.isFinite(Number(av[f])) &&
          Number.isFinite(Number(bv[f])) &&
          Math.abs(Number(av[f]) - Number(bv[f])) <= 1
        ) {
          warnings.push({ type: "video_field_live_drift", id, field: f, left: av[f], right: bv[f] });
          continue;
        }
        // programName may be absent on non-reward videos — warn only
        if (f === "programName" && (!av[f] || !bv[f])) {
          warnings.push({ type: "video_field", id, field: f, left: av[f], right: bv[f] });
        } else {
          videoMismatch += 1;
          mismatches.push({ type: "video_field", id, field: f, left: av[f], right: bv[f] });
        }
      }
    }
  }

  const rewardIds = new Set([...Object.keys(a.rewards), ...Object.keys(b.rewards)]);
  for (const id of rewardIds) {
    const av = a.rewards[id];
    const bv = b.rewards[id];
    if (!av || !bv) {
      (softCollection ? warnings : mismatches).push({
        type: "reward_missing",
        id,
        side: !av ? "left" : "right",
      });
      continue;
    }
    if (!nearlyEqual(av.reward, bv.reward, FLOAT_EPS)) {
      mismatches.push({ type: "reward_field", id, field: "reward", left: av.reward, right: bv.reward });
    }
    // m10n period views tick between runs — warn only (reward $ is authoritative).
    if (av.views !== bv.views && av.views != null && bv.views != null) {
      warnings.push({ type: "reward_field_live_drift", id, field: "views", left: av.views, right: bv.views });
    }
  }

  // Hard fail if lookback collections diverge a lot (>25% either side)
  const aV = Object.keys(a.videos).length;
  const bV = Object.keys(b.videos).length;
  if (aV > 0 && bV > 0) {
    const ratio = Math.min(aV, bV) / Math.max(aV, bV);
    if (ratio < 0.75) {
      mismatches.push({
        type: "videosList_size_drift",
        left: aV,
        right: bV,
        shared: videoShared,
      });
    } else if (aV !== bV) {
      warnings.push({ type: "videosList_size", left: aV, right: bV, shared: videoShared });
    }
  }
  const aR = Object.keys(a.rewards).length;
  const bR = Object.keys(b.rewards).length;
  if (aR > 0 && bR > 0) {
    const ratio = Math.min(aR, bR) / Math.max(aR, bR);
    if (ratio < 0.75) {
      mismatches.push({ type: "postRewards_size_drift", left: aR, right: bR });
    } else if (aR !== bR) {
      warnings.push({ type: "postRewards_size", left: aR, right: bR });
    }
  }

  return {
    mismatches,
    warnings,
    ok: mismatches.length === 0,
    videoShared,
    videoMismatch,
  };
}

function indexRowsByUsername(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.success || !row.data?.username) continue;
    const key = String(row.data.username).replace(/^@/, "").toLowerCase();
    map.set(key, row);
  }
  return map;
}

async function runScenario(name, { profileIds, openIds, storageRoot, chromePath, runRoot, expectMethods, concurrency }) {
  const outDir = path.join(runRoot, name);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`\n========== SCENARIO ${name} ==========`);
  console.log(`profiles=${profileIds.length} openExpect=${(openIds || []).map((x) => x.slice(0, 8)).join(",") || "-"}`);
  console.log(`gpm=${(await gpmApiOnline()) ? "ONLINE" : "OFFLINE"} browsers=${listOpenBrowserProfileIds(storageRoot).map((x) => x.slice(0, 8)).join(",") || "none"}`);

  const rows = await extractMany(profileIds, {
    label: name,
    outDir,
    chromePath,
    storageRoot,
    concurrency: concurrency || CONCURRENCY,
  });

  const summary = {
    scenario: name,
    at: new Date().toISOString(),
    gpmOnline: await gpmApiOnline(),
    openBrowsers: listOpenBrowserProfileIds(storageRoot),
    expectMethods: expectMethods || [],
    ok: rows.filter((r) => r.success).length,
    failed: rows.filter((r) => !r.success && !r.skipped).length,
    skipped: rows.filter((r) => r.skipped).length,
    rows: rows.map((r) => ({
      profileId: r.profileId,
      username: r.username,
      success: r.success,
      method: r.method,
      error: r.error,
      elapsedMs: r.elapsedMs,
      country: r.data?.country ?? null,
      videoCount: r.data?.videoCount ?? null,
      totalLikes: r.data?.totalLikes ?? null,
      totalRevenue: r.data?.totalRevenue ?? null,
      rpm: r.data?.rpm ?? null,
      videosList: r.data?.videosList?.length ?? null,
      postRewards: r.data?.postRewards?.length ?? null,
    })),
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  return { name, outDir, rows, summary };
}

async function main() {
  const compareOnly = argValue("--compare-only", null);
  if (compareOnly) {
    const runRoot = path.resolve(compareOnly);
    const results = {};
    const labelMap = {
      A: "A_browsers_open_gpm_open",
      B: "B_browsers_open_gpm_closed",
      C: "C_browsers_closed_gpm_closed",
      D: "D_browsers_closed_gpm_open",
    };
    for (const [key, dirName] of Object.entries(labelMap)) {
      if (!SCENARIO_FILTER.has(key)) continue;
      const dir = path.join(runRoot, dirName);
      const profDir = path.join(dir, "profiles");
      if (!fs.existsSync(profDir)) continue;
      const rows = [];
      for (const f of fs.readdirSync(profDir)) {
        if (!f.endsWith(".full.json")) continue;
        const raw = JSON.parse(fs.readFileSync(path.join(profDir, f), "utf8"));
        const data = raw.data || raw;
        rows.push({
          profileId: raw.profileId || "",
          username: data.username || raw.username || null,
          success: true,
          method: data.extractionMethod || raw.method || null,
          error: null,
          data,
        });
      }
      results[key] = { name: dirName, outDir: dir, rows, summary: { scenario: dirName } };
    }
    // Fall through to shared comparison below via early compare path
    const scenarioKeys = Object.keys(results);
    console.log(`[*] Compare-only: ${runRoot}`);
    console.log(`[*] Scenarios loaded: ${scenarioKeys.join(",")}`);

    console.log("\n============================================================");
    console.log("  CROSS-SCENARIO COMPARISON");
    console.log("============================================================");

    const byScenario = {};
    for (const k of scenarioKeys) byScenario[k] = indexRowsByUsername(results[k].rows);
    const usernames = new Set();
    for (const k of scenarioKeys) for (const u of byScenario[k].keys()) usernames.add(u);
    const pairs = [];
    for (let i = 0; i < scenarioKeys.length; i++) {
      for (let j = i + 1; j < scenarioKeys.length; j++) pairs.push([scenarioKeys[i], scenarioKeys[j]]);
    }
    const perAccount = [];
    let hardFails = 0;
    let warnAccounts = 0;
    for (const username of [...usernames].sort()) {
      const present = scenarioKeys.filter((k) => byScenario[k].has(username));
      if (present.length < 2) continue;
      const accountReport = {
        username,
        present,
        methods: Object.fromEntries(present.map((k) => [k, byScenario[k].get(username).method])),
        pairDiffs: [],
        status: "OK",
      };
      let accountFailed = false;
      let accountWarned = false;
      for (const [left, right] of pairs) {
        if (!byScenario[left].has(username) || !byScenario[right].has(username)) continue;
        const a = canonicalizeAccount(byScenario[left].get(username).data);
        const b = canonicalizeAccount(byScenario[right].get(username).data);
        const diff = diffAccounts(a, b, { softCollection: true });
        accountReport.pairDiffs.push({
          pair: `${left}_vs_${right}`,
          ok: diff.ok,
          mismatchCount: diff.mismatches.length,
          warningCount: diff.warnings.length,
          mismatches: diff.mismatches.slice(0, 40),
          warnings: diff.warnings.slice(0, 40),
        });
        if (!diff.ok) accountFailed = true;
        if (diff.warnings.length) accountWarned = true;
      }
      if (accountFailed) {
        accountReport.status = "MISMATCH";
        hardFails += 1;
        console.log(`  ✗ @${username} MISMATCH across ${present.join(",")}`);
        for (const pd of accountReport.pairDiffs.filter((p) => !p.ok)) {
          console.log(`      ${pd.pair}: ${pd.mismatchCount} mismatch(es)`);
          for (const m of pd.mismatches.slice(0, 6)) {
            console.log(`         - ${m.type} ${m.field || ""} ${m.id || ""} left=${m.left} right=${m.right}`);
          }
        }
      } else if (accountWarned) {
        accountReport.status = "OK_WARN";
        warnAccounts += 1;
        console.log(`  ~ @${username} OK (warnings)`);
      } else {
        console.log(`  ✓ @${username} aligned across ${present.join(",")}`);
      }
      perAccount.push(accountReport);
    }
    const report = {
      at: new Date().toISOString(),
      runRoot,
      compareOnly: true,
      hardFails,
      warnAccounts,
      pass: hardFails === 0,
      perAccount,
    };
    fs.writeFileSync(path.join(runRoot, "comparison-rescored.json"), JSON.stringify(report, null, 2));
    console.log("\n============================================================");
    console.log(report.pass ? "  PASS — data aligned across tiers/scenarios" : "  FAIL — mismatches found");
    console.log("============================================================");
    console.log(`hardFails=${hardFails}  warnings=${warnAccounts}`);
    process.exit(report.pass ? 0 : 1);
  }

  const storageRoot = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = path.join(__dirname, "test-results", `tier-consistency-${stamp}`);
  fs.mkdirSync(runRoot, { recursive: true });

  console.log("============================================================");
  console.log("  TIER CONSISTENCY AUTOTEST (4 scenarios)");
  console.log("============================================================");
  console.log(`[*] Storage : ${storageRoot}`);
  console.log(`[*] Chrome  : ${chromePath}`);
  console.log(`[*] Output  : ${runRoot}`);
  console.log(`[*] Open set: ${OPEN_COUNT} browsers`);
  console.log(`[*] Scenarios: ${[...SCENARIO_FILTER].join(",")}`);

  const locked = await acquireAgentLock();
  if (!locked) {
    console.error("[!] Could not acquire :39741 — stop the other Agent first (stop-agent.bat).");
    process.exit(1);
  }
  console.log("[*] Agent lock acquired on :39741");

  const openSet = pickOpenProfiles(storageRoot, argValue("--profiles", null));
  const allProfiles = listAllProfileIds(storageRoot);
  console.log(`[*] Open-browser profiles: ${openSet.map((x) => x.slice(0, 8)).join(", ")}`);
  console.log(`[*] All profiles on disk: ${allProfiles.length}`);

  const results = {};

  // ---- Scenario A: browsers open + GPM open ----
  if (SCENARIO_FILTER.has("A")) {
    await ensureGpmOpen();
    await closeAllProfileBrowsers(storageRoot);
    console.log("   [BROWSER] starting open set…");
    for (const id of openSet) {
      try {
        await startProfileBrowser(id);
        console.log(`   [BROWSER] started ${id.slice(0, 8)}`);
      } catch (err) {
        console.warn(`   [BROWSER] start ${id.slice(0, 8)}: ${err.message}`);
      }
      await sleep(2500);
    }
    await sleep(8000); // let extensions link / Studio settle
    results.A = await runScenario("A_browsers_open_gpm_open", {
      profileIds: openSet,
      openIds: openSet,
      storageRoot,
      chromePath,
      runRoot,
      expectMethods: ["extension"],
      concurrency: 1, // sequential — parallel Tier-0 sweeps race on MV3 SW
    });
  }

  // ---- Scenario B: browsers open + GPM closed ----
  if (SCENARIO_FILTER.has("B")) {
    // Ensure the 4 browsers are open (reuse A if present)
    if (!(await gpmApiOnline())) {
      // Need GPM briefly to open browsers if A was skipped
      if (!SCENARIO_FILTER.has("A")) {
        await ensureGpmOpen();
        await closeAllProfileBrowsers(storageRoot);
        for (const id of openSet) {
          await startProfileBrowser(id).catch((e) => console.warn(e.message));
          await sleep(2500);
        }
        await sleep(8000);
      }
    } else if (!SCENARIO_FILTER.has("A")) {
      await closeAllProfileBrowsers(storageRoot);
      for (const id of openSet) {
        await startProfileBrowser(id).catch((e) => console.warn(e.message));
        await sleep(2500);
      }
      await sleep(8000);
    }
    await ensureGpmClosed();
    // Verify browsers still open — if GPM teardown killed them, reopen via brief GPM bounce
    let still = listOpenBrowserProfileIds(storageRoot);
    console.log(`   [BROWSER] after GPM close still open: ${still.map((x) => x.slice(0, 8)).join(",") || "NONE"}`);
    const missing = openSet.filter((id) => !still.includes(id.toLowerCase()) && !still.some((s) => s.startsWith(id.slice(0, 8))));
    if (missing.length) {
      console.warn(`   [BROWSER] ${missing.length} browser(s) died with GPM — bouncing GPM to reopen them`);
      await ensureGpmOpen();
      for (const id of missing) {
        await startProfileBrowser(id).catch((e) => console.warn(e.message));
        await sleep(2500);
      }
      await sleep(8000);
      await ensureGpmClosed();
      still = listOpenBrowserProfileIds(storageRoot);
      console.log(`   [BROWSER] after reopen+close GPM: ${still.map((x) => x.slice(0, 8)).join(",") || "NONE"}`);
    }
    results.B = await runScenario("B_browsers_open_gpm_closed", {
      profileIds: openSet,
      openIds: openSet,
      storageRoot,
      chromePath,
      runRoot,
      expectMethods: ["extension"],
      concurrency: 1,
    });
  }

  // ---- Scenario C: browsers closed + GPM closed ----
  if (SCENARIO_FILTER.has("C")) {
    // Force-close the open set even if detection flaps after GPM kill.
    console.log("   [BROWSER] force-closing open set + any detected browsers…");
    for (const id of openSet) await closeProfileBrowser(id, storageRoot);
    await closeAllProfileBrowsers(storageRoot);
    await ensureGpmClosed();
    results.C = await runScenario("C_browsers_closed_gpm_closed", {
      profileIds: allProfiles,
      openIds: [],
      storageRoot,
      chromePath,
      runRoot,
      expectMethods: ["cookie_bridge"],
    });
  }

  // ---- Scenario D: browsers closed + GPM open ----
  if (SCENARIO_FILTER.has("D")) {
    await closeAllProfileBrowsers(storageRoot);
    await ensureGpmOpen();
    results.D = await runScenario("D_browsers_closed_gpm_open", {
      profileIds: allProfiles,
      openIds: [],
      storageRoot,
      chromePath,
      runRoot,
      expectMethods: ["cookie_bridge"],
    });
  }

  // ---- Cross-scenario comparison ----
  console.log("\n============================================================");
  console.log("  CROSS-SCENARIO COMPARISON");
  console.log("============================================================");

  const scenarioKeys = Object.keys(results);
  const byScenario = {};
  for (const k of scenarioKeys) {
    byScenario[k] = indexRowsByUsername(results[k].rows);
  }

  // Universe of usernames from open-set scenarios + all
  const usernames = new Set();
  for (const k of scenarioKeys) {
    for (const u of byScenario[k].keys()) usernames.add(u);
  }

  const pairs = [];
  for (let i = 0; i < scenarioKeys.length; i++) {
    for (let j = i + 1; j < scenarioKeys.length; j++) {
      pairs.push([scenarioKeys[i], scenarioKeys[j]]);
    }
  }

  const perAccount = [];
  let hardFails = 0;
  let warnAccounts = 0;

  for (const username of [...usernames].sort()) {
    const present = scenarioKeys.filter((k) => byScenario[k].has(username));
    if (present.length < 2) {
      perAccount.push({
        username,
        present,
        status: "SKIP_SINGLE_SCENARIO",
        note: "Only one scenario has this account — nothing to compare",
      });
      continue;
    }

    const accountReport = {
      username,
      present,
      methods: Object.fromEntries(
        present.map((k) => [k, byScenario[k].get(username).method])
      ),
      pairDiffs: [],
      status: "OK",
    };

    let accountFailed = false;
    let accountWarned = false;

    for (const [left, right] of pairs) {
      if (!byScenario[left].has(username) || !byScenario[right].has(username)) continue;
      const a = canonicalizeAccount(byScenario[left].get(username).data);
      const b = canonicalizeAccount(byScenario[right].get(username).data);
      const diff = diffAccounts(a, b, { softCollection: true });
      accountReport.pairDiffs.push({
        pair: `${left}_vs_${right}`,
        ok: diff.ok,
        mismatchCount: diff.mismatches.length,
        warningCount: diff.warnings.length,
        mismatches: diff.mismatches.slice(0, 40),
        warnings: diff.warnings.slice(0, 40),
      });
      if (!diff.ok) accountFailed = true;
      if (diff.warnings.length) accountWarned = true;
    }

    if (accountFailed) {
      accountReport.status = "MISMATCH";
      hardFails += 1;
      console.log(`  ✗ @${username} MISMATCH across ${present.join(",")}`);
      for (const pd of accountReport.pairDiffs.filter((p) => !p.ok)) {
        console.log(`      ${pd.pair}: ${pd.mismatchCount} mismatch(es)`);
        for (const m of pd.mismatches.slice(0, 8)) {
          console.log(`         - ${m.type} ${m.field || m.id || ""} left=${m.left} right=${m.right}`);
        }
      }
    } else if (accountWarned) {
      accountReport.status = "OK_WITH_WARNINGS";
      warnAccounts += 1;
      console.log(`  ~ @${username} OK (lookback collection warnings)`);
    } else {
      console.log(`  ✓ @${username} aligned across ${present.join(",")}`);
    }

    perAccount.push(accountReport);
  }

  const report = {
    at: new Date().toISOString(),
    runRoot,
    openSet,
    scenarios: Object.fromEntries(
      scenarioKeys.map((k) => [
        k,
        {
          dir: results[k].outDir,
          summary: results[k].summary,
        },
      ])
    ),
    hardFails,
    warnAccounts,
    comparedAccounts: perAccount.filter((p) => p.status !== "SKIP_SINGLE_SCENARIO").length,
    perAccount,
    pass: hardFails === 0,
  };

  fs.writeFileSync(path.join(runRoot, "comparison.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(runRoot, "README.txt"),
    [
      "Tier consistency autotest",
      `pass=${report.pass}`,
      `hardFails=${hardFails} warnAccounts=${warnAccounts}`,
      `openSet=${openSet.join(",")}`,
      "",
      "Scenarios:",
      ...scenarioKeys.map((k) => `  ${k}: ${results[k].outDir}`),
      "",
      "See comparison.json for per-account diffs.",
    ].join("\n")
  );

  // Mirror latest pointer
  const latestDir = path.join(__dirname, "test-results", "latest-tier-consistency");
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(path.join(latestDir, "comparison.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(latestDir, "README.txt"), `Latest run: ${runRoot}\npass=${report.pass}\n`);

  console.log("\n============================================================");
  console.log(report.pass ? "  PASS — data aligned across tiers/scenarios" : "  FAIL — mismatches found");
  console.log("============================================================");
  console.log(`hardFails=${hardFails}  warnings=${warnAccounts}`);
  console.log(`Report: ${path.join(runRoot, "comparison.json")}`);

  // Leave agent usable: lock is held by this process until exit.
  // Restart note for operator.
  console.log("\n[*] Exiting (releases :39741). Restart `node agent.js` if you need the daemon.");
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[!] Fatal:", err);
  process.exit(1);
});

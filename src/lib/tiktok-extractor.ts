import fs from "fs";
import path from "path";
import os from "os";
import { chromium, type BrowserContext, type Page, type Response } from "playwright";
import { gpmClient } from "./gpm-api";
import {
  matchUniqueGpmProfileByUsername,
  scoreLoggedInHandleFromArtifacts,
  scoreUsernameInArtifacts,
} from "./tiktok-handle";
import { sumStudioInsightPeriod } from "./daily-views-breakdown";

export interface ExtractedTikTokData {
  username: string;
  nickname?: string;
  country?: string;
  currency?: string;
  followersCount: number;
  followingCount: number;
  totalLikes: number;
  videoCount: number;
  totalVideos?: number;
  totalViews: number;
  totalRevenue?: number | null;
  totalRewardsUsd?: number | null;
  rpm?: number | null;
  isLoggedIn: boolean;
  // Per-Video and Top Videos
  videosList?: any[];
  topVideos?: any;

  // Structured summaries & breakdowns matching agent.js & schema
  sumRevenue?: {
    revenue7d: number;
    revenue28d: number;
    revenue60d: number;
    revenue365d: number;
    totalRevenue: number;
  } | null;
  sumViews?: {
    views7d: number;
    views28d: number;
    views60d: number;
    views365d: number;
    totalViews: number;
  } | null;
  sumLikes?: {
    likes7d: number;
    likes28d: number;
    likes60d: number;
    likes365d: number;
    totalLikes: number;
  } | null;
  sumComments?: {
    comments7d: number;
    comments28d: number;
    comments60d: number;
    comments365d: number;
  } | null;
  sumShares?: {
    shares7d: number;
    shares28d: number;
    shares60d: number;
    shares365d: number;
  } | null;
  sumProfileViews?: {
    profileViews7d: number;
    profileViews28d: number;
    profileViews60d: number;
    profileViews365d: number;
  } | null;
  revenueBreakdown?: {
    totalRevenue: any;
    tiktokShop?: any;
    activePrograms?: any[];
  } | null;
  dailyRevenueBreakdown?: Array<{ date: string; revenue: number }> | null;
  insightsHistory?: Record<string, any> | null;
}

interface ScrapedTikTokData {
  followers: number;
  following: number;
  likes: number;
  nickname: string;
  videoCount: number;
  totalViews: number;
}

export interface CreatorRewardsData {
  totalRewardsUsd: number | null;
  tiktokShopRewardsUsd: number | null;
  currency?: string;
  // NOTE: rpm is intentionally NOT computed here. RPM requires a views
  // figure, which this function has no access to on its own. Callers that
  // have both a views number and this result should compute rpm themselves
  // (see detectTikTokAccountFromGpm for the reference calculation).
  rpm?: number | null;
  isLoggedIn: boolean;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
];

/**
 * Chromium profile subfolders that are pure cache/scratch data.
 * Skipping these reduces snapshot time from minutes to seconds and saves gigabytes of disk I/O.
 */
const SKIP_DIR_NAMES = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "GrShaderCache",
  "ShaderCache",
  "DawnCache",
  "DawnGraphiteCache",
  "Service Worker",
  "blob_storage",
  "Crashpad",
  "component_crx_cache",
  "extensions_crx_cache",
  "optimization_guide_hint_cache_store",
  "GraphiteDawnCache",
]);

let hasWarnedNonWindows = false;
function warnIfNonWindows() {
  if (!hasWarnedNonWindows && os.platform() !== "win32") {
    hasWarnedNonWindows = true;
    console.warn(
      `[TikTokExtractor] Running on platform "${os.platform()}", but GPMLogin profile ` +
      `discovery assumes Windows paths (%APPDATA%, D:\\Tiktok automation, etc). ` +
      `All profile/session lookups will report "not found" on this platform.`
    );
  }
}

/**
 * Synchronous, safe helper to completely remove a temp snapshot directory.
 */
function cleanupTempDir(tempDir: string | null) {
  if (!tempDir) return;
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (err: any) {
    console.warn(`[TikTokExtractor] Failed to clean temp dir ${tempDir}:`, err.message);
  }
}

/**
 * Locate GPMLogin's profile storage path on the local machine
 */
export function getGpmStoragePath(): string {
  warnIfNonWindows();
  const appData = process.env.APPDATA || "";
  const localAppData = process.env.LOCALAPPDATA || "";

  // 1. Dynamic check in GPMLogin setting configuration files
  const settingCandidates = [
    path.join(appData, "GPMLoginGlobal", "setting.dat"),
    path.join(appData, "GPMLoginGlobal", "gpm_setting.dat"),
    path.join(appData, "GPMLogin", "setting.dat"),
    path.join(localAppData, "GPMLoginGlobal", "setting.dat"),
  ];

  for (const sPath of settingCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ sPath)) {
      try {
        const content = fs.readFileSync(/*turbopackIgnore: true*/ sPath, "utf-8");
        const parsed = JSON.parse(content);
        const resolvedPath = parsed.local_storage_path || parsed.profile_path || parsed.storage_path;
        if (resolvedPath && fs.existsSync(/*turbopackIgnore: true*/ resolvedPath)) {
          return resolvedPath;
        }
      } catch (err) {
        // ignore parse error, continue to next
      }
    }
  }

  // 2. Common fallback directory locations across drives
  const fallbacks = [
    "D:\\Tiktok automation",
    "C:\\Tiktok automation",
    "E:\\Tiktok automation",
    path.join(appData, "GPMLoginGlobal", "Profiles"),
    path.join(localAppData, "GPMLoginGlobal", "Profiles"),
    path.join(appData, "GPMLogin", "Profiles"),
  ];

  for (const fb of fallbacks) {
    if (fs.existsSync(/*turbopackIgnore: true*/ fb)) return fb;
  }

  return path.join(appData, "GPMLoginGlobal", "Profiles");
}

/**
 * Finds the Chrome binary installed by GPMLogin or system Chrome
 */
export function getChromeExecutablePath(): string | undefined {
  warnIfNonWindows();
  const appData = process.env.APPDATA || "";
  const gpmChromePath = path.join(
    appData,
    "GPMLoginGlobal",
    "Browsers",
    "ChromiumCore_v151",
    "chrome.exe"
  );
  if (fs.existsSync(/*turbopackIgnore: true*/ gpmChromePath)) {
    return gpmChromePath;
  }

  // System Chrome locations
  const systemPaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const sp of systemPaths) {
    if (fs.existsSync(/*turbopackIgnore: true*/ sp)) return sp;
  }

  console.warn(
    "[TikTokExtractor] No GPMLogin or system Chrome executable found - " +
    "Playwright will fall back to its bundled Chromium, which may not match " +
    "the fingerprint the profile's session was created under."
  );
  return undefined;
}

/**
 * Validates GPM Profile ID to strictly prevent Path Traversal attacks (../)
 */
export function isValidGpmProfileId(profileId: string): boolean {
  return typeof profileId === "string" && /^[a-zA-Z0-9_\-\.]+$/.test(profileId) && !profileId.includes("..");
}

/**
 * Inspects the GPM profile directory on disk (History, LevelDB)
 * to find the real logged-in TikTok username.
 *
 * IMPORTANT: Never return the first /@ URL from History — that is often a
 * visited public profile, not the signed-in account.
 */
export function findTikTokHandleInProfile(profileId: string): string | null {
  try {
    if (!isValidGpmProfileId(profileId)) {
      console.warn(`[TikTokExtractor] Blocked invalid profileId with suspicious characters: "${profileId}"`);
      return null;
    }

    const storagePath = getGpmStoragePath();
    const profileDir = path.join(storagePath, profileId, "Default");
    if (!fs.existsSync(profileDir)) {
      console.warn(`[TikTokExtractor] Profile directory not found: ${profileDir}`);
      return null;
    }

    const chunks: string[] = [];

    // 1. Chrome History SQLite (binary-safe latin1 dump)
    const historyPath = path.join(profileDir, "History");
    if (fs.existsSync(historyPath)) {
      try {
        chunks.push(fs.readFileSync(historyPath).toString("latin1"));
      } catch {
        // ignore locked/binary history
      }
    }

    // 2. Local Storage LevelDB shards
    const levelDbDir = path.join(profileDir, "Local Storage", "leveldb");
    if (fs.existsSync(levelDbDir)) {
      try {
        for (const f of fs.readdirSync(levelDbDir)) {
          if (!f.endsWith(".log") && !f.endsWith(".ldb")) continue;
          try {
            chunks.push(fs.readFileSync(path.join(levelDbDir, f)).toString("latin1"));
          } catch {
            // ignore unreadable shard
          }
        }
      } catch {
        // ignore readdir error
      }
    }

    // 3. Session Storage / Preferences often contain uniqueId for the signed-in user
    for (const rel of ["Preferences", "Secure Preferences", "Network/Cookies"]) {
      const p = path.join(profileDir, rel);
      if (!fs.existsSync(p)) continue;
      try {
        const buf = fs.readFileSync(p);
        // Cap huge cookie DBs
        chunks.push(buf.toString("latin1", 0, Math.min(buf.length, 8 * 1024 * 1024)));
      } catch {
        // ignore
      }
    }

    const { handle, scores } = scoreLoggedInHandleFromArtifacts(chunks.join("\n"));
    if (handle) {
      console.log(
        `[TikTokExtractor] Resolved logged-in handle @${handle} from disk artifacts`,
        scores
      );
      return handle;
    }
  } catch (err: any) {
    console.warn(`[TikTokExtractor] Disk inspection error for ${profileId}:`, err.message);
  }

  return null;
}

/**
 * Quick check whether a GPM profile has opened or used TikTok
 * (via History or Cookies) so newly created / existing TikTok profiles are recognized.
 */
export function hasTikTokPresenceInProfile(profileId: string): boolean {
  try {
    if (!isValidGpmProfileId(profileId)) return false;
    const storagePath = getGpmStoragePath();
    const profileDir = path.join(storagePath, profileId, "Default");
    if (!fs.existsSync(profileDir)) return false;

    const cookiesPath = path.join(profileDir, "Network", "Cookies");
    if (fs.existsSync(cookiesPath)) {
      try {
        const c = fs.readFileSync(cookiesPath).toString("latin1");
        if (c.includes("tiktok.com") || c.includes("sessionid")) return true;
      } catch { }
    }

    const historyPath = path.join(profileDir, "History");
    if (fs.existsSync(historyPath)) {
      try {
        const h = fs.readFileSync(historyPath).toString("latin1");
        if (h.includes("tiktok.com")) return true;
      } catch { }
    }
  } catch { }
  return false;
}

/**
 * Checks if the GPM profile has a live TikTok sessionid cookie on disk.
 */
export function hasSessionCookieInProfile(profileId: string): boolean {
  try {
    if (!isValidGpmProfileId(profileId)) return false;
    const storagePath = getGpmStoragePath();
    const cookiesPath = path.join(storagePath, profileId, "Default", "Network", "Cookies");
    if (fs.existsSync(cookiesPath)) {
      const c = fs.readFileSync(cookiesPath).toString("latin1");
      return c.includes("sessionid");
    }
  } catch { }
  return false;
}

/**
 * Detect country for a GPM profile using the same resolution rules as the Extension:
 * 1. Checks profile name / group hints
 * 2. Checks browser preferences (intl.selected_languages)
 * 3. Checks store-country-code in cookies
 * 4. Defaults to Vietnam (never unconfirmed US)
/**
 * Detect country for a GPM profile strictly from TikTok data:
 * - Never guesses from browser language (intl.selected_languages) or profile names.
 * - Under Option A, offline profile scanning does not guess country.
 * - Live account country is populated by the Extension via TikTok Passport / store-country-code.
 */
export function detectCountryFromGpmProfile(
  profileId: string,
  profileName?: string | null,
  groupId?: string | null
): string | null {
  return null;
}

/**
 * Read raw artifact blob for a GPM profile (History + LevelDB + Preferences).
 */
function readGpmProfileArtifactBlob(profileId: string): string {
  if (!isValidGpmProfileId(profileId)) return "";
  const storagePath = getGpmStoragePath();
  const profileDir = path.join(storagePath, profileId, "Default");
  if (!fs.existsSync(/*turbopackIgnore: true*/ profileDir)) return "";

  const chunks: string[] = [];
  const historyPath = path.join(profileDir, "History");
  if (fs.existsSync(/*turbopackIgnore: true*/ historyPath)) {
    try {
      chunks.push(fs.readFileSync(/*turbopackIgnore: true*/ historyPath).toString("latin1"));
    } catch {
      /* ignore */
    }
  }

  const levelDbDir = path.join(profileDir, "Local Storage", "leveldb");
  if (fs.existsSync(/*turbopackIgnore: true*/ levelDbDir)) {
    try {
      for (const f of fs.readdirSync(/*turbopackIgnore: true*/ levelDbDir)) {
        if (!f.endsWith(".log") && !f.endsWith(".ldb")) continue;
        try {
          chunks.push(
            fs.readFileSync(/*turbopackIgnore: true*/ path.join(levelDbDir, f)).toString("latin1")
          );
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  for (const rel of ["Preferences", "Secure Preferences", "Network/Cookies"]) {
    const p = path.join(profileDir, rel);
    if (!fs.existsSync(/*turbopackIgnore: true*/ p)) continue;
    try {
      const buf = fs.readFileSync(/*turbopackIgnore: true*/ p);
      chunks.push(buf.toString("latin1", 0, Math.min(buf.length, 8 * 1024 * 1024)));
    } catch {
      /* ignore */
    }
  }

  return chunks.join("\n");
}

/**
 * Scan local GPM profile folders and return the unique profile whose
 * logged-in TikTok handle matches `username`. Returns null on 0 or 2+ hits.
 */
export function resolveGpmProfileByUsername(username: string): {
  id: string;
  name: string | null;
  matchedVia: "tiktokHandle" | "label";
} | null {
  try {
    const storagePath = getGpmStoragePath();
    if (!fs.existsSync(/*turbopackIgnore: true*/ storagePath)) return null;

    const entries = fs.readdirSync(/*turbopackIgnore: true*/ storagePath, {
      withFileTypes: true,
    });
    const profileIds = entries
      .filter(
        (e) =>
          e.isDirectory() &&
          !e.name.startsWith("_") &&
          isValidGpmProfileId(e.name) &&
          fs.existsSync(
            /*turbopackIgnore: true*/ path.join(storagePath, e.name, "Default")
          )
      )
      .map((e) => e.name);

    // 1) Prefer classic unique handle/label match
    const classic = matchUniqueGpmProfileByUsername(
      username,
      profileIds.map((id) => ({
        id,
        name: id,
        tiktokHandle: findTikTokHandleInProfile(id),
      }))
    );
    if (classic) return classic;

    // 2) Score the *reported* username inside each profile's artifacts
    const scored: Array<{ id: string; score: number }> = [];
    for (const id of profileIds) {
      const blob = readGpmProfileArtifactBlob(id);
      const score = scoreUsernameInArtifacts(blob, username);
      if (score >= 2) scored.push({ id, score });
    }

    if (scored.length === 0) return null;
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const tied = scored.filter((s) => s.score === best.score);
    if (tied.length !== 1) {
      console.warn(
        `[TikTokExtractor] Ambiguous GPM match for @${username}:`,
        tied.map((t) => t.id)
      );
      return null;
    }

    console.log(
      `[TikTokExtractor] Matched @${username} → GPM ${best.id} via disk score=${best.score}`
    );
    return { id: best.id, name: best.id, matchedVia: "tiktokHandle" };
  } catch (err: any) {
    console.warn(
      `[TikTokExtractor] resolveGpmProfileByUsername failed for @${username}:`,
      err?.message || err
    );
    return null;
  }
}

/**
 * Recursively copies a directory, safely skipping locks and caches.
 */
function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch (e: any) {
    console.warn(`[TikTokExtractor] Could not read directory ${src}, skipping:`, e.message);
    return;
  }

  for (const entry of entries) {
    const lowerName = entry.name.toLowerCase();
    if (
      entry.name === "SingletonLock" ||
      entry.name === "SingletonCookie" ||
      entry.name === "SingletonSocket" ||
      entry.name === "DevToolsActivePort" ||
      entry.name === "lockfile" ||
      entry.name === "parent.lock" ||
      lowerName === "lock" ||
      lowerName.endsWith(".lock")
    ) {
      continue;
    }
    if (entry.isDirectory() && SKIP_DIR_NAMES.has(entry.name)) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    try {
      if (entry.isDirectory()) {
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    } catch (e) {
      // ignore per-file lock copy errors
    }
  }
}

/**
 * Snapshots a GPM profile directory into a fresh temp dir.
 * Automatically cleans up if an exception occurs during copy.
 */
function snapshotProfileToTemp(profileId: string): string | null {
  if (!isValidGpmProfileId(profileId)) {
    console.warn(`[TikTokExtractor] Blocked invalid profileId in snapshot: "${profileId}"`);
    return null;
  }

  const storagePath = getGpmStoragePath();
  const sourceDir = path.join(storagePath, profileId);
  if (!fs.existsSync(sourceDir)) return null;

  let tempDir: string | null = null;
  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `gpm-snapshot-${profileId}-`));
    copyDirRecursive(sourceDir, tempDir);
    return tempDir;
  } catch (err: any) {
    console.warn(`[TikTokExtractor] Error snapshotting profile ${profileId}:`, err.message);
    cleanupTempDir(tempDir);
    return null;
  }
}

/**
 * Launches a persistent Chrome context against a SNAPSHOT COPY of the given
 * GPM profile's user-data directory. Guarantees the temp dir is cleaned up on any failure path.
 */
async function launchPersistentContextForProfile(profileId: string): Promise<{
  context: BrowserContext | undefined;
  tempProfileDir: string | null;
}> {
  const chromePath = getChromeExecutablePath();
  let tempProfileDir: string | null = null;

  try {
    tempProfileDir = snapshotProfileToTemp(profileId);
    if (!tempProfileDir) {
      console.warn(`[TikTokExtractor] No profile dir found to snapshot for ${profileId}`);
      return { context: undefined, tempProfileDir: null };
    }

    const context = await chromium.launchPersistentContext(tempProfileDir, {
      headless: true,
      executablePath: chromePath,
      args: LAUNCH_ARGS,
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
      timeout: 15000,
    });
    await context.addInitScript("globalThis.__name = globalThis.__name || ((fn, name) => fn);");
    console.log(`[TikTokExtractor] Launched persistent context from snapshot of profile ${profileId}`);
    return { context, tempProfileDir };
  } catch (persistErr: any) {
    console.warn(
      `[TikTokExtractor] Failed to launch persistent context from snapshot for ${profileId}:`,
      persistErr.message
    );
    cleanupTempDir(tempProfileDir);
    return { context: undefined, tempProfileDir: null };
  }
}

/**
 * Runs `page.evaluate(fn)` safely handling context destruction during redirects.
 */
async function safeEvaluate<T>(
  page: Page,
  fn: () => T,
  fallback: T
): Promise<T> {
  try {
    await page.evaluate("globalThis.__name = globalThis.__name || ((fn, name) => fn);").catch(() => { });
    return await page.evaluate(fn);
  } catch (err: any) {
    if (/execution context was destroyed/i.test(err?.message || "")) {
      console.warn("[TikTokExtractor] Execution context destroyed mid-evaluate (navigation) - retrying once");
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => { });
        await page.evaluate("globalThis.__name = globalThis.__name || ((fn, name) => fn);").catch(() => { });
        return await page.evaluate(fn);
      } catch (retryErr: any) {
        console.warn("[TikTokExtractor] Retry after context destruction also failed:", retryErr.message);
        return fallback;
      }
    }
    throw err;
  }
}

/**
 * Helper to safely parse JSON from a Playwright response object.
 */
async function safeJsonFromResponse(response: Response): Promise<any | null> {
  try {
    const contentType = response.headers()["content-type"] || "";
    if (contentType.includes("application/json") || response.url().includes("/api/")) {
      const text = await response.text();
      return JSON.parse(text);
    }
  } catch (e) {
    // ignore non-json or aborted payloads
  }
  return null;
}

/**
 * Helper to extract metric values from structured JSON response objects recursively.
 */
function searchJsonObjectForKeys(obj: any, keys: string[]): any | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    if (key in obj && obj[key] !== null && obj[key] !== undefined) {
      return obj[key];
    }
  }
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === "object") {
      const found = searchJsonObjectForKeys(obj[k], keys);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Scrapes public profile metrics using Response Interception for TikTok's internal JSON APIs
 * with automatic fallback to DOM analysis.
 */
export async function fetchLiveTikTokStatsWithContext(
  username: string,
  context: BrowserContext
): Promise<Omit<ExtractedTikTokData, "totalRevenue" | "totalRewardsUsd">> {
  console.log(`🚀 [TikTokExtractor] Intercepting network responses for @${username}...`);

  const page = await context.newPage();

  let interceptedFollowers: number | null = null;
  let interceptedFollowing: number | null = null;
  let interceptedLikes: number | null = null;
  let interceptedVideoCount: number | null = null;
  let interceptedNickname: string | null = null;
  let interceptedViewsSum: number = 0;
  let hasInterceptedApi = false;

  // 1. Attach Response Interceptor for user detail & item list API endpoints
  const responseHandler = async (response: Response) => {
    const url = response.url();
    try {
      if (
        url.includes("/api/user/detail/") ||
        url.includes("/node/share/user/@") ||
        url.includes("/api/creator/profile") ||
        url.includes("user/info")
      ) {
        const json = await safeJsonFromResponse(response);
        if (json) {
          const stats = json.userInfo?.stats || json.stats || json.data?.stats;
          const user = json.userInfo?.user || json.user || json.data?.user;

          if (stats) {
            hasInterceptedApi = true;
            if (typeof stats.followerCount === "number") interceptedFollowers = stats.followerCount;
            if (typeof stats.followingCount === "number") interceptedFollowing = stats.followingCount;
            if (typeof stats.heartCount === "number") interceptedLikes = stats.heartCount;
            if (typeof stats.videoCount === "number") interceptedVideoCount = stats.videoCount;
          }
          if (user) {
            if (user.nickname) interceptedNickname = user.nickname;
          }
        }
      }

      if (
        url.includes("/api/item_list/") ||
        url.includes("/api/post/item_list/") ||
        url.includes("/api/creator/item/list")
      ) {
        const json = await safeJsonFromResponse(response);
        if (json) {
          const itemList = json.itemList || json.data?.itemList || json.items || [];
          if (Array.isArray(itemList)) {
            hasInterceptedApi = true;
            let sum = 0;
            for (const item of itemList) {
              const playCount = item.stats?.playCount || item.statistics?.play_count || item.play_count || 0;
              sum += Number(playCount) || 0;
            }
            if (sum > 0) {
              interceptedViewsSum = Math.max(interceptedViewsSum, sum);
            }
          }
        }
      }
    } catch (err: any) {
      // ignore parsing error
    }
  };

  page.on("response", responseHandler);

  try {
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });

    await page.waitForTimeout(3000);

    // Scroll to trigger lazy loading if needed
    for (let i = 0; i < 4; i++) {
      await safeEvaluate(
        page,
        () => {
          window.scrollTo(0, document.body.scrollHeight);
          return true;
        },
        false
      );
      await page.waitForTimeout(800);
    }

    // 2. DOM Fallback Extraction
    const domData = await safeEvaluate<ScrapedTikTokData>(
      page,
      () => {
        const followersEl = document.querySelector('[data-e2e="followers-count"]');
        const followingEl = document.querySelector('[data-e2e="following-count"]');
        const likesEl = document.querySelector('[data-e2e="likes-count"]');
        const nicknameEl =
          document.querySelector('h1[data-e2e="user-title"]') ||
          document.querySelector('[data-e2e="user-subtitle"]');

        const videoElements = document.querySelectorAll('[data-e2e="user-post-item"]');
        let totalViewsSum = 0;
        for (let i = 0; i < videoElements.length; i++) {
          const el = videoElements[i];
          const viewEl = el.querySelector('[data-e2e="video-views"]');
          const viewText = (viewEl && viewEl.textContent) ? viewEl.textContent.trim() : "0";
          let num = 0;
          if (viewText.endsWith("M") || viewText.endsWith("m")) {
            num = parseFloat(viewText) * 1000000;
          } else if (viewText.endsWith("K") || viewText.endsWith("k")) {
            num = parseFloat(viewText) * 1000;
          } else {
            num = parseFloat(viewText.replace(/[^0-9.]/g, "")) || 0;
          }
          totalViewsSum += Math.round(num);
        }

        const parseText = (txt: string | null | undefined): number => {
          if (!txt) return 0;
          const clean = txt.trim();
          if (clean.endsWith("M") || clean.endsWith("m")) {
            return Math.round(parseFloat(clean) * 1000000);
          } else if (clean.endsWith("K") || clean.endsWith("k")) {
            return Math.round(parseFloat(clean) * 1000);
          }
          return parseInt(clean.replace(/[^0-9]/g, ""), 10) || 0;
        };

        const text = document.body ? document.body.innerText : "";

        let followers = parseText(followersEl ? followersEl.textContent : null);
        if (followers === 0) {
          const m =
            text.match(/([0-9.KMBkmb]+)\s*(?:Follower|Followers|Người theo dõi)/i) ||
            text.match(/(?:Follower|Followers|Người theo dõi)\s*([0-9.KMBkmb]+)/i);
          if (m) followers = parseText(m[1]);
        }

        let following = parseText(followingEl ? followingEl.textContent : null);
        if (following === 0) {
          const m =
            text.match(/([0-9.KMBkmb]+)\s*(?:Đã follow|Following|đang theo dõi)/i) ||
            text.match(/(?:Đã follow|Following)\s*([0-9.KMBkmb]+)/i);
          if (m) following = parseText(m[1]);
        }

        let likes = parseText(likesEl ? likesEl.textContent : null);
        if (likes === 0) {
          const m =
            text.match(/([0-9.KMBkmb]+)\s*(?:Lượt thích|Likes|Thích)/i) ||
            text.match(/(?:Lượt thích|Likes|Thích)\s*([0-9.KMBkmb]+)/i);
          if (m) likes = parseText(m[1]);
        }

        const videoLinks = Array.from(document.querySelectorAll('a[href*="/video/"]'));
        const videoCount = Math.max(videoElements.length, videoLinks.length);

        if (totalViewsSum === 0 && videoCount > 0) {
          const allVideoCards = Array.from(document.querySelectorAll('a[href*="/video/"], [data-e2e="user-post-item"]'));
          for (let i = 0; i < allVideoCards.length; i++) {
            const card = allVideoCards[i];
            const cardText = card.textContent || "";
            const vMatch = cardText.match(/([0-9.]+[KMBkmb]?)/);
            if (vMatch) {
              totalViewsSum += parseText(vMatch[1]);
            }
          }
        }

        return {
          followers,
          following,
          likes,
          nickname: nicknameEl && nicknameEl.textContent ? nicknameEl.textContent.trim() : "",
          videoCount,
          totalViews: totalViewsSum,
        };
      },
      { followers: 0, following: 0, likes: 0, nickname: "", videoCount: 0, totalViews: 0 }
    );

    const followersCount = interceptedFollowers !== null ? interceptedFollowers : domData.followers;
    const followingCount = interceptedFollowing !== null ? interceptedFollowing : domData.following;
    const totalLikes = interceptedLikes !== null ? interceptedLikes : domData.likes;
    const videoCount = interceptedVideoCount !== null ? interceptedVideoCount : domData.videoCount;
    const totalViews = interceptedViewsSum > 0 ? interceptedViewsSum : domData.totalViews;
    const nickname = interceptedNickname || domData.nickname || username;

    const isLoggedIn = followersCount > 0 || totalLikes > 0 || videoCount > 0 || hasInterceptedApi;

    console.log(`[TikTokExtractor] Stats for @${username} (intercepted=${hasInterceptedApi}):`, {
      followersCount,
      totalLikes,
      videoCount,
      totalViews,
    });

    return {
      username,
      nickname,
      followersCount,
      followingCount,
      totalLikes,
      videoCount,
      totalVideos: videoCount,
      totalViews,
      isLoggedIn,
    };
  } finally {
    page.off("response", responseHandler);
    await page.close().catch(() => { });
  }
}

/**
 * Scrapes real live metrics for a username.
 */
export async function fetchLiveTikTokStats(
  username: string,
  profileId?: string
): Promise<Omit<ExtractedTikTokData, "totalRevenue" | "totalRewardsUsd">> {
  let context: BrowserContext | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let tempProfileDir: string | null = null;

  try {
    if (profileId) {
      const launched = await launchPersistentContextForProfile(profileId);
      context = launched.context;
      tempProfileDir = launched.tempProfileDir;
    }

    if (!context) {
      const chromePath = getChromeExecutablePath();
      browser = await chromium.launch({
        headless: true,
        executablePath: chromePath,
        args: LAUNCH_ARGS,
      });
      context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1280, height: 800 },
      });
    }

    return await fetchLiveTikTokStatsWithContext(username, context);
  } catch (err: any) {
    console.warn(`[TikTokExtractor] Failed to scrape @${username}:`, err.message);
    return {
      username,
      followersCount: 0,
      followingCount: 0,
      totalLikes: 0,
      videoCount: 0,
      totalVideos: 0,
      totalViews: 0,
      isLoggedIn: false,
    };
  } finally {
    if (context) await context.close().catch(() => { });
    if (browser) await browser.close().catch(() => { });
    cleanupTempDir(tempProfileDir);
  }
}

/**
 * Builds the exact TikTok Studio Custom Date URL
 */
export function buildTikTokStudioCustomUrl(startDateStr: string = "2020-01-01", endDateStr?: string): string {
  const start = new Date(startDateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date();

  const formatUtc = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}/${m}/${day} 00:00:00`;
  };

  const payload = {
    type: "custom",
    dateRange: {
      start: start.getTime(),
      end: end.getTime(),
    },
    UTCDateRange: {
      from: formatUtc(start),
      to: formatUtc(end),
    },
  };

  return `https://www.tiktok.com/tiktokstudio?dateRange=${encodeURIComponent(JSON.stringify(payload))}`;
}

/**
 * Scrapes comprehensive metrics directly from TikTok Studio using Response Interception
 * on TikTok Studio's backend analytics and content APIs, with fallback to DOM evaluation.
 */
export async function fetchTikTokStudioFullData(
  profileId: string,
  username?: string
): Promise<Partial<ExtractedTikTokData>> {
  let context: BrowserContext | undefined;
  let tempProfileDir: string | null = null;

  try {
    const launched = await launchPersistentContextForProfile(profileId);
    context = launched.context;
    tempProfileDir = launched.tempProfileDir;

    if (!context) {
      return { isLoggedIn: false };
    }

    const page = context.pages()[0] || (await context.newPage());

    let userInfo: any = null;
    let followerCount = 0;
    let rawPostList: any[] = [];
    let interceptedRewardAnalytics: any = null;
    let interceptedAllPrograms: any = null;
    let interceptedInsightsHistory: any = null;
    let interceptedVideoCalls: any[] = [];

    // Intercept essential user, follower, insights, monetization, and video list APIs
    page.on("response", async (resp: Response) => {
      const url = resp.url();
      try {
        if (url.includes("/tiktokstudio/api/web/user") && !url.includes("aid=")) {
          const j = await safeJsonFromResponse(resp);
          if (j?.userBaseInfo?.UserProfile?.UserBase) {
            userInfo = j.userBaseInfo.UserProfile.UserBase;
          }
        }
        if (url.includes("multiGetFollowRelationCount")) {
          const j = await safeJsonFromResponse(resp);
          if (j?.FollowerCount) {
            const firstVal = Object.values(j.FollowerCount)[0];
            if (firstVal !== undefined) followerCount = parseInt(firstVal as string, 10) || 0;
          }
        }
        if (url.includes("/m10n_center/reward_analytics")) {
          const j = await safeJsonFromResponse(resp);
          const payload = j?.data || j;
          if (payload?.daily_estimated_income || payload?.seven_d_income) {
            interceptedRewardAnalytics = payload;
          }
        }
        if (url.includes("/m10n_center/all_programs")) {
          const j = await safeJsonFromResponse(resp);
          const payload = j?.data || j;
          if (payload?.active_m10n_programs) {
            interceptedAllPrograms = payload.active_m10n_programs;
          }
        }
        if (url.includes("/aweme/v2/data/insight/")) {
          const j = await safeJsonFromResponse(resp);
          if (j?.vv_history || j?.like_history) {
            interceptedInsightsHistory = j;
          }
        }
        if (url.includes("item_list") || url.includes("post_list") || url.includes("/content/manage") || url.includes("/content/list")) {
          const j = await safeJsonFromResponse(resp);
          const list = j?.itemList || j?.items || j?.item_list || j?.data?.item_list || j?.data?.itemList || [];
          if (Array.isArray(list) && list.length > 0) {
            interceptedVideoCalls.push({
              has_more: j.has_more,
              cursor: j.cursor,
              items: list,
            });
          }
        }
      } catch { }
    });

    // Step 0. Warm-up navigation for Studio SSO handshake
    await page.goto("https://www.tiktok.com/", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    }).catch(() => { });
    await page.waitForTimeout(1000);

    // Step 1: Content Page
    await page.goto("https://www.tiktok.com/tiktokstudio/content", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    }).catch(() => { });

    // Reliable Login Detection
    const isLoginPage = /login|passport/i.test(page.url()) || (await page.title().catch(() => "")).includes("Log in");
    if (isLoginPage) {
      return { isLoggedIn: false };
    }

    // Wait until creator context or userInfo arrives
    const startTime = Date.now();
    while (Date.now() - startTime < 2500) {
      const hasContext = await page.evaluate(() => {
        const el = document.getElementById("__Creator_Center_Context__");
        return !!(el && el.textContent && el.textContent.length > 50);
      }).catch(() => false);

      if (hasContext && userInfo && followerCount > 0) break;
      await page.waitForTimeout(200);
    }

    // Extract pre-rendered post_list
    const allVideosMap = new Map<string, any>();
    let initialHasMore = false;

    const scriptContent = await page.evaluate(() => {
      const el = document.getElementById("__Creator_Center_Context__");
      return el ? el.textContent : null;
    }).catch(() => null);

    if (scriptContent) {
      try {
        const s = scriptContent.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const parsed = JSON.parse(s);
        const batch = parsed.firstBatchQueryItems?.item_list || parsed.post_list;
        if (Array.isArray(batch)) {
          for (const item of batch) {
            const key = item.item_id || item.id || item.desc || Math.random().toString();
            allVideosMap.set(key, item);
          }
        }
        if (parsed.firstBatchQueryItems?.has_more !== undefined) {
          initialHasMore = !!parsed.firstBatchQueryItems.has_more;
        }
      } catch { }
    }

    for (const call of interceptedVideoCalls) {
      for (const item of call.items) {
        const key = item.item_id || item.id || item.desc || Math.random().toString();
        allVideosMap.set(key, item);
      }
    }

    // Scroll if needed
    const shouldScroll = initialHasMore || interceptedVideoCalls.some((c) => c.has_more) || allVideosMap.size === 0;
    if (shouldScroll) {
      let lastCount = allVideosMap.size;
      for (let scrollIdx = 0; scrollIdx < 5; scrollIdx++) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const scrollables = document.querySelectorAll('div[class*="content"], div[class*="table"], div[class*="scroll"], div[class*="list"]');
          scrollables.forEach((el) => { el.scrollTop = el.scrollHeight; });
        }).catch(() => { });
        await page.waitForTimeout(1200);
        for (const call of interceptedVideoCalls) {
          for (const item of call.items) {
            const key = item.item_id || item.id || item.desc || Math.random().toString();
            allVideosMap.set(key, item);
          }
        }
        if (allVideosMap.size === lastCount) break;
        lastCount = allVideosMap.size;
      }
    }

    rawPostList = Array.from(allVideosMap.values());

    const cleanNum = (v: any): number => {
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      if (!v) return 0;
      let s = String(v).trim().toLowerCase();
      let m = 1;
      if (s.endsWith("k")) m = 1e3;
      else if (s.endsWith("m")) m = 1e6;
      else if (s.endsWith("b")) m = 1e9;
      const parsed = parseFloat(s.replace(/[^0-9.]/g, ""));
      return isNaN(parsed) ? 0 : Math.round(parsed * m);
    };

    const videosList = rawPostList.map((p) => {
      const rawTime = p.post_time || p.create_time;
      const postTimestamp = rawTime ? parseInt(rawTime, 10) * 1000 : null;
      return {
        id: p.item_id || p.id || "",
        title: p.desc || p.title || "No title",
        views: cleanNum(p.play_count || p.stats?.playCount),
        likes: cleanNum(p.like_count || p.stats?.diggCount),
        comments: cleanNum(p.comment_count || p.stats?.commentCount),
        shares: cleanNum(p.share_count || p.stats?.shareCount),
        postTime: postTimestamp ? new Date(postTimestamp).toISOString() : null,
        postDate: postTimestamp ? new Date(postTimestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
        coverUrl: Array.isArray(p.cover_url) ? p.cover_url[0] : (typeof p.cover_url === "string" ? p.cover_url : (p.cover?.url_list?.[0] || p.video?.cover?.url_list?.[0] || null)),
      };
    });

    const totalViewsCombined = videosList.reduce((sum, v) => sum + v.views, 0);

    let finalHandle = userInfo?.UniqId || username || `user_${profileId.substring(0, 8)}`;

    // Step 2: Visit Analytics (/tiktokstudio/analytics) for period views & engagement
    let views7d = 0;
    let views28d = 0;
    let views60d = 0;
    let views365d = 0;
    let likes7d = 0;
    let likes28d = 0;
    let likes60d = 0;
    let likes365d = 0;
    let comments7d = 0;
    let comments28d = 0;
    let comments60d = 0;
    let comments365d = 0;
    let shares7d = 0;
    let shares28d = 0;
    let shares60d = 0;
    let shares365d = 0;
    let profileViews7d = 0;
    let profileViews28d = 0;
    let profileViews60d = 0;
    let profileViews365d = 0;

    try {
      await page.goto("https://www.tiktok.com/tiktokstudio/analytics", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      }).catch(() => { });
      await page.waitForTimeout(2000);

      const rawInsightMap = await page.evaluate(async () => {
        const out: Record<string, any> = {};
        // period + pad so trailing status:2 days don't shrink the Studio window
        const ranges = [
          { key: 7, days: 14, end_days: 1 },
          { key: 28, days: 35, end_days: 1 },
          { key: 60, days: 67, end_days: 1 },
          { key: 365, days: 372, end_days: 1 },
        ];
        for (const r of ranges) {
          try {
            const typeRequests = [
              { insigh_type: "vv_history", days: r.days, end_days: r.end_days },
              { insigh_type: "pv_history", days: r.days, end_days: r.end_days },
              { insigh_type: "like_history", days: r.days, end_days: r.end_days },
              { insigh_type: "comment_history", days: r.days, end_days: r.end_days },
              { insigh_type: "share_history", days: r.days, end_days: r.end_days },
            ];
            const tzOffset = -(new Date().getTimezoneOffset()) * 60;
            const url = "/aweme/v2/data/insight/?tz_offset=" + tzOffset + "&type_requests=" + encodeURIComponent(JSON.stringify(typeRequests));
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            out[r.key] = await res.json();
          } catch (e) {
            out[r.key] = {};
          }
        }
        return out;
      }).catch(() => ({}));

      const getVal = (d: number, metric: string) =>
        sumStudioInsightPeriod(
          ((rawInsightMap as Record<string, any>)?.[String(d)] || {})[metric],
          d
        );

      views7d = getVal(7, "vv_history");
      views28d = getVal(28, "vv_history");
      views60d = getVal(60, "vv_history");
      views365d = getVal(365, "vv_history");

      likes7d = getVal(7, "like_history");
      likes28d = getVal(28, "like_history");
      likes60d = getVal(60, "like_history");
      likes365d = getVal(365, "like_history");

      comments7d = getVal(7, "comment_history");
      comments28d = getVal(28, "comment_history");
      comments60d = getVal(60, "comment_history");
      comments365d = getVal(365, "comment_history");

      shares7d = getVal(7, "share_history");
      shares28d = getVal(28, "share_history");
      shares60d = getVal(60, "share_history");
      shares365d = getVal(365, "share_history");

      profileViews7d = getVal(7, "pv_history");
      profileViews28d = getVal(28, "pv_history");
      profileViews60d = getVal(60, "pv_history");
      profileViews365d = getVal(365, "pv_history");
    } catch (anErr: any) {
      console.warn("   [TikTokExtractor] Analytics fetch warning:", anErr.message);
    }

    const totalViews = Math.max(totalViewsCombined, views365d);

    // Step 3: Visit monetization tab
    let totalRewardsUsd: number | null = null;
    let shopRewardsUsd: number | null = null;
    let shopProgramName = "TikTok Shop for Seller";
    let activePrograms: any[] = [];
    let dailyBreakdown: any[] = [];
    let revenue7d: number | null = null;
    let revenue28d: number | null = null;
    let revenue60d: number | null = null;
    let revenue365d: number | null = null;
    let rpm: number | null = null;
    let currency = "$";
    let tiktokShopProgram: any = null;

    try {
      await page.goto("https://www.tiktok.com/tiktokstudio/monetization", {
        waitUntil: "domcontentloaded",
        timeout: 12000,
      }).catch(() => { });

      const waitStart = Date.now();
      while (Date.now() - waitStart < 2500 && !interceptedRewardAnalytics) {
        await page.waitForTimeout(200);
      }

      const parseMoney = (m: any): number => {
        if (!m) return 0;
        if (m.formatted_no_symbol) {
          const v = parseFloat(String(m.formatted_no_symbol).replace(/,/g, ""));
          if (!isNaN(v)) return v;
        }
        const units = typeof m.units === "number" ? m.units : parseInt(m.units || "0", 10) || 0;
        const nanos = typeof m.nanos === "number" ? m.nanos : parseInt(m.nanos || "0", 10) || 0;
        return units + nanos / 1e9;
      };

      if (interceptedRewardAnalytics) {
        currency = interceptedRewardAnalytics.selected_currency?.symbol || interceptedRewardAnalytics.selected_currency?.code || "$";
        revenue7d = parseMoney(interceptedRewardAnalytics.seven_d_income);
        revenue28d = parseMoney(interceptedRewardAnalytics.thirty_d_income);
        revenue60d = parseMoney(interceptedRewardAnalytics.sixty_d_income);
        totalRewardsUsd = revenue28d > 0 ? revenue28d : revenue7d;

        dailyBreakdown = (interceptedRewardAnalytics.daily_estimated_income || []).map((item: any) => ({
          date: new Date(item.time * 1000).toISOString().split("T")[0],
          revenue: parseMoney(item.money),
        }));

        const progsMap = new Map<string, any>();
        (interceptedRewardAnalytics.m10n_program_user_income || []).forEach((p: any) => {
          const name = p.m10n_program_name || "Program " + p.m10n_program;
          const p7d = parseMoney(p.seven_d_income);
          const p28d = parseMoney(p.thirty_d_income);
          const p60d = parseMoney(p.sixty_d_income);
          const isShop = p.m10n_program === 11 || /shop/i.test(name);

          const progObj = {
            name,
            programId: p.m10n_program,
            revenue7d: p7d,
            revenue30d: p28d,
            revenue60d: p60d,
          };

          if (isShop) {
            shopRewardsUsd = p28d > 0 ? p28d : p7d;
            shopProgramName = name;
            tiktokShopProgram = progObj;
          } else {
            progsMap.set(name, progObj);
          }
        });

        if (Array.isArray(interceptedAllPrograms)) {
          interceptedAllPrograms.forEach((ap: any) => {
            if (ap && ap.name && !progsMap.has(ap.name) && !/shop/i.test(ap.name)) {
              progsMap.set(ap.name, {
                name: ap.name,
                programId: ap.m10n_project,
                revenue7d: 0,
                revenue30d: 0,
                revenue60d: 0,
              });
            }
          });
        }

        activePrograms = Array.from(progsMap.values());
      }

      // Query Home tab for 365-day total revenue (insight_type: 126)
      try {
        const home365 = await page.evaluate(async () => {
          try {
            const typeReq = [{ insight_type: 126, data_date_range: 4 }];
            const url = "/tiktok/v1/analytics/insights/?type_requests=" + encodeURIComponent(JSON.stringify(typeReq)) + "&time_offset=25200&is_dark_mode=false";
            const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const j = await resp.json();
            return j.analytics_overview_rewards?.total?.amount ?? null;
          } catch {
            return null;
          }
        }).catch(() => null);

        if (typeof home365 === "number") {
          revenue365d = home365;
          if (totalRewardsUsd === null || totalRewardsUsd === 0) {
            totalRewardsUsd = revenue365d;
          }
        }
      } catch { }

      if (totalRewardsUsd && totalViews > 0) {
        rpm = Number(((totalRewardsUsd / totalViews) * 1000).toFixed(3));
      }
    } catch { }

    let totalLikes = cleanNum(userInfo?.totalLikes || 0);

    const revenueBreakdown = {
      totalRevenue: {
        revenue7d: revenue7d || 0,
        revenue30d: revenue28d || 0,
        revenue60d: revenue60d || 0,
      },
      tiktokShop: tiktokShopProgram || {
        name: shopProgramName || "TikTok Shop for Seller",
        programId: 11,
        revenue7d: 0,
        revenue30d: shopRewardsUsd || 0,
        revenue60d: 0,
      },
      activePrograms,
    };

    const dailyRevenueBreakdown = dailyBreakdown;

    const sumRevenue = {
      revenue7d: revenue7d || 0,
      revenue28d: revenue28d || 0,
      revenue60d: revenue60d || 0,
      revenue365d: revenue365d || 0,
      totalRevenue: revenue365d || totalRewardsUsd || 0,
    };

    const sumViews = {
      views7d,
      views28d,
      views60d,
      views365d,
      totalViews,
    };

    const sumLikes = {
      likes7d,
      likes28d,
      likes60d,
      likes365d,
      totalLikes,
    };

    const sumComments = {
      comments7d,
      comments28d,
      comments60d,
      comments365d,
    };

    const sumShares = {
      shares7d,
      shares28d,
      shares60d,
      shares365d,
    };

    const sumProfileViews = {
      profileViews7d,
      profileViews28d,
      profileViews60d,
      profileViews365d,
    };

    return {
      username: finalHandle,
      nickname: userInfo?.NickName || finalHandle,
      country: "US",
      currency,
      followersCount: followerCount,
      followingCount: 0,
      totalLikes,
      videoCount: videosList.length,
      totalVideos: videosList.length,
      totalViews,
      totalRevenue: totalRewardsUsd,
      totalRewardsUsd,
      rpm,
      videosList,
      topVideos: {},
      sumRevenue,
      sumViews,
      sumLikes,
      sumComments,
      sumShares,
      sumProfileViews,
      revenueBreakdown,
      dailyRevenueBreakdown,
      insightsHistory: interceptedInsightsHistory,
      isLoggedIn: true,
    };
  } catch (err: any) {
    console.warn(`[TikTokExtractor] fetchTikTokStudioFullData error for ${profileId}:`, err.message);
    return { isLoggedIn: false };
  } finally {
    if (context) await context.close().catch(() => { });
  }
}

/**
 * Scrapes Creator Rewards balance using Response Interception with DOM fallback.
 */
export async function fetchCreatorRewardsBalanceWithContext(
  context: BrowserContext
): Promise<CreatorRewardsData> {
  const page = await context.newPage();

  let interceptedTotalRewards: number | null = null;
  let interceptedShopRewards: number | null = null;
  let interceptedCurrency = "$";

  const rewardsResponseHandler = async (response: Response) => {
    const url = response.url();
    try {
      if (
        url.includes("/api/creator/monetization") ||
        url.includes("/api/creator_rewards") ||
        url.includes("/api/monetization") ||
        url.includes("/rewards/overview") ||
        url.includes("/income/overview")
      ) {
        const json = await safeJsonFromResponse(response);
        if (json) {
          console.log(`[TikTokExtractor] Intercepted Creator Rewards API (${url.substring(0, 80)})`);
          const total = searchJsonObjectForKeys(json, ["total_rewards", "total_income", "total_amount", "rewards"]);
          const shop = searchJsonObjectForKeys(json, ["tiktok_shop_rewards", "shop_rewards", "seller_income"]);
          const cur = searchJsonObjectForKeys(json, ["currency", "currency_code"]);

          if (typeof total === "number") interceptedTotalRewards = total;
          if (typeof shop === "number") interceptedShopRewards = shop;
          if (typeof cur === "string") {
            if (cur === "GBP" || cur === "£") interceptedCurrency = "£";
            else if (cur === "EUR" || cur === "€") interceptedCurrency = "€";
            else if (cur === "VND" || cur === "₫") interceptedCurrency = "₫";
          }
        }
      }
    } catch (e) {
      // ignore
    }
  };

  page.on("response", rewardsResponseHandler);

  try {
    await page.goto("https://www.tiktok.com/", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    }).catch(() => { });
    await page.waitForTimeout(1500);

    const gotoMonetizationAndCheck = async (): Promise<boolean> => {
      await page.goto("https://www.tiktok.com/tiktokstudio/monetization", {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      await page.waitForTimeout(3000);
      return safeEvaluate(page, () => /login|passport/i.test(location.href), false);
    };

    let isLoginPage = await gotoMonetizationAndCheck();

    if (isLoginPage) {
      console.warn(`[TikTokExtractor] Bounced to login page fetching rewards - retrying once after warm-up`);
      await page.waitForTimeout(2000);
      isLoginPage = await gotoMonetizationAndCheck();
    }

    if (isLoginPage) {
      console.warn(`[TikTokExtractor] Still on login page after retry - giving up`);
      return { totalRewardsUsd: null, tiktokShopRewardsUsd: null, isLoggedIn: false };
    }

    await page.waitForSelector(".absolute-value, [role='listitem']", { timeout: 10000 }).catch(() => {
      console.warn(`[TikTokExtractor] Neither .absolute-value nor [role='listitem'] appeared on monetization page`);
    });

    // DOM Fallback
    const domResult = await safeEvaluate(
      page,
      () => {
        let total: number | null = null;
        let shop: number | null = null;
        let currency = "$";

        const parseVal = (text: string | null | undefined): number | null => {
          if (!text) return null;
          const num = parseFloat(text.replace(/[^0-9.]/g, ""));
          return Number.isNaN(num) ? null : num;
        };

        const listItems = Array.from(document.querySelectorAll("[role='listitem'], [class*='reward-item'], [class*='Card']"));
        for (let i = 0; i < listItems.length; i++) {
          const item = listItems[i];
          const txt = item.textContent || "";
          const valEl = item.querySelector(".absolute-value") || item;
          const valTxt = valEl?.textContent || "";

          if (valTxt.includes("£")) currency = "£";
          else if (valTxt.includes("€")) currency = "€";
          else if (valTxt.includes("₫") || valTxt.includes("VND")) currency = "₫";

          if (/tổng|total|all rewards/i.test(txt) && total === null) {
            total = parseVal(valTxt);
          } else if (/tiktok shop/i.test(txt) && shop === null) {
            shop = parseVal(valTxt);
          }
        }

        if (total === null) {
          const els = Array.from(document.querySelectorAll(".absolute-value"));
          if (els[0]) {
            total = parseVal(els[0].textContent);
            if (els[0].textContent?.includes("£")) currency = "£";
            else if (els[0].textContent?.includes("€")) currency = "€";
            else if (els[0].textContent?.includes("₫") || els[0].textContent?.includes("VND")) currency = "₫";
          }
          if (els[1]) {
            shop = parseVal(els[1].textContent);
          }
        }

        if (total !== null && shop !== null && shop > total) {
          total = Math.max(total, shop);
        }

        return {
          totalRewardsUsd: total,
          tiktokShopRewardsUsd: shop,
          currency,
        };
      },
      {
        totalRewardsUsd: null as number | null,
        tiktokShopRewardsUsd: null as number | null,
        currency: "$",
      }
    );

    const finalTotal = interceptedTotalRewards !== null ? interceptedTotalRewards : domResult.totalRewardsUsd;
    const finalShop = interceptedShopRewards !== null ? interceptedShopRewards : domResult.tiktokShopRewardsUsd;
    const finalCurrency = interceptedCurrency !== "$" ? interceptedCurrency : domResult.currency;

    return {
      totalRewardsUsd: finalTotal,
      tiktokShopRewardsUsd: finalShop,
      currency: finalCurrency,
      isLoggedIn: true,
    };
  } finally {
    page.off("response", rewardsResponseHandler);
    await page.close().catch(() => { });
  }
}

/**
 * Scrapes Creator Rewards balance with a standalone persistent context.
 */
export async function fetchCreatorRewardsBalance(profileId: string): Promise<CreatorRewardsData> {
  let context: BrowserContext | undefined;
  let tempProfileDir: string | null = null;

  try {
    const launched = await launchPersistentContextForProfile(profileId);
    context = launched.context;
    tempProfileDir = launched.tempProfileDir;

    if (!context) {
      return { totalRewardsUsd: null, tiktokShopRewardsUsd: null, isLoggedIn: false };
    }

    return await fetchCreatorRewardsBalanceWithContext(context);
  } catch (err: any) {
    console.warn(`[TikTokExtractor] Failed to fetch Creator Rewards balance for ${profileId}:`, err.message);
    return { totalRewardsUsd: null, tiktokShopRewardsUsd: null, isLoggedIn: false };
  } finally {
    if (context) await context.close().catch(() => { });
    cleanupTempDir(tempProfileDir);
  }
}

/**
 * High-level detection function combining TikTok Studio full analytics
 * with fallback to public profile stats and Creator Rewards balance.
 */
export async function detectTikTokAccountFromGpm(
  profileId: string
): Promise<ExtractedTikTokData | null> {
  console.log(`🤖 [TikTokExtractor] Starting real detection for GPM profile: ${profileId}`);

  // 1. Detect handle from local profile storage
  const handle = findTikTokHandleInProfile(profileId);

  // 2. First Priority: Try full TikTok Studio Extraction (Response Interception + DOM)
  const studioData = await fetchTikTokStudioFullData(profileId, handle || undefined);
  if (
    studioData &&
    studioData.isLoggedIn &&
    ((studioData.totalViews || 0) > 0 || (studioData.followersCount || 0) > 0)
  ) {
    const finalHandle = studioData.username || handle || `user_${profileId.substring(0, 8)}`;
    if (handle && studioData.username && handle.toLowerCase() !== studioData.username.toLowerCase()) {
      console.warn(
        `[TikTokExtractor] Disk handle @${handle} differs from Studio logged-in @${studioData.username} — using Studio identity`
      );
    }
    return {
      username: finalHandle,
      nickname: studioData.nickname || finalHandle,
      country: studioData.country || "US",
      currency: studioData.currency || "$",
      followersCount: studioData.followersCount || 0,
      followingCount: studioData.followingCount || 0,
      totalLikes: studioData.totalLikes || 0,
      videoCount: studioData.totalVideos || studioData.videoCount || 0,
      totalVideos: studioData.totalVideos || studioData.videoCount || 0,
      totalViews: studioData.totalViews || 0,
      totalRevenue: studioData.totalRevenue || studioData.totalRewardsUsd || null,
      totalRewardsUsd: studioData.totalRewardsUsd || null,
      rpm: studioData.rpm || null,
      videosList: studioData.videosList || [],
      topVideos: studioData.topVideos || {},
      sumRevenue: studioData.sumRevenue || null,
      sumViews: studioData.sumViews || null,
      sumLikes: studioData.sumLikes || null,
      sumComments: studioData.sumComments || null,
      sumShares: studioData.sumShares || null,
      sumProfileViews: studioData.sumProfileViews || null,
      revenueBreakdown: studioData.revenueBreakdown || null,
      dailyRevenueBreakdown: studioData.dailyRevenueBreakdown || null,
      insightsHistory: studioData.insightsHistory || null,
      isLoggedIn: true,
    };
  }

  // 3. Fallback: Shared single persistent context for public profile stats + monetization
  let sharedContext: BrowserContext | undefined;
  let sharedTempDir: string | null = null;

  try {
    let targetUsername = handle;
    if (!targetUsername) {
      const gpmProfile = await gpmClient.getProfile(profileId).catch((err: any) => {
        console.warn(`[TikTokExtractor] gpmClient.getProfile failed for ${profileId}:`, err.message);
        return null;
      });
      if (gpmProfile?.name) {
        let clean = gpmProfile.name.toLowerCase().replace(/[^a-z0-9_.]/g, "_");
        if (clean.startsWith("tiktok_")) clean = clean.replace(/^tiktok_/, "");
        if (!clean.startsWith("profile_")) targetUsername = clean;
      }
    }

    if (!targetUsername) {
      console.warn(`[TikTokExtractor] Could not resolve a username for profile ${profileId} - giving up`);
      return null;
    }

    const launched = await launchPersistentContextForProfile(profileId);
    sharedContext = launched.context;
    sharedTempDir = launched.tempProfileDir;

    let stats: Omit<ExtractedTikTokData, "totalRevenue" | "totalRewardsUsd"> | null = null;
    let rewards: CreatorRewardsData | null = null;

    if (!sharedContext) {
      try {
        stats = await fetchLiveTikTokStats(targetUsername);
      } catch (err: any) {
        console.warn(`[TikTokExtractor] Anonymous public stats fetch failed for ${targetUsername}:`, err.message);
      }
    } else {
      // Prefer session-bound identity over any disk History guess before scraping public stats
      try {
        const idPage = await sharedContext.newPage();
        await idPage.goto("https://www.tiktok.com/passport/web/account/info/?app_id=1233", {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        }).catch(() => { });
        const sessionUser = await idPage.evaluate(() => {
          try {
            const text = document.body?.innerText || "";
            const parsed = JSON.parse(text);
            return parsed?.data?.username || parsed?.data?.screen_name || null;
          } catch {
            return null;
          }
        }).catch(() => null);
        await idPage.close().catch(() => { });
        if (sessionUser && typeof sessionUser === "string") {
          if (targetUsername && targetUsername.toLowerCase() !== sessionUser.toLowerCase()) {
            console.warn(
              `[TikTokExtractor] Overriding disk handle @${targetUsername} with session @${sessionUser}`
            );
          }
          targetUsername = sessionUser;
        }
      } catch (err: any) {
        console.warn(`[TikTokExtractor] Session identity probe failed:`, err.message);
      }

      try {
        stats = await fetchLiveTikTokStatsWithContext(targetUsername, sharedContext);
      } catch (err: any) {
        console.warn(`[TikTokExtractor] Public stats fetch failed for ${targetUsername} on profile ${profileId}:`, err.message);
      }

      try {
        rewards = await fetchCreatorRewardsBalanceWithContext(sharedContext);
      } catch (err: any) {
        console.warn(`[TikTokExtractor] Creator rewards fetch failed for profile ${profileId}:`, err.message);
      }
    }

    if (!stats && !rewards) {
      return null;
    }

    const safeStats = stats || {
      username: targetUsername,
      followersCount: 0,
      followingCount: 0,
      totalLikes: 0,
      videoCount: 0,
      totalVideos: 0,
      totalViews: 0,
      isLoggedIn: false,
    };
    const safeRewards: CreatorRewardsData = rewards || {
      totalRewardsUsd: null,
      tiktokShopRewardsUsd: null,
      isLoggedIn: false,
    };

    const rpm =
      safeStats.totalViews > 0 && (safeRewards.totalRewardsUsd || 0) > 0
        ? Math.round((((safeRewards.totalRewardsUsd as number) * 1000) / safeStats.totalViews) * 100) / 100
        : null;

    return {
      ...safeStats,
      country: "US",
      currency: safeRewards.currency || "$",
      totalRevenue: safeRewards.totalRewardsUsd,
      totalRewardsUsd: safeRewards.totalRewardsUsd,
      rpm,
      isLoggedIn: safeStats.isLoggedIn || safeRewards.isLoggedIn,
    };
  } catch (err: any) {
    console.warn(`[TikTokExtractor] Fallback extraction error for ${profileId}:`, err.message);
    return null;
  } finally {
    if (sharedContext) await sharedContext.close().catch(() => { });
    cleanupTempDir(sharedTempDir);
  }
}

/**
 * Lightweight Tier-2 Public Profile Extractor
 * Fetches public metrics (followers, likes, videos) in ~200-500ms via pure HTTP without opening a browser.
 */
export async function fetchTikTokPublicProfileHttp(username: string): Promise<{
  followersCount: number;
  followingCount: number;
  totalLikes: number;
  videoCount: number;
  nickname?: string;
  avatar?: string;
} | null> {
  const cleanUsername = username.replace(/^@/, "").trim();
  if (!cleanUsername) return null;
  const url = `https://www.tiktok.com/@${cleanUsername}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();

    // Strategy 1: __UNIVERSAL_DATA_FOR_REHYDRATION__
    const rehydrationMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (rehydrationMatch && rehydrationMatch[1]) {
      try {
        const json = JSON.parse(rehydrationMatch[1]);
        const userInfo = json?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;
        if (userInfo) {
          const stats = userInfo.stats || {};
          return {
            followersCount: Number(stats.followerCount || 0),
            followingCount: Number(stats.followingCount || 0),
            totalLikes: Number(stats.heartCount || 0),
            videoCount: Number(stats.videoCount || 0),
            nickname: userInfo.user?.nickname,
            avatar: userInfo.user?.avatarLarger || userInfo.user?.avatarThumb,
          };
        }
      } catch (e) {
        // Fall through to strategy 2
      }
    }

    // Strategy 2: __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch && nextDataMatch[1]) {
      try {
        const json = JSON.parse(nextDataMatch[1]);
        const userProps = json?.props?.pageProps?.userInfo;
        if (userProps) {
          const stats = userProps.stats || {};
          return {
            followersCount: Number(stats.followerCount || 0),
            followingCount: Number(stats.followingCount || 0),
            totalLikes: Number(stats.heartCount || 0),
            videoCount: Number(stats.videoCount || 0),
            nickname: userProps.user?.nickname,
          };
        }
      } catch (e) {
        // Fall through to strategy 3
      }
    }

    // Strategy 3: OpenGraph meta tag fallback
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
    if (ogDescMatch && ogDescMatch[1]) {
      const desc = ogDescMatch[1];
      const followersMatch = desc.match(/([\d.,]+[KkMm]?)\s+Followers/i);
      const likesMatch = desc.match(/([\d.,]+[KkMm]?)\s+Likes/i);

      const parseSuffix = (str: string) => {
        const clean = str.trim();
        if (/m$/i.test(clean)) return Math.round(parseFloat(clean) * 1000000);
        if (/k$/i.test(clean)) return Math.round(parseFloat(clean) * 1000);
        return parseInt(clean.replace(/[^0-9]/g, ""), 10) || 0;
      };

      if (followersMatch) {
        return {
          followersCount: parseSuffix(followersMatch[1]),
          followingCount: 0,
          totalLikes: likesMatch ? parseSuffix(likesMatch[1]) : 0,
          videoCount: 0,
        };
      }
    }

    return null;
  } catch (err: any) {
    return null;
  }
}
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
  // Views breakdown
  viewsToday?: number;
  views7d?: number;
  views14d?: number;
  views30d?: number;
  // Videos breakdown
  videosToday?: number;
  videos7d?: number;
  videos14d?: number;
  videos30d?: number;
  // Key metrics
  profileViews?: number;
  commentsCount?: number;
  sharesCount?: number;
  // Monetization & RPM Breakdown
  totalRewardsUsd: number | null;
  liveRewardsUsd?: number | null;
  tiktokShopRewardsUsd: number | null;
  creatorRewardsUsd?: number | null;
  rpm?: number | null;
  isLoggedIn: boolean;
  // Per-Video and Top Videos
  videosList?: any[];
  topVideos?: any;
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
      } catch {}
    }

    const historyPath = path.join(profileDir, "History");
    if (fs.existsSync(historyPath)) {
      try {
        const h = fs.readFileSync(historyPath).toString("latin1");
        if (h.includes("tiktok.com")) return true;
      } catch {}
    }
  } catch {}
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
  } catch {}
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
    if (
      entry.name === "SingletonLock" ||
      entry.name === "SingletonCookie" ||
      entry.name === "SingletonSocket"
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
): Promise<Omit<ExtractedTikTokData, "totalRewardsUsd" | "tiktokShopRewardsUsd">> {
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
): Promise<Omit<ExtractedTikTokData, "totalRewardsUsd" | "tiktokShopRewardsUsd">> {
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

    // Abort heavy media, image, font, and stylesheet assets to speed up page load by ~80%
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        return route.abort();
      }
      return route.continue();
    });

    // Intercepted Studio API Data Accumulators
    let studioTotalViews: number | null = null;
    let studioViewsToday: number | null = null;
    let studioViews7d: number | null = null;
    let studioViews14d: number | null = null;
    let studioViews30d: number | null = null;
    let studioFollowers: number | null = null;
    let studioLikes: number | null = null;
    let studioRewards: number | null = null;
    let studioCurrency = "$";
    let studioCountry = "US";
    let studioVideos: any[] = [];
    let studioUsername: string | null = null;
    let studioNickname: string | null = null;

    // Attach Response Interceptor for all Studio API calls
    const studioResponseHandler = async (response: Response) => {
      const url = response.url();
      try {
        // Logged-in creator identity (never confuse with a visited public profile)
        if (
          url.includes("/tiktokstudio/api/web/user") ||
          url.includes("/api/creator/user") ||
          (url.includes("/passport/web/account/info") && !url.includes("aid="))
        ) {
          const json = await safeJsonFromResponse(response);
          if (json) {
            const uniq =
              json.userBaseInfo?.UserProfile?.UserBase?.UniqId ||
              json.data?.username ||
              json.data?.screen_name ||
              json.user?.uniqueId ||
              json.uniqueId;
            const nick =
              json.userBaseInfo?.UserProfile?.UserBase?.NickName ||
              json.data?.nickname ||
              json.user?.nickname;
            if (typeof uniq === "string" && uniq.length >= 2) {
              studioUsername = uniq;
              console.log(`[TikTokExtractor] Intercepted Studio logged-in handle @${uniq}`);
            }
            if (typeof nick === "string" && nick.length > 0) {
              studioNickname = nick;
            }
          }
        }

        if (
          url.includes("/api/creator/overview") ||
          url.includes("/api/studio/overview") ||
          url.includes("/api/insights") ||
          url.includes("/overview/data") ||
          url.includes("/analytics/overview")
        ) {
          const json = await safeJsonFromResponse(response);
          if (json) {
            console.log(`[TikTokExtractor] Intercepted Studio Overview API (${url.substring(0, 80)})`);

            const views = searchJsonObjectForKeys(json, ["video_views", "views", "play_count", "total_views"]);
            if (typeof views === "number") {
              if (url.includes("pastDay%22%3A1") || url.includes("pastDay\":1")) studioViewsToday = views;
              else if (url.includes("pastDay%22%3A7") || url.includes("pastDay\":7")) studioViews7d = views;
              else if (url.includes("pastDay%22%3A14") || url.includes("pastDay\":14")) studioViews14d = views;
              else if (url.includes("pastDay%22%3A28") || url.includes("pastDay\":28")) studioViews30d = views;
              else if (url.includes("custom") || url.includes("2020")) studioTotalViews = views;
            }

            const followers = searchJsonObjectForKeys(json, ["followers", "follower_count", "net_followers"]);
            if (typeof followers === "number" && studioFollowers === null) studioFollowers = followers;

            const likes = searchJsonObjectForKeys(json, ["likes", "heart_count", "total_likes"]);
            if (typeof likes === "number" && studioLikes === null) studioLikes = likes;

            const rewards = searchJsonObjectForKeys(json, ["estimated_rewards", "total_rewards", "rewards", "income"]);
            if (typeof rewards === "number" && studioRewards === null) studioRewards = rewards;

            const cur = searchJsonObjectForKeys(json, ["currency", "currency_code"]);
            if (typeof cur === "string") {
              if (cur === "GBP" || cur === "£") { studioCurrency = "£"; studioCountry = "UK"; }
              else if (cur === "EUR" || cur === "€") { studioCurrency = "€"; studioCountry = "DE"; }
              else if (cur === "VND" || cur === "₫") { studioCurrency = "₫"; studioCountry = "VN"; }
            }
          }
        }

        if (
          url.includes("/api/creator/item/list") ||
          url.includes("/api/item/list") ||
          url.includes("/content/list") ||
          url.includes("/api/studio/content")
        ) {
          const json = await safeJsonFromResponse(response);
          if (json) {
            const list = json.itemList || json.items || json.data?.itemList || json.data?.items;
            if (Array.isArray(list)) {
              console.log(`[TikTokExtractor] Intercepted Studio Content API (${list.length} videos)`);
              studioVideos = list;
            }
          }
        }
      } catch (e) {
        // ignore per-response parse failure
      }
    };

    page.on("response", studioResponseHandler);

    // 0. Warm-up navigation for Studio SSO handshake
    await page.goto("https://www.tiktok.com/", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    }).catch(() => { });
    await page.waitForTimeout(1500);

    // 1. Visit Custom Date Range (Lifetime from 2020-01-01 to Today)
    const customUrl = buildTikTokStudioCustomUrl("2020-01-01");
    console.log(`[TikTokExtractor] Scraping Studio Dashboard for ${profileId}...`);
    await page.goto(customUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(3500);

    const isLogin = await safeEvaluate(page, () => /login|passport/i.test(location.href), false);
    if (isLogin) {
      console.warn(`[TikTokExtractor] TikTok Studio bounced to login for profile ${profileId}`);
      page.off("response", studioResponseHandler);
      return { isLoggedIn: false };
    }

    // Resolve logged-in handle from page context if API intercept missed it
    if (!studioUsername) {
      const pageIdentity = await safeEvaluate(
        page,
        () => {
          try {
            const creatorEl = document.getElementById("__Creator_Center_Context__");
            if (creatorEl?.textContent) {
              const raw = creatorEl.textContent
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, "&");
              const parsed = JSON.parse(raw);
              const uniq =
                parsed?.user?.uniqueId ||
                parsed?.userInfo?.user?.uniqueId ||
                parsed?.userBaseInfo?.UserProfile?.UserBase?.UniqId;
              if (uniq) return { username: String(uniq), nickname: null as string | null };
            }
          } catch { /* ignore */ }

          try {
            const scriptTag = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
            if (scriptTag?.textContent) {
              const json = JSON.parse(scriptTag.textContent);
              const appUser = json?.["__DEFAULT_SCOPE__"]?.["webapp.app-context"]?.user;
              if (appUser?.uniqueId) {
                return {
                  username: String(appUser.uniqueId),
                  nickname: appUser.nickname ? String(appUser.nickname) : null,
                };
              }
            }
          } catch { /* ignore */ }

          return null;
        },
        null as { username: string; nickname: string | null } | null
      );
      if (pageIdentity?.username) {
        studioUsername = pageIdentity.username;
        if (pageIdentity.nickname) studioNickname = pageIdentity.nickname;
      }
    }

    // 2. DOM Evaluation fallback for Lifetime Dashboard (10-Country Multi-Language Support)
    const lifetimeDom = await safeEvaluate(
      page,
      () => {
        let totalViews = 0;
        let totalRewards = 0;
        let likes = 0;
        let followers = 0;
        let following = 0;
        let profileViews = 0;
        let comments = 0;
        let shares = 0;
        let liveRewards = 0;
        let tiktokShopRewards = 0;
        let creatorRewards = 0;
        let currency = "$";
        let country = "US";

        function parseUniversalNum(str: any): number {
          if (!str) return 0;
          let s = String(str).trim();

          // Digits mapping across all 57 language scripts
          const scriptDigits = [
            ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"], // Arabic
            ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"], // Urdu/Persian
            ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"], // Bengali
            ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"], // Devanagari (Hindi)
            ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"], // Thai
            ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"], // Myanmar
            ["០", "១", "២", "៣", "៤", "៥", "៦", "៧", "៨", "៩"], // Khmer
          ];

          for (const digitSet of scriptDigits) {
            for (let i = 0; i < 10; i++) {
              s = s.split(digitSet[i]).join(String(i));
            }
          }

          s = s.replace(/\u066B/g, ".").replace(/\u066C/g, ",");
          s = s.toLowerCase();

          let multiplier = 1;
          if (/(?:^|[\s\d.,])(t|trillion|b|billion|млрд|tỷ|ty|مليار|কোটি|করোড়|করোড়|crore|หมื่นล้าน|亿|億|억)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 1000000000;
          } else if (/(?:^|[\s\d.,])(m|million|млн|jt|tr|مليون|মি|মিলিয়ন|নিঝুত|ล้าน|သန်း|លាន|millon|milhões)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 1000000;
          } else if (/(?:^|[\s\d.,])(lakh|লাখ|लाख|แสน|သိန်း|សែន)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 100000;
          } else if (/(?:^|[\s\d.,])(万|萬|만|หมื่น|သောင်း|ម៉ឺន)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 10000;
          } else if (/(?:^|[\s\d.,])(k|thousand|тыс|тыс\.|тис|тис\.|rb|mil|ألف|হাজার|हज़ार|พัน|ထောင်|ពាន់|хил|kilo|tūkst|tūst|tsd|tsd\.|bin)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 1000;
          }

          if (multiplier > 1) {
            const match = s.match(/([0-9]+(?:[.,][0-9]+)?)/);
            if (match) {
              const val = parseFloat(match[1].replace(",", "."));
              return Math.round(val * multiplier);
            }
          }
          const clean = s.replace(/[^0-9]/g, "");
          return parseInt(clean, 10) || 0;
        }

        function parseMoneyVal(str: any): number {
          if (!str) return 0;
          let s = String(str).trim();
          const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
          const urduDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
          const bengaliDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
          for (let i = 0; i < 10; i++) {
            s = s.split(arabicDigits[i]).join(String(i))
              .split(urduDigits[i]).join(String(i))
              .split(bengaliDigits[i]).join(String(i));
          }
          s = s.replace(/\u066B/g, ".");
          const clean = s.replace(/[^0-9.,]/g, "").replace(",", ".");
          return parseFloat(clean) || 0;
        }

        const viewsVariants = [
          "video views", "views", "video view", "lượt xem video", "lượt xem", "tayangan video", "penayangan video",
          "visualizações de vídeo", "visualizações", "visualizaciones de videos", "reproducciones de video",
          "просмотры видео", "просмотры", "مشاهدات الفيديو", "مشاهدات", "ویڈیو ملاحظات", "ভিডিও ভিউ", "mga panonood ng video", "vues de vidéos", "videoaufrufe", "视频播放量"
        ];

        const rewardsVariants = [
          "est. rewards", "estimated rewards", "rewards", "total rewards", "ước tính phần thưởng", "phần thưởng ước tính",
          "estimasi hadiah", "hadiah", "recompensas estimadas", "recompensas", "расчетное вознаграждение", "расчётное вознаграждение",
          "вознаграждения", "المكافآت التقديرية", "المكافآت", "تخمینہ شدہ انعامات", "আনুমানিক পুরস্কার", "tinatayang mga gantimpala",
          "récompenses estimées", "geschätzte belohnungen", "预计收益", "预计奖励"
        ];

        const profileViewsVariants = [
          "profile views", "lượt xem hồ sơ", "tayangan profil", "visualizações do perfil", "visualizaciones del perfil",
          "просмотры профиля", "مشاهدات الملف الشخصي", "پروفائل ملاحظات", "প্রোফাইল ভিউ", "mga panonood ng profile"
        ];

        const likesVariants = [
          "likes", "like", "lượt thích", "thích", "suka", "curtidas", "me gusta", "лайки", "تسجيلات الإعجاب", "پسندیدگیاں", "পছন্দ", "mga like"
        ];

        const commentsVariants = [
          "comments", "comment", "bình luận", "komentar", "comentários", "comentarios", "комментарии", "التعليقات", "تبصرے", "মন্তব্য", "mga komento"
        ];

        const sharesVariants = [
          "shares", "share", "lượt chia sẻ", "chia sẻ", "dibagikan", "bagikan", "compartilhamentos", "compartidos", "репосты", "مشاركات", "شیئرز", "শেয়ার", "mga share"
        ];

        const all = Array.from(document.querySelectorAll("*"));
        for (let i = 0; i < all.length; i++) {
          const el = all[i];
          const text = (el.textContent || "").trim().toLowerCase();
          if (el.children.length === 0) {
            const parent = el.parentElement;
            if (parent) {
              const rawText = parent.innerText || parent.textContent || "";
              const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
              const findNear = (variants: string[]) => {
                const idx = lines.findIndex((l) => variants.includes(l.toLowerCase()));
                if (idx !== -1) {
                  if (lines[idx + 1]) return lines[idx + 1];
                  if (lines[idx - 1]) return lines[idx - 1];
                }
                return "";
              };

              if (viewsVariants.includes(text) && totalViews === 0) {
                const val = findNear(viewsVariants);
                if (val) totalViews = parseUniversalNum(val);
              } else if (rewardsVariants.includes(text) && totalRewards === 0) {
                const val = findNear(rewardsVariants);
                if (val) {
                  if (val.includes("£")) { currency = "£"; country = "UK"; }
                  else if (val.includes("€")) { currency = "€"; country = "DE"; }
                  else if (val.includes("₫") || val.toLowerCase().includes("vnd")) { currency = "₫"; country = "VN"; }
                  totalRewards = parseMoneyVal(val);
                }
              } else if (profileViewsVariants.includes(text) && profileViews === 0) {
                const val = findNear(profileViewsVariants);
                if (val) profileViews = parseUniversalNum(val);
              } else if (likesVariants.includes(text) && likes === 0) {
                const val = findNear(likesVariants);
                if (val) likes = parseUniversalNum(val);
              } else if (commentsVariants.includes(text) && comments === 0) {
                const val = findNear(commentsVariants);
                if (val) comments = parseUniversalNum(val);
              } else if (sharesVariants.includes(text) && shares === 0) {
                const val = findNear(sharesVariants);
                if (val) shares = parseUniversalNum(val);
              }
            }
          }
        }

        // Context-Aware Card Scan for Revenue Breakdown
        try {
          const rewardContainers = Array.from(document.querySelectorAll("[class*='reward'], [class*='monetiz'], [class*='tab-item'], [class*='card']"));
          for (const card of rewardContainers) {
            const text = (card as HTMLElement).innerText || "";
            const moneyMatch = text.match(/([$£€₫¥]|USD|EUR|GBP|VND)?\s*([0-9]+(?:[.,][0-9]{2})?)\s*([$£€₫¥]|USD|EUR|GBP|VND)?/);
            if (moneyMatch && moneyMatch[2]) {
              const amount = parseFloat(moneyMatch[2].replace(",", "."));
              const lower = text.toLowerCase();
              if (/\blive\b|phần thưởng live|hadiah live|recompensas live|награды за live|مكافآت live|لائیو|লাইভ/iu.test(lower) && liveRewards === 0) {
                liveRewards = amount;
              } else if (/shop|seller|vendeur|tienda|boutique|cửa hàng|متجر|магазин/iu.test(lower) && tiktokShopRewards === 0) {
                tiktokShopRewards = amount;
              } else if (/creator|crp|programme|chương trình|creador|criador|kreator|программа вознаграждений|مكافآت المبدعين/iu.test(lower) && creatorRewards === 0) {
                creatorRewards = amount;
              } else if (/\btotal\b|tổng|gesamt|tous|всего|итого|إجمالي|کل|মোট/iu.test(lower) && totalRewards === 0) {
                totalRewards = amount;
              }
            }
          }
        } catch (e) { }

        const bodyText = document.body ? document.body.innerText : "";
        const likesMatch = bodyText.match(/(?:Likes|Lượt thích|Suka|Curtidas|Me gusta|Лайки|الإعجابات)\s*([0-9.,KMBkmbмлнтысrbjttr]+)/iu);
        const followersMatch = bodyText.match(/(?:Followers|Người theo dõi|Pengikut|Seguidores|Подписчики|المتابعون)\s*([0-9.,KMBkmbмлнтысrbjttr]+)/iu);
        const followingMatch = bodyText.match(/(?:Following|Đang theo dõi|Mengikuti|Seguindo|Siguiendo|Подписки|أتابعه)\s*([0-9.,KMBkmbмлнтысrbjttr]+)/iu);

        if (likesMatch && likes === 0) likes = parseUniversalNum(likesMatch[1]);
        if (followersMatch && followers === 0) followers = parseUniversalNum(followersMatch[1]);
        if (followingMatch && following === 0) following = parseUniversalNum(followingMatch[1]);

        return {
          likes,
          followers,
          following,
          totalViews,
          totalRewards,
          profileViews,
          comments,
          shares,
          liveRewards,
          tiktokShopRewards,
          // Heuristic: unlabeled total → attribute to Creator Rewards when no stream
          // cards matched. May mis-label Shop-only / LIVE-only UIs; prefer explicit cards.
          creatorRewards: creatorRewards || totalRewards,
          currency,
          country,
        };
      },
      { likes: 0, followers: 0, following: 0, totalViews: 0, totalRewards: 0, profileViews: 0, comments: 0, shares: 0, liveRewards: 0, tiktokShopRewards: 0, creatorRewards: 0, currency: "$", country: "US" }
    );

    // 3. Query PastDay Windows (triggers response interception + multi-language DOM extraction)
    const fetchWindowViews = async (pastDay: number) => {
      const url = `https://www.tiktok.com/tiktokstudio?dateRange=%7B%22type%22%3A%22fixed%22%2C%22pastDay%22%3A${pastDay}%7D`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => { });
      await page.waitForTimeout(2000);

      return await safeEvaluate(page, () => {
        const viewsVariants = [
          "video views", "views", "video view", "lượt xem video", "lượt xem", "tayangan video", "penayangan video",
          "visualizações de vídeo", "visualizações", "visualizaciones de videos", "reproducciones de video",
          "просмотры видео", "просмотры", "مشاهدات الفيديو", "مشاهدات", "ویڈیو ملاحظات", "ভিডিও ভیو", "mga panonood ng video", "vues de vidéos", "videoaufrufe", "视频播放量"
        ];

        function parseUniversalNum(str: any): number {
          if (!str) return 0;
          let s = String(str).trim();

          // Digits mapping across all 57 language scripts
          const scriptDigits = [
            ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"], // Arabic
            ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"], // Urdu/Persian
            ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"], // Bengali
            ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"], // Devanagari (Hindi)
            ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"], // Thai
            ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"], // Myanmar
            ["០", "១", "២", "៣", "۴", "۵", "۶", "۷", "۸", "۹"], // Khmer
          ];

          for (const digitSet of scriptDigits) {
            for (let i = 0; i < 10; i++) {
              s = s.split(digitSet[i]).join(String(i));
            }
          }

          s = s.replace(/\u066B/g, ".").replace(/\u066C/g, ",");
          s = s.toLowerCase();

          let multiplier = 1;
          if (/(?:^|[\s\d.,])(t|trillion|b|billion|млрд|tỷ|ty|مليار|কোটি|করোড়|করোড়|crore|หมื่นล้าน|亿|億|억)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 1000000000;
          } else if (/(?:^|[\s\d.,])(m|million|млн|jt|tr|مليون|মি|মিলিয়ন|নিঝুত|ล้าน|သန်း|លាន|millon|milhões)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 1000000;
          } else if (/(?:^|[\s\d.,])(lakh|লাখ|लाख|แสน|သိန်း|សែន)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 100000;
          } else if (/(?:^|[\s\d.,])(万|萬|만|หมื่น|သောင်း|ម៉ឺន)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 10000;
          } else if (/(?:^|[\s\d.,])(k|thousand|тыс|тыс\.|тис|тис\.|rb|mil|ألف|হাজার|हज़ार|พัน|ထောင်|ពាន់|хил|kilo|tūkst|tūst|tsd|tsd\.|bin)(?:[\s.,]|$)/iu.test(s)) {
            multiplier = 1000;
          }

          if (multiplier > 1) {
            const match = s.match(/([0-9]+(?:[.,][0-9]+)?)/);
            if (match) {
              const val = parseFloat(match[1].replace(",", "."));
              return Math.round(val * multiplier);
            }
          }
          const clean = s.replace(/[^0-9]/g, "");
          return parseInt(clean, 10) || 0;
        }

        const all = Array.from(document.querySelectorAll("*"));
        for (let i = 0; i < all.length; i++) {
          const el = all[i];
          const text = (el.textContent || "").trim().toLowerCase();
          if (el.children.length === 0 && viewsVariants.includes(text)) {
            const parent = el.parentElement;
            if (parent) {
              const rawText = parent.innerText || parent.textContent || "";
              const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
              const idx = lines.findIndex((l) => viewsVariants.includes(l.toLowerCase()));
              if (idx !== -1 && lines[idx + 1]) {
                return parseUniversalNum(lines[idx + 1]);
              }
            }
          }
        }
        return 0;
      }, 0);
    };

    const domViewsToday = await fetchWindowViews(1);
    const domViews7d = await fetchWindowViews(7);
    const domViews14d = await fetchWindowViews(14);
    const domViews30d = await fetchWindowViews(28);

    // 4. Visit Content Page (/tiktokstudio/content) to capture video rows & JSON API
    await page.goto("https://www.tiktok.com/tiktokstudio/content", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    }).catch(() => { });
    await page.waitForTimeout(2500);

    let totalVideos = 0;
    let videosToday = 0;
    let videos7d = 0;
    let videos14d = 0;
    let videos30d = 0;

    if (studioVideos.length > 0) {
      totalVideos = studioVideos.length;
      const nowMs = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      for (let i = 0; i < studioVideos.length; i++) {
        const item = studioVideos[i];
        const createTimeSec = item.create_time || item.createTime || item.createtime || 0;
        const createTimeMs = createTimeSec * 1000;
        const diffMs = nowMs - createTimeMs;

        if (diffMs <= oneDayMs) videosToday++;
        if (diffMs <= 7 * oneDayMs) videos7d++;
        if (diffMs <= 14 * oneDayMs) videos14d++;
        if (diffMs <= 30 * oneDayMs) videos30d++;
      }
    } else {
      const domVideoStats = await safeEvaluate(
        page,
        () => {
          const rows = Array.from(document.querySelectorAll("tbody tr, [data-e2e='content-table-row'], [class*='TableRow']"));
          let countToday = 0;
          let count7d = 0;
          let count14d = 0;
          let count30d = 0;

          for (let i = 0; i < rows.length; i++) {
            const text = rows[i].textContent || "";
            if (/today|hôm nay|hours ago|giờ trước|mins ago|phút trước/i.test(text)) {
              countToday++;
              count7d++;
              count14d++;
              count30d++;
            } else if (/yesterday|hôm qua|[1-6] days ago|[1-6] ngày trước/i.test(text)) {
              count7d++;
              count14d++;
              count30d++;
            } else if (/([7-9]|1[0-3]) days ago|([7-9]|1[0-3]) ngày trước/i.test(text)) {
              count14d++;
              count30d++;
            } else if (/(1[4-9]|2[0-9]|30) days ago/i.test(text)) {
              count30d++;
            }
          }

          return {
            totalVideos: rows.length,
            videosToday: countToday,
            videos7d: count7d,
            videos14d: count14d,
            videos30d: count30d,
          };
        },
        { totalVideos: 0, videosToday: 0, videos7d: 0, videos14d: 0, videos30d: 0 }
      );

      totalVideos = domVideoStats.totalVideos;
      videosToday = domVideoStats.videosToday;
      videos7d = domVideoStats.videos7d;
      videos14d = domVideoStats.videos14d;
      videos30d = domVideoStats.videos30d;
    }

    // Merge Intercepted vs DOM
    const finalTotalViews = studioTotalViews !== null ? studioTotalViews : lifetimeDom.totalViews;
    const finalViewsToday = studioViewsToday !== null ? studioViewsToday : domViewsToday;
    const finalViews7d = studioViews7d !== null ? studioViews7d : domViews7d;
    const finalViews14d = studioViews14d !== null ? studioViews14d : domViews14d;
    const finalViews30d = studioViews30d !== null ? studioViews30d : domViews30d;
    const finalFollowers = studioFollowers !== null ? studioFollowers : lifetimeDom.followers;
    const finalLikes = studioLikes !== null ? studioLikes : lifetimeDom.likes;
    const finalRewards = studioRewards !== null ? studioRewards : lifetimeDom.totalRewards;
    const finalCurrency = studioCurrency !== "$" ? studioCurrency : lifetimeDom.currency;
    const finalCountry = studioCountry !== "US" ? studioCountry : lifetimeDom.country;

    const rpm =
      finalTotalViews > 0 && finalRewards > 0
        ? Math.round(((finalRewards * 1000) / finalTotalViews) * 100) / 100
        : null;

    console.log(`[TikTokExtractor] TikTok Studio full data extracted successfully for ${profileId}`);

    return {
      // Prefer live Studio identity over disk History guess
      username: studioUsername || username || undefined,
      nickname: studioNickname || undefined,
      followersCount: finalFollowers,
      followingCount: lifetimeDom.following,
      totalLikes: finalLikes,
      totalViews: finalTotalViews,
      viewsToday: finalViewsToday,
      views7d: finalViews7d,
      views14d: finalViews14d,
      views30d: finalViews30d,
      totalVideos,
      videoCount: totalVideos,
      videosToday,
      videos7d,
      videos14d,
      videos30d,
      profileViews: (lifetimeDom as any).profileViews || 0,
      commentsCount: (lifetimeDom as any).comments || 0,
      sharesCount: (lifetimeDom as any).shares || 0,
      totalRewardsUsd: finalRewards,
      liveRewardsUsd: (lifetimeDom as any).liveRewards || null,
      // Same unlabeled-total heuristic as extension content.js (may be Shop/LIVE-only)
      creatorRewardsUsd: (lifetimeDom as any).creatorRewards || finalRewards,
      tiktokShopRewardsUsd: (lifetimeDom as any).tiktokShopRewards || null,
      videosList: studioVideos.map((item) => ({
        id: item.id || item.item_id || "",
        title: item.desc || item.title || "",
        views: item.stats?.playCount || item.statistics?.play_count || 0,
        likes: item.stats?.diggCount || item.statistics?.digg_count || 0,
        comments: item.stats?.commentCount || item.statistics?.comment_count || 0,
        shares: item.stats?.shareCount || item.statistics?.share_count || 0,
        postDate: item.createTime || item.create_time ? new Date((item.createTime || item.create_time) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
        privacy: item.isPublic !== false ? "Everyone" : "Private",
      })),
      rpm,
      currency: finalCurrency,
      country: finalCountry,
      isLoggedIn: true,
    };
  } catch (err: any) {
    console.warn(`[TikTokExtractor] fetchTikTokStudioFullData error for ${profileId}:`, err.message);
    return { isLoggedIn: false };
  } finally {
    if (context) await context.close().catch(() => { });
    cleanupTempDir(tempProfileDir);
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
      viewsToday: studioData.viewsToday || 0,
      views7d: studioData.views7d || 0,
      views14d: studioData.views14d || 0,
      views30d: studioData.views30d || 0,
      videosToday: studioData.videosToday || 0,
      videos7d: studioData.videos7d || 0,
      videos14d: studioData.videos14d || 0,
      videos30d: studioData.videos30d || 0,
      profileViews: studioData.profileViews || 0,
      commentsCount: studioData.commentsCount || 0,
      sharesCount: studioData.sharesCount || 0,
      totalRewardsUsd: studioData.totalRewardsUsd || null,
      liveRewardsUsd: studioData.liveRewardsUsd || null,
      creatorRewardsUsd: studioData.creatorRewardsUsd || studioData.totalRewardsUsd || null,
      tiktokShopRewardsUsd: studioData.tiktokShopRewardsUsd || null,
      rpm: studioData.rpm || null,
      videosList: studioData.videosList || [],
      topVideos: studioData.topVideos || {},
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

    let stats: Omit<ExtractedTikTokData, "totalRewardsUsd" | "tiktokShopRewardsUsd"> | null = null;
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
      totalRewardsUsd: safeRewards.totalRewardsUsd,
      tiktokShopRewardsUsd: safeRewards.tiktokShopRewardsUsd,
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
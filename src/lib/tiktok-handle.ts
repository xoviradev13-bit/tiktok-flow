/** Shared TikTok @handle sanity checks (agent disk scrape + GPM sync). */

const NON_USER_PATH_SEGMENTS = new Set([
  "foryou",
  "following",
  "friends",
  "live",
  "explore",
  "search",
  "messages",
  "inbox",
  "upload",
  "setting",
  "settings",
  "privacy",
  "embed",
  "music",
  "tag",
  "place",
  "effect",
  "coin",
  "balance",
  "wallet",
  "login",
  "signup",
  "about",
  "creators",
  "business",
  "developers",
  "legal",
  "feedback",
  "discover",
  "channel",
  "shop",
  "tiktokstudio",
  "creator-center",
]);

/**
 * True for a plausible TikTok username. Rejects base64-ish / binary false positives
 * that slip out of Chromium History/LevelDB scrapes (e.g. c2ODQ2NTkxMjExMjA).
 */
export function isPlausibleTikTokHandle(raw: unknown): boolean {
  if (!raw) return false;
  const h = String(raw).replace(/^@/, "").trim();
  if (h.length < 2 || h.length > 24) return false;
  if (!/^[a-zA-Z0-9._]+$/.test(h)) return false;
  if (/https?$/i.test(h)) return false;
  if (NON_USER_PATH_SEGMENTS.has(h.toLowerCase())) return false;
  const upper = (h.match(/[A-Z]/g) || []).length;
  const lower = (h.match(/[a-z]/g) || []).length;
  const digit = (h.match(/[0-9]/g) || []).length;
  if (upper >= 3 && lower >= 1 && digit >= 1 && upper / h.length >= 0.25) return false;
  if (upper >= 5 && !h.includes(".") && !h.includes("_")) return false;
  if (lower + upper === 0) return false;
  return true;
}

/** Normalize to lowercase handle or null if implausible. */
export function normalizeTikTokHandle(raw: unknown): string | null {
  if (!isPlausibleTikTokHandle(raw)) return null;
  return String(raw).replace(/^@/, "").trim().toLowerCase();
}

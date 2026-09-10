/**
 * Shared helpers to resolve the *logged-in* TikTok handle from browser artifacts.
 * Never treat an arbitrary visited /@profile URL as ground truth.
 */

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

export function normalizeTikTokHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const h = String(raw).replace(/^@/, "").trim();
  if (!h) return null;
  return h;
}

export function isPlausibleTikTokHandle(raw: string | null | undefined): boolean {
  const h = normalizeTikTokHandle(raw);
  if (!h) return false;
  // TikTok uniqueId max length is 24
  if (h.length < 2 || h.length > 24) return false;
  if (!/^[a-zA-Z0-9._]+$/.test(h)) return false;
  // Binary History dumps often glue the next URL: @userhttps://...
  if (/https?$/i.test(h)) return false;
  if (NON_USER_PATH_SEGMENTS.has(h.toLowerCase())) return false;
  return true;
}

export function handlesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeTikTokHandle(a)?.toLowerCase();
  const nb = normalizeTikTokHandle(b)?.toLowerCase();
  return !!na && !!nb && na === nb;
}

/** Extract @handle from a TikTok profile pathname like /@user/video/123 */
export function extractProfileHandleFromPath(pathnameOrUrl: string): string | null {
  try {
    const path = pathnameOrUrl.includes("://")
      ? new URL(pathnameOrUrl).pathname
      : pathnameOrUrl;
    const m = path.match(/^\/@([a-zA-Z0-9._]+)/);
    return isPlausibleTikTokHandle(m?.[1] || null) ? (m as RegExpMatchArray)[1] : null;
  } catch {
    return null;
  }
}

/**
 * Score candidate handles from History / LevelDB blobs.
 * High-confidence identity keys (uniqueId / UniqId) beat raw /@history visits.
 */
export function scoreLoggedInHandleFromArtifacts(blob: string): {
  handle: string | null;
  scores: Record<string, number>;
} {
  const scores = new Map<string, { score: number; casing: string }>();

  const bump = (raw: string | undefined, weight: number) => {
    if (!isPlausibleTikTokHandle(raw)) return;
    const casing = normalizeTikTokHandle(raw)!;
    const key = casing.toLowerCase();
    const prev = scores.get(key);
    if (prev) {
      prev.score += weight;
    } else {
      scores.set(key, { score: weight, casing });
    }
  };

  // Highest confidence: Studio / passport identity fields
  for (const m of blob.matchAll(/"UniqId"\s*:\s*"([a-zA-Z0-9._]{2,24})"/g)) {
    bump(m[1], 100);
  }
  for (const m of blob.matchAll(/"uniqueId"\s*:\s*"([a-zA-Z0-9._]{2,24})"/g)) {
    bump(m[1], 60);
  }
  for (const m of blob.matchAll(/"unique_id"\s*:\s*"([a-zA-Z0-9._]{2,24})"/g)) {
    bump(m[1], 60);
  }
  for (const m of blob.matchAll(/"screen_name"\s*:\s*"([a-zA-Z0-9._]{2,24})"/g)) {
    bump(m[1], 40);
  }

  // Medium: creator / studio context near a handle
  for (const m of blob.matchAll(
    /(?:tiktokstudio|creator-center|Creator_Center)[\s\S]{0,160}?@([a-zA-Z0-9._]{2,24})(?![a-zA-Z0-9._])/gi
  )) {
    bump(m[1], 25);
  }

  // Weak: refer_title / page title "(@handle)"
  for (const m of blob.matchAll(/refer_title":"\/@([a-zA-Z0-9._]{2,24})"/g)) {
    bump(m[1], 1);
  }
  for (const m of blob.matchAll(/\(@([a-zA-Z0-9._]{2,24})\)/g)) {
    bump(m[1], 3);
  }

  // History /@ visits — stop at any non-handle char (SQLite uses binary separators)
  for (const m of blob.matchAll(
    /https:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._]{2,24})(?![a-zA-Z0-9._])/g
  )) {
    bump(m[1], 1);
  }

  let best: { score: number; casing: string } | null = null;
  let second = 0;
  const outScores: Record<string, number> = {};
  for (const [key, val] of scores) {
    outScores[key] = val.score;
    if (!best || val.score > best.score) {
      if (best) second = Math.max(second, best.score);
      best = val;
    } else if (val.score > second) {
      second = val.score;
    }
  }

  // Require a minimum score so a single random history visit never wins alone
  if (!best || best.score < 2) {
    return { handle: null, scores: outScores };
  }

  // UniqId / uniqueId level — always trust
  if (best.score >= 60) {
    return { handle: best.casing, scores: outScores };
  }

  // History-only: require a clear margin (visited public profiles often cluster)
  if (best.score - second >= 3 && best.score >= 5) {
    return { handle: best.casing, scores: outScores };
  }

  return { handle: null, scores: outScores };
}

/**
 * Confidence that `username` is the logged-in identity in this artifact blob.
 */
export function scoreUsernameInArtifacts(
  blob: string,
  username: string
): number {
  const target = normalizeTikTokHandle(username)?.toLowerCase();
  if (!target || !blob) return 0;

  const { scores } = scoreLoggedInHandleFromArtifacts(blob);
  let score = scores[target] || 0;

  // Extra exact identity hits (case-insensitive) for resolve-by-username
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idRes = [
    new RegExp(`"UniqId"\\s*:\\s*"${escaped}"`, "gi"),
    new RegExp(`"uniqueId"\\s*:\\s*"${escaped}"`, "gi"),
    new RegExp(`"unique_id"\\s*:\\s*"${escaped}"`, "gi"),
  ];
  for (const re of idRes) {
    const n = blob.match(re)?.length || 0;
    score += n * 50;
  }

  // Clean profile URL occurrences (binary History separators allowed)
  const urlRe = new RegExp(
    `https://(?:www\\.)?tiktok\\.com/@${escaped}(?![a-zA-Z0-9._])`,
    "gi"
  );
  score += blob.match(urlRe)?.length || 0;

  const titleRe = new RegExp(`\\(@${escaped}\\)`, "gi");
  score += (blob.match(titleRe)?.length || 0) * 3;

  return score;
}

/**
 * Pull a TikTok @handle from GPM profile name / note / raw_name labels.
 * Only returns when an explicit @handle (or bare plausible handle token) is present.
 */
export function extractHandleFromGpmProfileLabel(
  ...parts: Array<string | null | undefined>
): string | null {
  const combined = parts.filter(Boolean).join(" ");
  if (!combined.trim()) return null;

  const atMatch = combined.match(/@([a-zA-Z0-9._]{2,30})/);
  if (atMatch && isPlausibleTikTokHandle(atMatch[1])) {
    return normalizeTikTokHandle(atMatch[1]);
  }

  // Bare token only when the whole label is essentially the handle
  const bare = combined.trim().replace(/^@/, "");
  if (isPlausibleTikTokHandle(bare) && !/\s/.test(bare)) {
    return normalizeTikTokHandle(bare);
  }

  return null;
}

export type GpmProfileMatchCandidate = {
  id: string;
  name?: string | null;
  raw_name?: string | null;
  note?: string | null;
  /** Disk / studio resolved handle (preferred when present) */
  tiktokHandle?: string | null;
};

/**
 * Match GPM profiles to a TikTok username.
 * Prefers explicit tiktokHandle; falls back to @handle inside name/note.
 * Returns only when exactly one profile matches (avoids wrong assignment).
 */
export function matchUniqueGpmProfileByUsername(
  username: string,
  profiles: GpmProfileMatchCandidate[]
): { id: string; name: string | null; matchedVia: "tiktokHandle" | "label" } | null {
  const target = normalizeTikTokHandle(username)?.toLowerCase();
  if (!target || !Array.isArray(profiles) || profiles.length === 0) return null;

  const hits: Array<{ id: string; name: string | null; matchedVia: "tiktokHandle" | "label" }> =
    [];

  for (const p of profiles) {
    if (!p?.id) continue;
    const fromHandle = normalizeTikTokHandle(p.tiktokHandle)?.toLowerCase();
    if (fromHandle && fromHandle === target) {
      hits.push({
        id: String(p.id),
        name: p.name ? String(p.name) : null,
        matchedVia: "tiktokHandle",
      });
      continue;
    }

    const fromLabel = extractHandleFromGpmProfileLabel(p.name, p.raw_name, p.note)?.toLowerCase();
    if (fromLabel && fromLabel === target) {
      hits.push({
        id: String(p.id),
        name: p.name ? String(p.name) : null,
        matchedVia: "label",
      });
    }
  }

  // Deduplicate by id (disk handle + label both matching same profile)
  const unique = new Map<string, (typeof hits)[0]>();
  for (const hit of hits) {
    const prev = unique.get(hit.id);
    if (!prev || (prev.matchedVia === "label" && hit.matchedVia === "tiktokHandle")) {
      unique.set(hit.id, hit);
    }
  }

  if (unique.size !== 1) return null;
  return [...unique.values()][0];
}

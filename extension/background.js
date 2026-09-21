// TikTokFlow Companion - Background Service Worker
// Coordinates TikTok login verification, GPM fleet sync, alarms, and badge indicators

const DEFAULT_SERVER_URL = "http://localhost:3000";
const GPM_PORT_CANDIDATES = [9495, 9496, 19995, 19996, 19994, 8848];
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown between fleet syncs
/** Same port as Client Agent singleton lock in agent.js */
const AGENT_LOCK_PORT = 39741;
/** Dedupe concurrent identity reports for the same @handle in one profile. */
const _identityReportInFlight = new Map();
/** Persist throttle across MV3 SW recycles via chrome.storage.session. */
const IDENTITY_TTL_CHANGED_MS = 25_000;
const IDENTITY_TTL_UNCHANGED_MS = 4 * 60_000;
let _reportBackoffUntil = 0;
const _staggered = new Set();
const IDENTITY_KEEPALIVE_ALARM = "tiktokflow_identity_keepalive";
const GPM_LINK_ALARM = "tiktokflow_gpm_link";
const IDENTITY_RETRY_ALARM = "tiktokflow_identity_retry";
const EXT_SWEEP_ALARM = "tiktokflow_ext_sweep";
const TIKTOK_TAB_URLS = ["https://www.tiktok.com/*", "https://*.tiktok.com/*"];

function hashDelayMs(s, max = 10_000) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % max;
}

function parseRetryAfterMs(resp) {
  const v = Number(resp.headers.get("retry-after"));
  return (Number.isFinite(v) && v > 0 ? Math.min(v, 300) : 30) * 1000;
}

async function readIdentityThrottle(u) {
  try {
    return (await chrome.storage.session.get("ttf_idt"))?.ttf_idt?.[u] || null;
  } catch {
    return null;
  }
}

async function writeIdentityThrottle(u, loggedIn) {
  try {
    const m = (await chrome.storage.session.get("ttf_idt"))?.ttf_idt || {};
    m[u] = { at: Date.now(), li: loggedIn };
    const keys = Object.keys(m);
    if (keys.length > 200) {
      keys
        .sort((a, b) => m[a].at - m[b].at)
        .slice(0, keys.length - 200)
        .forEach((k) => delete m[k]);
    }
    await chrome.storage.session.set({ ttf_idt: m });
  } catch {
    /* ignore */
  }
}

/** Centralized network and IPC timeouts for fleet tuning */
const TIMEOUTS = {
  AGENT_PROBE_MS: 1200,
  GPM_PROBE_MS: 1500,
  AGENT_ATTEST_MS: 5000,
  AGENT_RESOLVE_MS: 120_000,
  GPM_FETCH_PROFILES_MS: 4000,
  GPM_FETCH_GROUPS_MS: 3000,
  SERVER_SCHEDULE_MS: 4000,
};

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DIGITS_RE = /^\d+$/;

const LANG_ONLY_CODES = new Set([
  "vi", "en", "th", "id", "ms", "ja", "ko", "zh", "fr", "de", "es", "pt", "ru", "ar",
  "hi", "tr", "it", "pl", "nl", "sv", "ro", "uk", "cs", "hu", "el", "he", "bn", "fil",
]);

const CODE_TO_COUNTRY_NAME = {
  us: "United States",
  gb: "United Kingdom",
  uk: "United Kingdom",
  vn: "Vietnam",
  de: "Germany",
  fr: "France",
  be: "Belgium",
  nl: "Netherlands",
  id: "Indonesia",
  th: "Thailand",
  my: "Malaysia",
  ph: "Philippines",
  sg: "Singapore",
  jp: "Japan",
  kr: "South Korea",
  br: "Brazil",
  mx: "Mexico",
  ca: "Canada",
  au: "Australia",
  in: "India",
  pk: "Pakistan",
  bd: "Bangladesh",
  eg: "Egypt",
  tr: "Turkey",
  ru: "Russia",
  es: "Spain",
  it: "Italy",
  pt: "Portugal",
  pl: "Poland",
  se: "Sweden",
  ch: "Switzerland",
  at: "Austria",
  ie: "Ireland",
  tw: "Taiwan",
  hk: "Hong Kong",
  kh: "Cambodia",
  mm: "Myanmar",
  la: "Laos",
};

function extractCountryCode(raw, fromStore) {
  const s = String(raw || "").trim().toLowerCase().replace(/_/g, "-");
  if (!s) return null;
  if (/^[a-z]{2}$/.test(s)) {
    if (!fromStore && LANG_ONLY_CODES.has(s) && s !== "uk") return null;
    return s === "uk" ? "gb" : s;
  }
  if (/^[a-z]{2}-[a-z]{2}$/.test(s)) {
    const [a, b] = s.split("-");
    if (LANG_ONLY_CODES.has(a) && !LANG_ONLY_CODES.has(b)) return b;
    if (!LANG_ONLY_CODES.has(a) || fromStore) return a === "uk" ? "gb" : a;
    if (!LANG_ONLY_CODES.has(b)) return b;
  }
  return null;
}

function codeOrNameToCountryName(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const lower = trimmed.toLowerCase();
  const aliases = {
    vietnam: "Vietnam",
    "viet nam": "Vietnam",
    germany: "Germany",
    german: "Germany",
    belgium: "Belgium",
    france: "France",
    usa: "United States",
    "united states": "United States",
    us: "United States",
    uk: "United Kingdom",
    "united kingdom": "United Kingdom",
  };
  if (aliases[lower]) return aliases[lower];
  const code = extractCountryCode(trimmed, true);
  if (code && CODE_TO_COUNTRY_NAME[code]) return CODE_TO_COUNTRY_NAME[code];
  if (/^[A-Za-z][A-Za-z .'-]{2,}$/.test(trimmed) && !/^[a-z]{2}(-[a-z]{2})?$/i.test(trimmed)) {
    return trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

/** Prefer TikTok store-country-code → English country name (no language). */
async function resolveCountryFromTikTokCookies() {
  try {
    const storeCookie = await chrome.cookies.get({
      url: "https://www.tiktok.com",
      name: "store-country-code",
    });
    const store = String(storeCookie?.value || "").trim();
    const code = extractCountryCode(store, true);
    if (!code) return null;
    return CODE_TO_COUNTRY_NAME[code] || null;
  } catch {
    return null;
  }
}

async function resolveReportCountry(raw) {
  const fromCookies = await resolveCountryFromTikTokCookies();
  const fromPayload = codeOrNameToCountryName(raw);
  const isWeak = (v) =>
    !v ||
    v === "United States" ||
    v === "US" ||
    LANG_ONLY_CODES.has(String(v).toLowerCase());

  let chosen = null;
  if (fromCookies && !isWeak(fromCookies)) chosen = fromCookies;
  else if (fromPayload && !isWeak(fromPayload)) chosen = fromPayload;
  else chosen = fromCookies || fromPayload || null;

  return chosen || undefined;
}

/** ISO codes used by agent/DB (UK, VN, …) — not English names. */
const CODE_TO_COUNTRY_ISO = {
  us: "US", gb: "UK", uk: "UK", vn: "VN", de: "DE", fr: "FR", be: "BE", nl: "NL",
  id: "ID", th: "TH", my: "MY", ph: "PH", sg: "SG", jp: "JP", kr: "KR", br: "BR",
  mx: "MX", ca: "CA", au: "AU", in: "IN", pk: "PK", bd: "BD", eg: "EG", tr: "TR",
  ru: "RU", es: "ES", it: "IT", pt: "PT", pl: "PL", se: "SE", ch: "CH", at: "AT",
  ie: "IE", tw: "TW", hk: "HK", kh: "KH", mm: "MM", la: "LA",
};

function detectCountryIsoFromCurrency(cur) {
  if (!cur) return null;
  const c = String(cur).trim().toUpperCase();
  switch (c) {
    case "£": case "GBP": return "UK";
    case "₫": case "VND": return "VN";
    case "R$": case "BRL": return "BR";
    case "RP": case "IDR": return "ID";
    case "₱": case "PHP": return "PH";
    case "RS": case "PKR": return "PK";
    case "₽": case "RUB": return "RU";
    case "৳": case "BDT": return "BD";
    case "EGP": return "EG";
    case "¥": case "JPY": return "JP";
    case "₩": case "KRW": return "KR";
    case "฿": case "THB": return "TH";
    case "RM": case "MYR": return "MY";
    case "€": case "EUR": return null; // ambiguous
    case "$": case "USD": return null; // ambiguous
    default: return null;
  }
}

function resolveCountryIsoFromRaw(raw, fromStore = false) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return null;
  const named = codeOrNameToCountryName(trimmed);
  if (named === "United Kingdom") return "UK";
  if (named === "United States") return "US";
  if (named === "Vietnam") return "VN";
  if (named === "Germany") return "DE";
  if (named === "France") return "FR";
  if (named === "Belgium") return "BE";
  const code = extractCountryCode(trimmed, fromStore);
  if (code && CODE_TO_COUNTRY_ISO[code]) return CODE_TO_COUNTRY_ISO[code];
  return null;
}

/** Country for Tier-0 sweep payloads — matches agent detectAccountCountry ISO style. */
async function resolveSweepCountryIso(currency, userRes) {
  try {
    const storeCookie = await chrome.cookies.get({
      url: "https://www.tiktok.com",
      name: "store-country-code",
    });
    const fromCookie = resolveCountryIsoFromRaw(storeCookie?.value, true);
    if (fromCookie) return fromCookie;
  } catch { /* ignore */ }

  const userBase = userRes?.userBaseInfo?.UserProfile?.UserBase ?? {};
  const fromUser =
    resolveCountryIsoFromRaw(userBase?.StoreCountry || userBase?.store_country, true) ||
    resolveCountryIsoFromRaw(userBase?.CountryCode || userBase?.country_code, true) ||
    resolveCountryIsoFromRaw(userBase?.Region || userBase?.region, true);
  if (fromUser) return fromUser;

  return detectCountryIsoFromCurrency(currency);
}

/** Short-lived access JWT prefers session storage (cleared when browser closes). */
async function setAccessSession(accessToken, accessExpiresAt) {
  const payload = {
    accessToken: accessToken || "",
    accessExpiresAt: accessExpiresAt || 0,
  };
  if (chrome.storage.session) {
    await chrome.storage.session.set(payload);
    await chrome.storage.local.remove(["accessToken", "accessExpiresAt"]);
  } else {
    await chrome.storage.local.set(payload);
  }
}

async function getAccessSession() {
  if (chrome.storage.session) {
    const session = await chrome.storage.session.get(["accessToken", "accessExpiresAt"]);
    if (session.accessToken) return session;
  }
  return chrome.storage.local.get(["accessToken", "accessExpiresAt"]);
}

/** Probe Client Agent singleton status HTTP on localhost:39741 */
async function probeClientAgent() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.AGENT_PROBE_MS);
  try {
    const resp = await fetch(`http://127.0.0.1:${AGENT_LOCK_PORT}/`, {
      signal: controller.signal,
    });
    if (!resp.ok) {
      await chrome.storage.local.set({
        agentOnline: false,
        agentProbedAt: Date.now(),
      });
      return { online: false, port: AGENT_LOCK_PORT };
    }
    const data = await resp.json().catch(() => ({}));
    const online = data?.ok === true && data?.role === "tiktokflow-agent";
    await chrome.storage.local.set({
      agentOnline: online,
      agentPid: data?.pid || null,
      agentHostname: data?.hostname || null,
      agentProbedAt: Date.now(),
    });
    return {
      online,
      port: AGENT_LOCK_PORT,
      pid: data?.pid || null,
      hostname: data?.hostname || null,
    };
  } catch {
    await chrome.storage.local.set({
      agentOnline: false,
      agentProbedAt: Date.now(),
    });
    return { online: false, port: AGENT_LOCK_PORT };
  } finally {
    clearTimeout(timeoutId);
  }
}

// FIX: keyed by serverUrl so a config migration doesn't return a stale
// timestamp from the old server for up to 45 seconds.
let _challengeCache = { ts: 0, at: 0, serverUrl: "" };
/** Shared challenge clock — avoid hammering /api/extension/challenge (server ±120s window). */
async function fetchChallengeTs(serverUrl) {
  const now = Date.now();
  if (
    _challengeCache.ts &&
    _challengeCache.serverUrl === serverUrl &&
    now - _challengeCache.at < 45_000
  ) {
    return _challengeCache.ts;
  }
  const resp = await fetch(`${serverUrl}/api/extension/challenge`);
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !Number.isFinite(Number(json.challengeTs))) {
    throw new Error("challenge_unavailable");
  }
  _challengeCache = { ts: Number(json.challengeTs), at: Date.now(), serverUrl };
  return _challengeCache.ts;
}

function randomNonceHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Request signed machine attest from Client Agent (Extension never knows the secret). */
async function requestAgentAttest(serverUrl) {
  const challengeTs = await fetchChallengeTs(serverUrl);
  const nonce = randomNonceHex();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.AGENT_ATTEST_MS);
  try {
    const resp = await fetch(`http://127.0.0.1:${AGENT_LOCK_PORT}/attest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce, challengeTs }),
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.sig || data.nonce !== nonce || Number(data.ts) !== challengeTs) {
      throw new Error(data?.error || "attest_failed");
    }
    return {
      machineId: data.machineId,
      machineName: data.machineName || "",
      osUsername: data.osUsername || "",
      nonce: data.nonce,
      ts: data.ts,
      sig: data.sig,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function pollAgentAttest(serverUrl, maxMs = 60_000) {
  const started = Date.now();
  let lastErr = null;
  while (Date.now() - started < maxMs) {
    try {
      const probe = await probeClientAgent();
      if (probe.online) {
        return await requestAgentAttest(serverUrl);
      }
      lastErr = new Error("agent_offline");
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 3500));
  }
  throw lastErr || new Error("agent_timeout");
}

async function getTikTokSessionHash() {
  const names = ["sessionid", "sessionid_ss", "sid_tt"];
  for (const name of names) {
    const cookie = await chrome.cookies.get({
      url: "https://www.tiktok.com",
      name,
    });
    if (cookie?.value) return sha256Hex(cookie.value);
  }
  return null;
}

async function resolveBrowserViaAgent(username) {
  const sessionHash = await getTikTokSessionHash();
  if (!sessionHash) {
    return { ok: false, reason: "no_session" };
  }

  // Local clock is enough for resolveAttest (±120s). Do NOT call /challenge here —
  // GPM queue + keepalive was flooding the server with hundreds of challenge GETs.
  const challengeTs = Date.now();
  const nonce = randomNonceHex();

  // Export live TikTok cookies to bridge session for cookie-bridge Tier-2.
  // Use url= (not domain= only) so host-only cookies like store-country-code are included —
  // missing that cookie made closed-browser runs report country:null.
  let liveCookies = [];
  try {
    const byName = new Map();
    for (const query of [
      { domain: ".tiktok.com" },
      { url: "https://www.tiktok.com" },
      { url: "https://tiktok.com" },
    ]) {
      const batch = await chrome.cookies.getAll(query).catch(() => []);
      for (const c of batch || []) {
        if (!c?.name || typeof c.value !== "string") continue;
        byName.set(`${c.name}|${c.domain || ""}|${c.path || "/"}`, c);
      }
    }
    liveCookies = [...byName.values()].map((c) => {
      const payload = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite:
          c.sameSite === "no_restriction"
            ? "None"
            : c.sameSite === "lax"
              ? "Lax"
              : c.sameSite === "strict"
                ? "Strict"
                : "None",
      };
      if (c.expirationDate) {
        payload.expires = Math.round(c.expirationDate);
      }
      return payload;
    });
  } catch {
    /* non-blocking */
  }

  // Beacon written into this profile's chrome.storage → Local Extension Settings on disk.
  // Agent matches open GPM folders by finding this token (no CDP / remote-debug needed).
  const storageBeacon = `ttf_b_${randomNonceHex()}`;
  try {
    await chrome.storage.local.set({
      resolveStorageBeacon: storageBeacon,
      resolveStorageBeaconAt: Date.now(),
    });
  } catch {
    /* continue without beacon */
  }

  const controller = new AbortController();
  // When GPM Login app is closed, process detect may be empty and beacon can queue;
  // keep waiting long enough for ranked lock-based disk scan to finish.
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.AGENT_RESOLVE_MS);
  try {
    // Pause so chrome.storage flushes to Local Extension Settings before Agent reads disk.
    // 200ms was often too short on new profiles → beacon miss → no_match.
    await new Promise((r) => setTimeout(r, 800));
    const resp = await fetch(`http://127.0.0.1:${AGENT_LOCK_PORT}/resolve-browser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionHash,
        username,
        nonce,
        challengeTs,
        storageBeacon,
        cookies: liveCookies,
      }),
      signal: controller.signal,
    });
    console.log(
      `[TikTokFlow][LINK] resolve-browser HTTP ${resp.status} @${username || "?"} beacon=${storageBeacon.slice(0, 12)}…`
    );
    if (resp.status === 404) {
      return { ok: false, reason: "agent_unsupported" };
    }
    const data = await resp.json().catch(() => ({}));
    if (!data || typeof data.ok !== "boolean" || !data.sig) {
      return { ok: false, reason: "agent_unsupported" };
    }
    if (!data.ok) {
      return { ok: false, reason: data.reason || "no_match" };
    }
    return {
      ok: true,
      id: data.gpmProfileId,
      name: data.gpmProfileName || null,
      groupName: data.gpmGroupName || null,
      groupId: data.gpmGroupId || null,
      matchedVia: "session",
      resolveAttest: {
        machineId: data.machineId,
        sessionHash,
        gpmProfileId: data.gpmProfileId || "",
        reason: "",
        nonce: data.nonce,
        ts: data.ts,
        sig: data.sig,
      },
    };
  } catch (err) {
    const reason =
      err?.name === "AbortError" ? "timeout" : "gpm_offline";
    console.warn(`[TikTokFlow] Agent /resolve-browser failed: ${err?.message || err} (reason=${reason})`);
    return { ok: false, reason };
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// TIER 0: Extension-assisted sweep
// =============================================================================

const STUDIO_REWARD_URL = "https://www.tiktok.com/tiktokstudio/monetization";
const STUDIO_CONTENT_URL = "https://www.tiktok.com/tiktokstudio/content";
/** Revenue is daily/lagged; a longer TTL lets passive capture avoid opening Studio at all. */
const API_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STUDIO_LOAD_TIMEOUT_MS = 20_000;
const STUDIO_CACHE_WAIT_MS = 8_000;

/** Only one sweep at a time per profile (alarm can re-deliver the same request). */
let _sweepInFlight = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resolve true when the tab finishes loading, false on timeout/error. */
function waitForTabComplete(tabId, timeoutMs = STUDIO_LOAD_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(ok);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish(true);
    };
    timer = setTimeout(() => finish(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs
      .get(tabId)
      .then((t) => {
        if (t?.status === "complete" && /tiktok\.com/i.test(t.url || "")) finish(true);
      })
      .catch(() => finish(false));
  });
}

/** Wait until the MAIN-world interceptor has stored a fresh entry for `key`. */
async function waitForSessionCache(key, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await chrome.storage.session.get("tiktokflow_api_cache").catch(() => ({}));
    const e = r?.tiktokflow_api_cache?.[key];
    if (e?.ts && Date.now() - e.ts < API_CACHE_TTL_MS) return true;
    await sleep(500);
  }
  return false;
}

async function snapshotTikTokCookies() {
  try {
    const all = await chrome.cookies.getAll({ domain: "tiktok.com" });
    return new Map(all.map((c) => [`${c.name}|${c.domain}|${c.path}`, c]));
  } catch {
    return new Map();
  }
}

/** Safe cookie presence probe for Tier-0 root-cause logs (never logs cookie values). */
async function probeSessionCookiesForDiag() {
  const names = ["sessionid", "sessionid_ss", "sid_tt", "uid_tt", "uid_tt_ss", "sid_guard"];
  const out = {};
  for (const name of names) {
    try {
      const c = await chrome.cookies.get({ url: "https://www.tiktok.com", name });
      out[name] = c?.value
        ? {
            present: true,
            httpOnly: !!c.httpOnly,
            secure: !!c.secure,
            sameSite: c.sameSite || null,
            domain: c.domain || null,
            valueLen: String(c.value).length,
          }
        : { present: false };
    } catch (e) {
      out[name] = { present: false, error: String(e?.message || e) };
    }
  }
  return out;
}

/** Summarize an API JSON body for logs without dumping secrets/PII-heavy payloads. */
function summarizeApiRes(label, res) {
  if (res == null) return { label, present: false };
  if (typeof res !== "object") return { label, present: true, type: typeof res };
  const summary = {
    label,
    present: true,
    keys: Object.keys(res).slice(0, 20),
    _status: res._status ?? null,
    _error: res._error ? String(res._error).slice(0, 200) : null,
    hasData: !!(res.data && typeof res.data === "object"),
    status_code: res.status_code ?? res.data?.status_code ?? null,
    status_msg: res.status_msg ?? res.data?.status_msg ?? null,
  };
  if (label === "user") {
    const base = res?.userBaseInfo?.UserProfile?.UserBase;
    summary.hasUserBaseInfo = !!res.userBaseInfo;
    summary.uniqId = base?.UniqId || null;
    summary.hasFanCount = base?.FanCount != null || base?.FanCnt != null;
  }
  if (label === "m10n") {
    summary.hasSevenD = res?.data?.seven_d_income != null || res?.seven_d_income != null;
    summary.hasThirtyD = res?.data?.thirty_d_income != null || res?.thirty_d_income != null;
    summary.hasSixtyD = res?.data?.sixty_d_income != null || res?.sixty_d_income != null;
    summary.hasData = summary.hasData || summary.hasSevenD || summary.hasThirtyD || summary.hasSixtyD || res?.status_code === 0;
  }
  if (label === "programs") {
    summary.activeCount = Array.isArray(res?.data?.active_m10n_programs)
      ? res.data.active_m10n_programs.length
      : null;
  }
  return summary;
}

function createTier0Diag(requestId, profileId) {
  const startedAt = Date.now();
  const events = [];
  const diag = {
    requestId,
    profileId,
    startedAt: new Date(startedAt).toISOString(),
    events,
    decisions: {},
    cookies: null,
    tabs: null,
    cache: null,
    autoOpen: null,
    executeScript: null,
    swFallback: null,
    final: null,
  };
  const log = (step, detail = {}) => {
    const entry = { t: Date.now() - startedAt, step, ...detail };
    events.push(entry);
    try {
      console.log(`[TikTokFlow][TIER-0][DIAG] +${entry.t}ms ${step}`, detail);
    } catch {
      /* ignore */
    }
  };
  return { diag, log };
}

/**
 * Poll the agent for a pending sweep request for THIS profile.
 * Called only from EXT_SWEEP_ALARM.
 */
async function pollForExtSweepRequest() {
  if (_sweepInFlight) return;
  try {
    const stored = await chrome.storage.local.get([
      "linkedGpmProfileId",
      "gpmProfileId",
      "cachedTikTokHandle",
      "latestAccount",
    ]);
    let knownProfileId = stored.linkedGpmProfileId || stored.gpmProfileId || "";

    // Lazy-link: new profiles often never get linkedGpmProfileId when the app
    // server is offline (phase-1 report fails before GPM resolve). Before polling
    // for a Tier-0 sweep, resolve via Client Agent using the known TikTok handle.
    if (!knownProfileId) {
      const handle = String(
        stored.cachedTikTokHandle || stored.latestAccount?.username || ""
      )
        .replace(/^@/, "")
        .trim()
        .toLowerCase();
      if (handle) {
        console.log(`[TikTokFlow][TIER-0] lazy-link resolve for @${handle}`);
        try {
          const match = await resolveGpmProfileForUsername(handle);
          if (match?.id) {
            knownProfileId = match.id;
            await chrome.storage.local.set({
              linkedGpmProfileId: match.id,
              linkedGpmProfileName: match.name || "",
              linkedGpmGroupName: match.groupName || "",
              linkedGpmUsername: handle,
              linkedGpmResolveAttest: match.resolveAttest || null,
            });
            console.log(
              `[TikTokFlow][TIER-0] lazy-link saved id=${String(match.id).slice(0, 8)} @${handle}`
            );
          } else {
            console.warn(`[TikTokFlow][TIER-0] lazy-link miss @${handle}`);
          }
        } catch (e) {
          console.warn(`[TikTokFlow][TIER-0] lazy-link error: ${e?.message || e}`);
        }
      } else {
        console.warn("[TikTokFlow][TIER-0] poll skipped — no linkedGpmProfileId and no cached handle");
      }
    }

    console.log(
      `[TikTokFlow][TIER-0] poll knownProfileId=${String(knownProfileId).slice(0, 8) || "(empty)"}`
    );
    const url =
      `http://127.0.0.1:${AGENT_LOCK_PORT}/pending-extension-sweep` +
      (knownProfileId ? `?profileId=${encodeURIComponent(knownProfileId)}` : "");
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { "X-TikTokFlow": "extension" },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!(data.ok && data.requestId && data.profileId)) {
      if (knownProfileId) {
        console.log(
          `[TikTokFlow][TIER-0] poll no-task for known=${String(knownProfileId).slice(0, 8)}`
        );
      }
      return;
    }

    // Never scrape our session on behalf of another profile.
    // (Best fix is agent-side: only hand out a request to the matching profile.)
    if (knownProfileId && data.profileId !== knownProfileId) {
      console.warn(
        `[TikTokFlow][TIER-0] Ignoring sweep for other profile ${String(data.profileId).slice(0, 8)} (known=${String(knownProfileId).slice(0, 8)})`
      );
      return;
    }

    if (_sweepInFlight) return; // re-check after the await
    _sweepInFlight = true;
    console.log(
      `[TikTokFlow][TIER-0] Claimed sweep requestId=${data.requestId} profileId=${String(data.profileId).slice(0, 8)} known=${String(knownProfileId).slice(0, 8) || "none"}`
    );
    performExtensionSweep(data.requestId, data.profileId)
      .catch((e) => console.warn(`[TikTokFlow][TIER-0] performExtensionSweep error: ${e.message}`))
      .finally(() => {
        _sweepInFlight = false;
      });
  } catch {
    // Agent offline or no pending request — silent
  }
}

async function postSweepResult(body, timeoutMs = 5000) {
  return fetch(`http://127.0.0.1:${AGENT_LOCK_PORT}/extension-sweep-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-TikTokFlow": "extension" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Scrape TikTok Studio data from inside the live profile browser.
 * m10n endpoints REQUIRE a Studio page context (Studio init sets HttpOnly session
 * cookies), so a Studio tab is opened only when the session cache can't satisfy us,
 * loaded on the lightweight reward page, and always closed afterwards.
 *
 * DIAG-ONLY: this function posts `tier0Debug` with the agent result so root-cause
 * analysis does not require opening the service-worker DevTools console.
 */
async function performExtensionSweep(requestId, profileId) {
  // Declared OUTSIDE try so `finally` can see them.
  let autoOpenedTabId = null;
  const { diag, log } = createTier0Diag(requestId, profileId);
  const keepalive = setInterval(() => {
    chrome.runtime.getPlatformInfo().catch(() => { });
  }, 20_000);

  const postWithDiag = async (body, timeoutMs = 5000) => {
    diag.finishedAt = new Date().toISOString();
    diag.elapsedMs = Date.now() - Date.parse(diag.startedAt);
    return postSweepResult({ ...body, tier0Debug: diag }, timeoutMs);
  };

  try {
    log("sweep_start", { profileId: String(profileId).slice(0, 8), studioUrl: STUDIO_REWARD_URL });

    let userRes = null, m10nRes = null, programsRes = null, insights = null;
    let postRewardsRaw = [];

    // Cookie presence (never values) — critical for auto-open gate diagnosis.
    diag.cookies = await probeSessionCookiesForDiag();
    log("cookie_probe", {
      sessionid: diag.cookies.sessionid?.present === true,
      sessionid_ss: diag.cookies.sessionid_ss?.present === true,
      sid_tt: diag.cookies.sid_tt?.present === true,
      autoOpenGateWouldPass: diag.cookies.sessionid?.present === true,
      altSessionPresent:
        diag.cookies.sessionid_ss?.present === true || diag.cookies.sid_tt?.present === true,
    });

    // ---------------- PRIORITY 1: session cache (read FIRST) ----------------
    const now = Date.now();
    const cacheResult = await chrome.storage.session.get("tiktokflow_api_cache").catch(() => ({}));
    const cache = cacheResult?.tiktokflow_api_cache || {};
    const fresh = (entry) => entry?.ts && now - entry.ts < API_CACHE_TTL_MS;
    const cacheAge = (entry) => (entry?.ts ? now - entry.ts : null);

    if (fresh(cache.user)) userRes = cache.user.data;
    if (fresh(cache.m10n)) m10nRes = cache.m10n.data;
    if (fresh(cache.programs)) programsRes = cache.programs.data;
    if (fresh(cache.per_post)) postRewardsRaw = cache.per_post.items ?? [];
    let insightsFromCache = false;
    for (const k of ["7", "28", "60", "365"]) {
      const entry = cache[`insight_${k}`] ?? cache[`insight_${k}d`];
      if (fresh(entry)) {
        insights = insights || {};
        insights[k] = entry.data;
        insightsFromCache = true;
      }
    }
    diag.cache = {
      user: { hit: !!userRes, ageMs: cacheAge(cache.user) },
      m10n: { hit: !!m10nRes, ageMs: cacheAge(cache.m10n) },
      programs: { hit: !!programsRes, ageMs: cacheAge(cache.programs) },
      perPost: { hit: postRewardsRaw.length > 0, count: postRewardsRaw.length, ageMs: cacheAge(cache.per_post) },
      insights: { hit: insightsFromCache },
      cacheKeys: Object.keys(cache),
    };
    log("cache_read", diag.cache);

    // Do we still need anything that only a Studio context can provide?
    const needStudio = !m10nRes || !postRewardsRaw.length;
    diag.decisions.needStudio = needStudio;
    diag.decisions.needStudioReason = !m10nRes
      ? "m10n_cache_miss"
      : !postRewardsRaw.length
        ? "per_post_cache_empty"
        : "not_needed";
    log("need_studio", { needStudio, reason: diag.decisions.needStudioReason });

    // ---------------- Tab selection ----------------
    const [studioTabs, anyTikTokTabs] = await Promise.all([
      chrome.tabs.query({ url: "https://www.tiktok.com/tiktokstudio/*" }),
      chrome.tabs.query({ url: ["https://www.tiktok.com/*", "https://*.tiktok.com/*"] }),
    ]);
    const usable = (t) => t.id && !t.discarded;
    const tabBrief = (t) => ({
      id: t.id,
      discarded: !!t.discarded,
      status: t.status || null,
      active: !!t.active,
      url: String(t.url || "").slice(0, 160),
    });
    diag.tabs = {
      studioCount: studioTabs.length,
      studioUsable: studioTabs.filter(usable).length,
      anyTikTokCount: anyTikTokTabs.length,
      anyTikTokUsable: anyTikTokTabs.filter(usable).length,
      studio: studioTabs.slice(0, 5).map(tabBrief),
      anyTikTok: anyTikTokTabs.slice(0, 8).map(tabBrief),
    };
    log("tabs_queried", diag.tabs);

    let tabId =
      (studioTabs.find(usable) ?? (needStudio ? null : anyTikTokTabs.find(usable)))?.id ?? null;
    // If we don't need Studio, any TikTok tab is enough for insights.
    if (tabId === null && !needStudio) tabId = anyTikTokTabs.find(usable)?.id ?? null;
    diag.decisions.initialTabId = tabId;
    diag.decisions.initialTabSource = studioTabs.find(usable)
      ? "existing_studio"
      : tabId
        ? "existing_tiktok"
        : "none";
    log("tab_selected_initial", {
      tabId,
      source: diag.decisions.initialTabSource,
    });

    // ---------------- Auto-open Studio ONLY when needed ----------------
    diag.autoOpen = {
      attempted: false,
      skipped: false,
      skipReason: null,
      createdTabId: null,
      loaded: null,
      m10nCachedDuringWait: null,
      finalUrl: null,
      cookiesAdded: [],
      error: null,
    };
    if (needStudio && !studioTabs.find(usable)) {
      const cfg = await chrome.storage.local.get("autoOpenStudioTab");
      const autoOpenEnabled = cfg.autoOpenStudioTab !== false;
      diag.autoOpen.configValue = cfg.autoOpenStudioTab;
      diag.autoOpen.enabled = autoOpenEnabled;
      log("auto_open_config", { autoOpenStudioTab: cfg.autoOpenStudioTab, enabled: autoOpenEnabled });

      if (autoOpenEnabled) {
        const sessionCookie = await chrome.cookies
          .get({ url: "https://www.tiktok.com", name: "sessionid" })
          .catch((e) => {
            diag.autoOpen.cookieGetError = String(e?.message || e);
            return null;
          });
        diag.autoOpen.sessionidPresent = !!sessionCookie?.value;
        diag.autoOpen.sessionidValueLen = sessionCookie?.value ? String(sessionCookie.value).length : 0;
        // Explicit comparison vs alternate cookies (diagnosis only — no behavior change).
        diag.autoOpen.gateUsesOnlySessionid = true;
        diag.autoOpen.wouldPassIfAltCookiesAccepted =
          !sessionCookie?.value &&
          (diag.cookies?.sessionid_ss?.present === true || diag.cookies?.sid_tt?.present === true);

        if (sessionCookie?.value) {
          diag.autoOpen.attempted = true;
          try {
            const before = await snapshotTikTokCookies();
            log("auto_open_create_tab", { url: STUDIO_REWARD_URL, active: false });
            const studioTab = await chrome.tabs.create({ url: STUDIO_REWARD_URL, active: false });
            autoOpenedTabId = studioTab.id;
            tabId = studioTab.id;
            diag.autoOpen.createdTabId = studioTab.id;
            diag.decisions.tabIdAfterAutoOpen = tabId;
            log("auto_open_created", { tabId: studioTab.id });

            const loaded = await waitForTabComplete(studioTab.id);
            diag.autoOpen.loaded = loaded;
            // Studio init calls run after load; wait for the interceptor to see m10n
            // (means init cookies are set), but don't block forever.
            const gotM10n = await waitForSessionCache("m10n", STUDIO_CACHE_WAIT_MS);
            diag.autoOpen.m10nCachedDuringWait = gotM10n;
            diag.autoOpen.cacheWaitMs = STUDIO_CACHE_WAIT_MS;
            if (!gotM10n) {
              log("auto_open_m10n_wait_miss", { waitedMs: STUDIO_CACHE_WAIT_MS, settleExtraMs: 2000 });
              await sleep(2000); // small settle if interceptor saw nothing
            }

            let finalTab = null;
            try {
              finalTab = await chrome.tabs.get(studioTab.id);
            } catch (e) {
              diag.autoOpen.tabGetError = String(e?.message || e);
            }
            diag.autoOpen.finalUrl = finalTab?.url ? String(finalTab.url).slice(0, 200) : null;
            diag.autoOpen.finalStatus = finalTab?.status || null;
            diag.autoOpen.stillOnStudio = /tiktokstudio/i.test(finalTab?.url || "");
            log("auto_open_ready", {
              loaded,
              m10nCached: gotM10n,
              finalUrl: diag.autoOpen.finalUrl,
              stillOnStudio: diag.autoOpen.stillOnStudio,
            });

            // Discovery: which cookies did Studio init add? (HttpOnly visible via chrome.cookies)
            const after = await snapshotTikTokCookies();
            const added = [...after.entries()]
              .filter(([k]) => !before.has(k))
              .map(([, c]) => `${c.name}${c.httpOnly ? "(httpOnly)" : ""} exp=${c.expirationDate ? Math.round(c.expirationDate - Date.now() / 1000) + "s" : "session"}`);
            diag.autoOpen.cookiesAdded = added;
            log("auto_open_cookies_added", { count: added.length, added: added.slice(0, 30) });
          } catch (e) {
            diag.autoOpen.error = String(e?.message || e);
            log("auto_open_failed", { error: diag.autoOpen.error });
          }
        } else {
          diag.autoOpen.skipped = true;
          diag.autoOpen.skipReason = "sessionid_cookie_missing";
          log("auto_open_skipped", {
            reason: "sessionid_cookie_missing",
            note: "Gate checks ONLY name=sessionid. Alternate cookies may still be present.",
            altSessionPresent:
              diag.cookies?.sessionid_ss?.present === true || diag.cookies?.sid_tt?.present === true,
            wouldPassIfAltCookiesAccepted: diag.autoOpen.wouldPassIfAltCookiesAccepted,
          });
        }
      } else {
        diag.autoOpen.skipped = true;
        diag.autoOpen.skipReason = "autoOpenStudioTab_disabled";
        log("auto_open_skipped", { reason: "autoOpenStudioTab_disabled" });
      }
    } else if (!needStudio) {
      diag.autoOpen.skipped = true;
      diag.autoOpen.skipReason = "studio_not_needed_cache_hit";
      log("auto_open_skipped", { reason: "studio_not_needed_cache_hit" });
    } else {
      diag.autoOpen.skipped = true;
      diag.autoOpen.skipReason = "studio_tab_already_open";
      log("auto_open_skipped", { reason: "studio_tab_already_open" });
    }

    // Re-read cache: the interceptor may have filled entries while Studio loaded.
    if (autoOpenedTabId !== null) {
      const r2 = await chrome.storage.session.get("tiktokflow_api_cache").catch(() => ({}));
      const c2 = r2?.tiktokflow_api_cache || {};
      const f2 = (e) => e?.ts && Date.now() - e.ts < API_CACHE_TTL_MS;
      const beforeUser = !!userRes;
      const beforeM10n = !!m10nRes;
      const beforePerPost = postRewardsRaw.length;
      if (!userRes && f2(c2.user)) userRes = c2.user.data;
      if (!m10nRes && f2(c2.m10n)) m10nRes = c2.m10n.data;
      if (!programsRes && f2(c2.programs)) programsRes = c2.programs.data;
      if (!postRewardsRaw.length && f2(c2.per_post)) postRewardsRaw = c2.per_post.items ?? [];
      log("cache_reread_after_auto_open", {
        userFilled: !beforeUser && !!userRes,
        m10nFilled: !beforeM10n && !!m10nRes,
        perPostBefore: beforePerPost,
        perPostAfter: postRewardsRaw.length,
      });
    }

    // ---------------- PRIORITY 2: executeScript in the tab ----------------
    diag.executeScript = {
      attempted: false,
      tabId: tabId,
      tabUrlBefore: null,
      error: null,
      resultPresent: false,
      summaries: null,
      postRewardsCount: 0,
    };
    if (tabId !== null) {
      diag.executeScript.attempted = true;
      try {
        const tBefore = await chrome.tabs.get(tabId);
        diag.executeScript.tabUrlBefore = tBefore?.url ? String(tBefore.url).slice(0, 200) : null;
        diag.executeScript.tabIsStudio = /tiktokstudio/i.test(tBefore?.url || "");
      } catch (e) {
        diag.executeScript.tabGetError = String(e?.message || e);
      }
      log("execute_script_start", {
        tabId,
        tabUrl: diag.executeScript.tabUrlBefore,
        tabIsStudio: diag.executeScript.tabIsStudio,
      });

      const execResult = await chrome.scripting
        .executeScript({
          target: { tabId, allFrames: false },
          world: "MAIN",
          func: async () => {
            // FIX: preserve the HTTP status when the response is not OK.
            // Returning `null` for 401/403/429 was hiding signing failures and
            // rate limits from the caller — no way to distinguish "empty" from "blocked".
            const doFetch = (url) =>
              fetch(url, {
                credentials: "include",
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(10_000),
              })
                .then((r) => (r.ok ? r.json() : { _status: r.status }))
                .catch((e) => ({ _error: String(e) }));

            // TikTok m10n APIs reject bare/sparse URLs with status_code 3016030
            // ("Invalid parameters"). Studio's own XHRs always include the full
            // creator-center SDK query string (aid/app_name/device_id/region/…).
            // A donor like `/tiktokstudio/api/web/user?aid=1988` is NOT enough.
            const STUDIO_QS_KEYS = [
              "locale", "aid", "priority_region", "region", "tz_name", "app_name",
              "app_language", "device_platform", "channel", "device_id", "os",
              "screen_width", "screen_height", "browser_language", "browser_platform",
              "browser_name", "browser_version",
            ];

            const synthesizeStudioQs = () => {
              const lang = navigator.language || "en-US";
              const regionHint = (lang.split("-")[1] || "US").toUpperCase();
              const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
              // Prefer store-country / webapp context when present.
              let priorityRegion = regionHint;
              let region = regionHint;
              try {
                const m = document.cookie.match(/(?:^|; )store-country-code=([^;]*)/);
                if (m?.[1]) priorityRegion = decodeURIComponent(m[1]).toUpperCase();
              } catch { /* ignore */ }
              try {
                const ctx =
                  window.__UNIVERSAL_DATA_FOR_REHYDRATION__?.["__DEFAULT_SCOPE__"]?.["webapp.app-context"] ||
                  {};
                if (ctx.region) region = String(ctx.region).toUpperCase();
                if (ctx.priorityRegion) priorityRegion = String(ctx.priorityRegion).toUpperCase();
              } catch { /* ignore */ }

              let deviceId = null;
              try {
                const entries = performance.getEntriesByType("resource").map((e) => e.name);
                for (const u of entries) {
                  const m = u.match(/[?&]device_id=(\d{6,})/);
                  if (m) { deviceId = m[1]; break; }
                }
              } catch { /* ignore */ }
              if (!deviceId) {
                try {
                  for (const k of Object.keys(localStorage)) {
                    if (/device.?id/i.test(k)) {
                      const v = String(localStorage.getItem(k) || "");
                      if (/^\d{6,}$/.test(v)) { deviceId = v; break; }
                    }
                  }
                } catch { /* ignore */ }
              }

              const qs = new URLSearchParams({
                locale: lang,
                aid: "1988",
                priority_region: priorityRegion,
                region,
                tz_name: tz,
                app_name: "tiktok_creator_center",
                app_language: lang,
                device_platform: "web_pc",
                channel: "tiktok_web",
                os: /win/i.test(navigator.platform || "") ? "win" : "mac",
                screen_width: String(screen.width || 1920),
                screen_height: String(screen.height || 1080),
                browser_language: lang,
                browser_platform: navigator.platform || "Win32",
                browser_name: "Mozilla",
                browser_version: navigator.userAgent || "",
              });
              if (deviceId) qs.set("device_id", deviceId);
              return qs;
            };

            const pickRichestDonorQs = () => {
              const entries = performance.getEntriesByType("resource").map((e) => e.name);
              let best = null;
              let bestScore = -1;
              let bestUrl = null;
              for (const raw of entries) {
                if (!/[?&]aid=/.test(raw)) continue;
                if (!/m10n_center|tiktok_creator_center|tiktokstudio|studio_platform|creator\/manage|analytics\/insights|aweme\/v2\/data\/insight/i.test(raw)) {
                  continue;
                }
                try {
                  const u = new URL(raw, location.origin);
                  let score = 0;
                  const qs = new URLSearchParams();
                  for (const k of STUDIO_QS_KEYS) {
                    const v = u.searchParams.get(k);
                    if (v != null && v !== "") {
                      qs.set(k, v);
                      score += (k === "device_id" || k === "app_name" || k === "region") ? 3 : 1;
                    }
                  }
                  if (score > bestScore) {
                    bestScore = score;
                    best = qs;
                    bestUrl = raw;
                  }
                } catch { /* next */ }
              }
              return best ? { qs: best, score: bestScore, donor: String(bestUrl).slice(0, 220) } : null;
            };

            const buildStudioQs = () => {
              // Always start from a full synthesized baseline, then overlay the
              // richest live Studio XHR params (so sparse donors like user?aid=1988
              // cannot wipe required fields).
              const qs = synthesizeStudioQs();
              const donor = pickRichestDonorQs();
              if (donor?.qs) {
                for (const [k, v] of donor.qs.entries()) {
                  if (v != null && v !== "") qs.set(k, v);
                }
              }
              if (!qs.get("aid")) qs.set("aid", "1988");
              if (!qs.get("app_name")) qs.set("app_name", "tiktok_creator_center");
              if (!qs.get("device_platform")) qs.set("device_platform", "web_pc");
              if (!qs.get("channel")) qs.set("channel", "tiktok_web");
              return {
                qs,
                source: donor ? `merged_donor_score_${donor.score}` : "synthesized",
                donor: donor?.donor || null,
              };
            };

            const withStudioQs = (pathOrUrl, extra = {}) => {
              const { qs: baseQs, source, donor } = buildStudioQs();
              const u = new URL(pathOrUrl, location.origin);
              for (const [k, v] of baseQs.entries()) {
                if (!u.searchParams.has(k)) u.searchParams.set(k, v);
              }
              for (const [k, v] of Object.entries(extra)) {
                if (v != null) u.searchParams.set(k, String(v));
              }
              return { url: u.toString(), source, donor };
            };

            const tzOffset = -new Date().getTimezoneOffset() * 60;
            // period + pad so trailing status:2 (unfinalized) days don't shrink the window
            const ranges = [
              { key: "7", days: 14, end_days: 1 },
              { key: "28", days: 35, end_days: 1 },
              { key: "60", days: 67, end_days: 1 },
              { key: "365", days: 372, end_days: 1 },
            ];
            const insightTypes = ["vv_history", "like_history", "comment_history", "share_history", "pv_history"];

            const pageUrl = String(location.href || "");

            // Give Studio a moment to emit a fully-parameterized XHR (device_id etc.)
            // before we synthesize/merge query params.
            {
              const end = Date.now() + 5000;
              while (Date.now() < end) {
                const hit = performance.getEntriesByType("resource").some((e) =>
                  /[?&]device_id=\d{6,}/.test(e.name || "")
                );
                if (hit) break;
                await new Promise((r) => setTimeout(r, 400));
              }
            }

            const userBuilt = withStudioQs("https://www.tiktok.com/tiktokstudio/api/web/user");
            const m10nBuilt = withStudioQs("https://www.tiktok.com/tiktok/v1/creator/m10n_center/reward_analytics");
            const programsBuilt = withStudioQs("https://www.tiktok.com/tiktok/v1/creator/m10n_center/all_programs");
            const paramsMeta = {
              source: m10nBuilt.source,
              donor: m10nBuilt.donor,
              m10nUrl: m10nBuilt.url.slice(0, 400),
              hasDeviceId: /[?&]device_id=/.test(m10nBuilt.url),
              hasRegion: /[?&]region=/.test(m10nBuilt.url),
              appName: (m10nBuilt.url.match(/[?&]app_name=([^&]+)/) || [])[1] || null,
            };

            const [userRes, m10nRes, programsRes, ...insightResults] = await Promise.all([
              doFetch(userBuilt.url),
              doFetch(m10nBuilt.url),
              doFetch(programsBuilt.url),
              ...ranges.map((r) => {
                const typeReqs = insightTypes.map((t) => ({
                  insigh_type: t, days: r.days, end_days: r.end_days,
                }));
                const built = withStudioQs("/aweme/v2/data/insight/", {
                  tz_offset: String(tzOffset),
                  type_requests: JSON.stringify(typeReqs),
                });
                return doFetch(built.url).then((res) => ({ key: r.key, res }));
              }),
            ]);

            const insights = {};
            for (const { key, res } of insightResults) insights[key] = res ?? {};

            const postRewardsRaw = [];
            const perPostPages = [];
            // per_post requires page + video_analytics_filter (cursor/count alone → status 5).
            let programIds = [];
            try {
              const fromM10n = (m10nRes?.m10n_program_user_income || m10nRes?.data?.m10n_program_user_income || [])
                .map((p) => Number(p.m10n_program))
                .filter((n) => Number.isFinite(n) && n > 0);
              const fromPrograms = (programsRes?.data?.active_m10n_programs || programsRes?.active_m10n_programs || [])
                .map((p) => Number(p.m10n_project ?? p.m10n_program ?? p.id))
                .filter((n) => Number.isFinite(n) && n > 0);
              programIds = [...new Set([...fromM10n, ...fromPrograms])];
            } catch { /* ignore */ }
            if (!programIds.length) programIds = [9];

            for (const progId of programIds.slice(0, 4)) {
              for (let pageIdx = 0; pageIdx < 20; pageIdx++) {
                const built = withStudioQs(
                  "/tiktok/v1/creator/m10n_center/reward_analytics_per_post",
                  {
                    page: String(pageIdx),
                    video_analytics_filter: JSON.stringify({
                      video_analytics_display_time_range: 3,
                      video_analytics_sort_by_type: 3,
                      video_analytics_programs: [progId],
                    }),
                  }
                );
                const page = await doFetch(built.url);
                const payload = page?.data || page;
                const items = payload?.video_analytics_video_list ?? [];
                for (const item of items) item._queried_program_id = progId;
                perPostPages.push({
                  page: pageIdx,
                  progId,
                  itemCount: items.length,
                  hasMore: !!payload?.has_more,
                  status_code: page?.status_code ?? null,
                  status_msg: page?.status_msg ?? null,
                  _status: page?._status ?? null,
                  _error: page?._error ? String(page._error).slice(0, 120) : null,
                });
                if (page?.status_code && page.status_code !== 0 && !items.length) break;
                if (!items.length) break;
                postRewardsRaw.push(...items);
                if (!payload?.has_more) break;
              }
            }

            return {
              pageUrl,
              userRes,
              m10nRes,
              programsRes,
              insights,
              postRewardsRaw,
              perPostPages,
              paramsMeta,
            };
          },
        })
        .catch((e) => {
          diag.executeScript.error = String(e?.message || e);
          log("execute_script_threw", { error: diag.executeScript.error });
          return [{ result: null }];
        });

      const r = execResult?.[0]?.result;
      diag.executeScript.resultPresent = !!r;
      if (r) {
        if (!userRes && r.userRes) userRes = r.userRes;
        if (!m10nRes && r.m10nRes) m10nRes = r.m10nRes;
        if (!programsRes && r.programsRes) programsRes = r.programsRes;
        if (!postRewardsRaw.length && r.postRewardsRaw?.length) postRewardsRaw = r.postRewardsRaw;
        if (!insights && r.insights) insights = r.insights;
        else if (r.insights) {
          for (const [k, v] of Object.entries(r.insights)) {
            if (!insights[k] || Object.keys(insights[k]).length === 0) insights[k] = v;
          }
        }
        diag.executeScript.pageUrl = r.pageUrl ? String(r.pageUrl).slice(0, 200) : null;
        diag.executeScript.pageIsStudio = /tiktokstudio/i.test(r.pageUrl || "");
        diag.executeScript.postRewardsCount = Array.isArray(r.postRewardsRaw) ? r.postRewardsRaw.length : 0;
        diag.executeScript.perPostPages = r.perPostPages || null;
        diag.executeScript.paramsMeta = r.paramsMeta || null;
        diag.executeScript.summaries = {
          user: summarizeApiRes("user", r.userRes),
          m10n: summarizeApiRes("m10n", r.m10nRes),
          programs: summarizeApiRes("programs", r.programsRes),
          insightKeys: r.insights ? Object.keys(r.insights) : [],
        };
        log("execute_script_done", {
          ...diag.executeScript.summaries,
          paramsMeta: r.paramsMeta || null,
        });
      } else {
        log("execute_script_empty_result", { tabId });
      }
    } else {
      log("execute_script_skipped", { reason: "no_tab_id" });
    }

    // ---------------- CONTENT / item_list (videosList) ----------------
    // Monetization APIs do not return the Studio content library. Navigate the
    // Studio tab to /tiktokstudio/content and paginate item_list with the same
    // creator-center query params that Studio itself uses.
    let videosRaw = [];
    let studioTotalVideos = 0;
    let publicStats = null;
    diag.contentList = { attempted: false, count: 0, studioTotalVideos: 0, error: null };
    if (tabId !== null) {
      diag.contentList.attempted = true;
      try {
        log("content_nav_start", { url: STUDIO_CONTENT_URL, tabId });
        await chrome.tabs.update(tabId, { url: STUDIO_CONTENT_URL });
        const contentLoaded = await waitForTabComplete(tabId, STUDIO_LOAD_TIMEOUT_MS);
        // Allow creator-center XHRs (item_list) to populate performance entries.
        await sleep(2500);
        log("content_nav_ready", { loaded: contentLoaded });

        const contentExec = await chrome.scripting
          .executeScript({
            target: { tabId, allFrames: false },
            world: "MAIN",
            func: async () => {
              const doFetch = (url, init = {}) =>
                fetch(url, {
                  credentials: "include",
                  headers: { Accept: "application/json", ...(init.headers || {}) },
                  signal: AbortSignal.timeout(15_000),
                  ...init,
                })
                  .then(async (r) => {
                    if (!r.ok) return { _status: r.status };
                    try { return await r.json(); } catch (e) { return { _error: String(e) }; }
                  })
                  .catch((e) => ({ _error: String(e) }));

              const STUDIO_QS_KEYS = [
                "locale", "aid", "priority_region", "region", "tz_name", "app_name",
                "app_language", "device_platform", "channel", "device_id", "os",
                "screen_width", "screen_height", "browser_language", "browser_platform",
                "browser_name", "browser_version", "msToken",
              ];

              const synthesizeStudioQs = () => {
                const lang = navigator.language || "en-US";
                const regionHint = (lang.split("-")[1] || "US").toUpperCase();
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
                let priorityRegion = regionHint;
                let region = regionHint;
                try {
                  const m = document.cookie.match(/(?:^|; )store-country-code=([^;]*)/);
                  if (m?.[1]) priorityRegion = decodeURIComponent(m[1]).toUpperCase();
                } catch { /* ignore */ }
                let deviceId = null;
                try {
                  for (const e of performance.getEntriesByType("resource")) {
                    const m = String(e.name || "").match(/[?&]device_id=(\d{6,})/);
                    if (m) { deviceId = m[1]; break; }
                  }
                } catch { /* ignore */ }
                const qs = new URLSearchParams({
                  locale: lang,
                  aid: "1988",
                  priority_region: priorityRegion,
                  region,
                  tz_name: tz,
                  app_name: "tiktok_creator_center",
                  app_language: lang,
                  device_platform: "web_pc",
                  channel: "tiktok_web",
                  os: /win/i.test(navigator.platform || "") ? "win" : "mac",
                  screen_width: String(screen.width || 1920),
                  screen_height: String(screen.height || 1080),
                  browser_language: lang,
                  browser_platform: navigator.platform || "Win32",
                  browser_name: "Mozilla",
                  browser_version: navigator.userAgent || "",
                });
                if (deviceId) qs.set("device_id", deviceId);
                return qs;
              };

              const pickRichestDonor = () => {
                const entries = performance.getEntriesByType("resource").map((e) => e.name);
                let best = null, bestScore = -1, bestUrl = null;
                for (const raw of entries) {
                  if (!/[?&]aid=/.test(raw)) continue;
                  if (!/item_list|tiktok_creator_center|tiktokstudio|studio_platform|m10n_center|analytics\/insights/i.test(raw)) continue;
                  try {
                    const u = new URL(raw, location.origin);
                    let score = 0;
                    const qs = new URLSearchParams();
                    for (const k of STUDIO_QS_KEYS) {
                      const v = u.searchParams.get(k);
                      if (v != null && v !== "") {
                        qs.set(k, v);
                        score += (k === "device_id" || k === "msToken" || k === "app_name") ? 3 : 1;
                      }
                    }
                    // Prefer an actual item_list URL as base for pagination.
                    if (/item_list/i.test(raw)) score += 20;
                    if (score > bestScore) {
                      bestScore = score;
                      best = qs;
                      bestUrl = raw;
                    }
                  } catch { /* next */ }
                }
                return best ? { qs: best, score: bestScore, donor: String(bestUrl).slice(0, 260) } : null;
              };

              // Wait briefly for content page to fire a signed item_list request.
              {
                const end = Date.now() + 8000;
                while (Date.now() < end) {
                  const hit = performance.getEntriesByType("resource").some((e) =>
                    /creator\/manage\/item_list|item_list\/v1/i.test(e.name || "")
                  );
                  if (hit) break;
                  // Nudge infinite scroll so Studio loads item_list.
                  try {
                    window.scrollTo(0, document.body.scrollHeight);
                    document.querySelectorAll('div[class*="content"], div[class*="list"], main').forEach((el) => {
                      el.scrollTop = el.scrollHeight;
                    });
                  } catch { /* ignore */ }
                  await new Promise((r) => setTimeout(r, 500));
                }
              }

              const baseQs = synthesizeStudioQs();
              const donor = pickRichestDonor();
              if (donor?.qs) {
                for (const [k, v] of donor.qs.entries()) {
                  if (v != null && v !== "") baseQs.set(k, v);
                }
              }

              // Seed from SSR creator-center context when present.
              const byId = new Map();
              let studioTotalVideos = 0;
              const pageSafeId = (...candidates) => {
                for (const c of candidates) {
                  if (c == null || c === "") continue;
                  if (typeof c === "string" && /^\d{5,}$/.test(c)) return c;
                  if (typeof c === "number" && Number.isSafeInteger(c)) return String(c);
                  if (typeof c === "bigint") return String(c);
                  const s = String(c);
                  if (/^\d{5,}$/.test(s)) return s;
                }
                return "";
              };
              const engagementOf = (item) => {
                const stats = item?.statistics || item?.stats || {};
                const play = Number(item?.play_count || item?.playCount || stats.play_count || stats.playCount || item?.views || 0) || 0;
                const like = Number(item?.like_count || item?.likeCount || item?.digg_count || stats.digg_count || 0) || 0;
                return play * 1000 + like;
              };
              const upsertById = (item) => {
                const id = pageSafeId(item?.video_id_str, item?.item_id, item?.id, item?.aweme_id, item?.video_id);
                if (!id) return;
                const prev = byId.get(id);
                if (!prev || engagementOf(item) >= engagementOf(prev)) byId.set(id, item);
              };
              const pickTotal = (json) => {
                const candidates = [
                  json?.total, json?.total_count, json?.item_count, json?.post_count,
                  json?.data?.total, json?.data?.total_count, json?.data?.item_count,
                ];
                for (const c of candidates) {
                  const n = Number(c);
                  if (Number.isFinite(n) && n > 0) return n;
                }
                return 0;
              };
              try {
                const el = document.getElementById("__Creator_Center_Context__");
                if (el?.textContent) {
                  const s = el.textContent
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, "&")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">");
                  const parsed = JSON.parse(s);
                  const batches = [
                    parsed.firstBatchQueryItems?.item_list,
                    parsed.firstBatchQueryItems?.itemList,
                    parsed.firstBatchQueryItems?.items,
                    parsed.item_list,
                    parsed.itemList,
                    parsed.data?.firstBatchQueryItems?.item_list,
                    parsed.data?.item_list,
                  ];
                  for (const batch of batches) {
                    if (!Array.isArray(batch)) continue;
                    for (const item of batch) upsertById(item);
                  }
                  const ctxTotal = pickTotal(parsed) || pickTotal(parsed.firstBatchQueryItems) || pickTotal(parsed.data);
                  if (ctxTotal > studioTotalVideos) studioTotalVideos = ctxTotal;
                }
              } catch { /* ignore */ }

              try {
                const text = document.body?.innerText || "";
                const m = text.match(/(?:Bài đăng|Posts?|Videos?)\s*\(?\s*([\d,]+)\s*\)?/i) ||
                  text.match(/([\d,]+)\s+(?:bài đăng|posts?|videos?)/i);
                if (m) studioTotalVideos = parseInt(String(m[1]).replace(/,/g, ""), 10) || studioTotalVideos;
              } catch { /* ignore */ }

              const itemListPath = "/tiktok/creator/manage/item_list/v1/";
              const seenListUrls = new Set();
              const pages = [];
              // Match agent.js scrapePageMetrics: recent window only (not full library).
              const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
              const parseItemTs = (item) => {
                const t = item.createTime || item.create_time || item.createtime ||
                  item.publish_date_unix_time || item.statistics?.createTime || item.item?.createTime;
                if (!t) return 0;
                const n = Number(t);
                return n > 1e11 ? n : n * 1000;
              };

              const ingestJson = (json, meta = {}) => {
                const list = json?.item_list || json?.itemList || json?.items || json?.post_list ||
                  json?.data?.item_list || json?.data?.itemList || json?.data?.items || [];
                if (Array.isArray(list)) {
                  for (const item of list) upsertById(item);
                }
                const apiTotal = pickTotal(json);
                if (apiTotal > studioTotalVideos) studioTotalVideos = apiTotal;
                pages.push({
                  ...meta,
                  itemCount: Array.isArray(list) ? list.length : 0,
                  hasMore: !!(json?.has_more ?? json?.data?.has_more),
                  cursor: json?.cursor ?? json?.data?.cursor ?? null,
                  status_code: json?.status_code ?? null,
                  _status: json?._status ?? null,
                  _error: json?._error ? String(json._error).slice(0, 120) : null,
                  total: apiTotal || null,
                });
                return {
                  list: Array.isArray(list) ? list : [],
                  hasMore: !!(json?.has_more ?? json?.data?.has_more),
                  nextCursor: json?.cursor ?? json?.data?.cursor,
                };
              };

              // 1) Fetch exact signed item_list URLs already in performance
              //    (do NOT rewrite cursor — that invalidates X-Bogus / X-Gnarly).
              const harvestPerfItemLists = async () => {
                const entries = performance.getEntriesByType("resource").map((e) => e.name);
                for (const raw of entries) {
                  if (!/creator\/manage\/item_list|item_list\/v1/i.test(raw)) continue;
                  if (seenListUrls.has(raw)) continue;
                  seenListUrls.add(raw);
                  const json = await doFetch(raw);
                  ingestJson(json, { source: "perf_exact", url: String(raw).slice(0, 120) });
                }
              };
              await harvestPerfItemLists();

              // 2) POST pagination — same caps as agent.js (max 4 pages, 14d early stop).
              let cursor = 0;
              let hasMore = true;
              for (let pageIdx = 0; pageIdx < 4 && hasMore; pageIdx++) {
                const u = new URL(itemListPath, location.origin);
                for (const [k, v] of baseQs.entries()) {
                  if (k === "msToken" || k === "X-Bogus" || k === "X-Gnarly") continue;
                  u.searchParams.set(k, v);
                }
                let used = await doFetch(u.toString(), {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ cursor, count: 50, size: 50 }),
                });
                if (
                  (!used?.item_list && !used?.data?.item_list) &&
                  (used?._status || (used?.status_code && used.status_code !== 0))
                ) {
                  used = await doFetch(u.toString(), {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                      cursor: String(cursor),
                      count: "50",
                      size: "50",
                    }).toString(),
                  });
                }
                let result = ingestJson(used, { source: "post", page: pageIdx, cursor });
                if (!result.list.length) {
                  const g = new URL(itemListPath, location.origin);
                  for (const [k, v] of baseQs.entries()) {
                    if (k === "msToken" || k === "X-Bogus" || k === "X-Gnarly") continue;
                    g.searchParams.set(k, v);
                  }
                  g.searchParams.set("cursor", String(cursor));
                  g.searchParams.set("count", "50");
                  g.searchParams.set("size", "50");
                  result = ingestJson(await doFetch(g.toString()), { source: "get", page: pageIdx, cursor });
                }
                if (!result.list.length) break;
                cursor = typeof result.nextCursor === "number"
                  ? result.nextCursor
                  : cursor + result.list.length;
                hasMore = result.hasMore;
                const timestamps = result.list.map(parseItemTs).filter((t) => t > 0);
                if (timestamps.length > 0) {
                  const oldest = Math.min(...timestamps);
                  if (Date.now() - oldest > LOOKBACK_MS) {
                    hasMore = false;
                    pages.push({ source: "lookback_stop", oldestMs: oldest, lookbackMs: LOOKBACK_MS });
                  }
                }
                await new Promise((r) => setTimeout(r, 300));
              }

              // 3) Light scroll harvest (agent.js uses up to 8 scrolls) — only if still thin.
              if (byId.size < 20) {
                let stagnant = 0;
                let lastSize = byId.size;
                for (let scrollIdx = 0; scrollIdx < 8; scrollIdx++) {
                  try {
                    window.scrollTo(0, document.body.scrollHeight);
                    document.querySelectorAll(
                      'div[class*="content"], div[class*="table"], div[class*="list"], div[class*="scroll"], main'
                    ).forEach((el) => { el.scrollTop = el.scrollHeight; });
                  } catch { /* ignore */ }
                  await new Promise((r) => setTimeout(r, 900));
                  await harvestPerfItemLists();
                  if (byId.size === lastSize) {
                    stagnant += 1;
                    if (stagnant >= 3) break;
                  } else {
                    stagnant = 0;
                    lastSize = byId.size;
                  }
                }
              }

              // Public profile stats for followers / videoCount when Studio user API omits FanCount.
              let publicStats = null;
              try {
                const handle =
                  window.__UNIVERSAL_DATA_FOR_REHYDRATION__?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.user?.uniqueId ||
                  null;
                // Fallback: parse from any profile link on the page.
                let uniq = handle;
                if (!uniq) {
                  const a = document.querySelector('a[href^="/@"]');
                  const m = a?.getAttribute("href")?.match(/^\/@([A-Za-z0-9._]+)/);
                  if (m) uniq = m[1];
                }
                if (uniq) {
                  const htmlRes = await fetch(`https://www.tiktok.com/@${uniq}`, {
                    credentials: "include",
                    signal: AbortSignal.timeout(8000),
                  });
                  if (htmlRes.ok) {
                    const html = await htmlRes.text();
                    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
                    if (match) {
                      const parsed = JSON.parse(match[1]);
                      publicStats = parsed["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.stats || null;
                    }
                  }
                }
              } catch { /* ignore */ }

              return {
                pageUrl: String(location.href || ""),
                items: Array.from(byId.values()),
                studioTotalVideos,
                publicStats,
                pages,
                paramsMeta: {
                  source: donor ? `merged_donor_score_${donor.score}` : "synthesized",
                  donor: donor?.donor || null,
                  hasDeviceId: !!baseQs.get("device_id"),
                  itemCount: byId.size,
                },
              };
            },
          })
          .catch((e) => {
            diag.contentList.error = String(e?.message || e);
            log("content_exec_threw", { error: diag.contentList.error });
            return [{ result: null }];
          });

        const cr = contentExec?.[0]?.result;
        if (cr) {
          videosRaw = Array.isArray(cr.items) ? cr.items : [];
          studioTotalVideos = Number(cr.studioTotalVideos || 0);
          publicStats = cr.publicStats || null;
          diag.contentList.count = videosRaw.length;
          diag.contentList.studioTotalVideos = studioTotalVideos;
          diag.contentList.pages = cr.pages || null;
          diag.contentList.paramsMeta = cr.paramsMeta || null;
          diag.contentList.publicFollowers = publicStats?.followerCount ?? null;
          diag.contentList.publicVideoCount = publicStats?.videoCount ?? null;
          log("content_exec_done", {
            videos: videosRaw.length,
            studioTotalVideos,
            publicFollowers: diag.contentList.publicFollowers,
            publicVideoCount: diag.contentList.publicVideoCount,
            paramsMeta: cr.paramsMeta || null,
          });
        } else {
          log("content_exec_empty", {});
        }
      } catch (e) {
        diag.contentList.error = String(e?.message || e);
        log("content_phase_failed", { error: diag.contentList.error });
      }
    }

    // ---------------- FALLBACK: SW fetch (user info only in practice) ----------------
    diag.swFallback = { used: false, reason: null, summaries: null };
    if (!tabId || !userRes) {
      diag.swFallback.used = true;
      diag.swFallback.reason = !tabId ? "no_tab_id" : "no_userRes_after_exec";
      log("sw_fallback_start", { reason: diag.swFallback.reason });
      // FIX: removed the forbidden Referer header (silently stripped by Chrome)
      // and preserved HTTP status so signing failures are visible to the caller.
      // Same 3016030 fix as MAIN-world fetches: bare m10n URLs are rejected.
      // SW cannot see page performance entries, so use a fuller synthesized set.
      const swStudioQs = new URLSearchParams({
        aid: "1988",
        app_name: "tiktok_creator_center",
        device_platform: "web_pc",
        channel: "tiktok_web",
        os: "win",
        browser_name: "Mozilla",
        browser_platform: "Win32",
      }).toString();
      const swFetch = (url) =>
        fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        })
          .then((r) => (r.ok ? r.json() : { _status: r.status }))
          .catch((e) => ({ _error: String(e) }));

      const [u, m, p] = await Promise.all([
        swFetch(`https://www.tiktok.com/tiktokstudio/api/web/user?${swStudioQs}`),
        m10nRes
          ? Promise.resolve(m10nRes)
          : swFetch(`https://www.tiktok.com/tiktok/v1/creator/m10n_center/reward_analytics?${swStudioQs}`),
        programsRes
          ? Promise.resolve(programsRes)
          : swFetch(`https://www.tiktok.com/tiktok/v1/creator/m10n_center/all_programs?${swStudioQs}`),
      ]);
      userRes = userRes || u;
      m10nRes = m10nRes || m;
      programsRes = programsRes || p;
      diag.swFallback.summaries = {
        user: summarizeApiRes("user", u),
        m10n: summarizeApiRes("m10n", m),
        programs: summarizeApiRes("programs", p),
      };
      diag.swFallback.studioQs = swStudioQs;
      log("sw_fallback_done", diag.swFallback.summaries);
    }

    const hasAnyData = !!(
      userRes?.userBaseInfo ||
      m10nRes?.data ||
      m10nRes?.seven_d_income != null ||
      m10nRes?.status_code === 0 ||
      postRewardsRaw.length > 0
    );
    diag.final = {
      hasAnyData,
      hasUserBaseInfo: !!userRes?.userBaseInfo,
      hasM10nData: !!m10nRes?.data,
      postRewardsCount: postRewardsRaw.length,
      insightsKeys: insights ? Object.keys(insights) : [],
      userSummary: summarizeApiRes("user", userRes),
      m10nSummary: summarizeApiRes("m10n", m10nRes),
      programsSummary: summarizeApiRes("programs", programsRes),
      tabIdFinal: tabId,
      autoOpenedTabId,
    };
    log("assemble_inputs", diag.final);

    if (!hasAnyData) {
      log("all_empty_fail", {});
      await postWithDiag(
        { requestId, profileId, success: false, error: "extension_api_all_empty" },
        3000
      ).catch(() => { });
      return;
    }

    const m10nPeek = m10nRes?.data ?? m10nRes ?? {};
    const currencyPeek =
      m10nPeek.selected_currency?.symbol ?? m10nPeek.selected_currency?.code ?? "$";
    const sweepCountry = await resolveSweepCountryIso(currencyPeek, userRes);

    const payload = assembleExtensionSweepPayload({
      profileId, userRes, m10nRes, programsRes, insights, postRewardsRaw,
      videosRaw, studioTotalVideos, publicStats, country: sweepCountry,
    });
    diag.final.assembledSuccess = !!payload?.success;
    diag.final.assembledUsername = payload?.data?.username || null;
    diag.final.assembledCreatorRewardsMissing = payload?.data?.creatorRewardsMissing ?? null;
    diag.final.assembledTotalRevenue = payload?.data?.totalRevenue ?? null;
    diag.final.assembledCountry = payload?.data?.country ?? null;
    diag.final.assembledRpm = payload?.data?.rpm ?? null;
    diag.final.assembledFollowers = payload?.data?.followersCount ?? null;
    diag.final.assembledVideosList = Array.isArray(payload?.data?.videosList) ? payload.data.videosList.length : 0;
    diag.final.assembledPostRewards = Array.isArray(payload?.data?.postRewards) ? payload.data.postRewards.length : 0;
    diag.final.assembledVideoCount = payload?.data?.videoCount ?? null;
    log("assemble_done", {
      success: payload?.success,
      username: diag.final.assembledUsername,
      creatorRewardsMissing: diag.final.assembledCreatorRewardsMissing,
      totalRevenue: diag.final.assembledTotalRevenue,
      country: diag.final.assembledCountry,
      rpm: diag.final.assembledRpm,
      followers: diag.final.assembledFollowers,
      videosList: diag.final.assembledVideosList,
      postRewards: diag.final.assembledPostRewards,
      videoCount: diag.final.assembledVideoCount,
    });

    await postWithDiag({ requestId, profileId, ...payload }, 5000);
    log("result_posted", { success: payload?.success !== false });
  } catch (err) {
    log("sweep_exception", { error: String(err?.message || err) });
    await postWithDiag({ requestId, profileId, success: false, error: err.message }, 3000).catch(() => { });
  } finally {
    clearInterval(keepalive);
    if (autoOpenedTabId !== null) {
      log("auto_open_tab_closing", { tabId: autoOpenedTabId });
      chrome.tabs.remove(autoOpenedTabId).catch(() => { });
    }
  }
}

/**
 * Map raw TikTok API responses (from the extension SW / executeScript) into the
 * same shape that scrapePageMetrics() returns so the agent can handle it identically.
 */
function assembleExtensionSweepPayload({
  profileId, userRes, m10nRes, programsRes, insights, postRewardsRaw,
  videosRaw = [], studioTotalVideos = 0, publicStats = null, country = null,
}) {
  try {
    const PROGRAM_ID_MAP = {
      0: "Không xác định",
      1: "Quà tặng video (Video Gifts)", 2: "Tiền boa (Tips)", 3: "Creator Next",
      4: "Quỹ nhà sáng tạo (Creator Fund)", 5: "TikTok Creator Marketplace",
      6: "Shoutouts", 7: "Quà tặng LIVE (Live Gifts)", 8: "TikTok Shop",
      9: "Chương trình Creator Rewards", 10: "Series", 11: "TikTok Shop Merchant",
      12: "Quảng bá âm nhạc (Work with Artists)", 13: "Đăng ký LIVE (Live Subscription)",
      14: "TikTok Creative Challenge", 15: "TikTok Gaming Reward", 16: "Branded Mission",
      17: "TikTok Local Service", 18: "Go Live Incentive", 19: "Go Live Leads",
      20: "SoundOn", 21: "Go Live SMB",
    };

    const parseMoney = (m) => {
      if (!m) return 0;
      if (typeof m === "number") return m;
      if (m.formatted_no_symbol) {
        const v = parseFloat(String(m.formatted_no_symbol).replace(/,/g, ""));
        if (!isNaN(v)) return v;
      }
      const units = typeof m.units === "number" ? m.units : parseInt(m.units || "0", 10) || 0;
      const nanos = typeof m.nanos === "number" ? m.nanos : parseInt(m.nanos || "0", 10) || 0;
      return units + nanos / 1e9;
    };

    const formatDuration = (dur) => {
      let sec = Number(dur);
      if (!Number.isFinite(sec) || sec <= 0) return null;
      if (sec >= 1000) sec = sec / 1000;
      const totalSec = Math.floor(sec);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const safeId = (...candidates) => {
      for (const c of candidates) {
        if (c == null) continue;
        // Prefer already-string IDs to avoid Number precision loss on TikTok snowflakes.
        if (typeof c === "string" && /^\d{5,}$/.test(c)) return c;
        if (typeof c === "number" && Number.isSafeInteger(c)) return String(c);
        const s = String(c);
        if (/^\d{5,}$/.test(s)) return s;
      }
      return "";
    };

    // ---- User info ----
    const userBase = userRes?.userBaseInfo?.UserProfile?.UserBase ?? {};
    const username = userBase?.UniqId ?? null;
    const nickname = userBase?.NickName ?? null;

    // ---- Follower count ----
    const followerCount = Math.max(
      Number(userBase?.FanCount ?? userBase?.FanCnt ?? 0) || 0,
      Number(userRes?.userBaseInfo?.UserProfile?.stats?.followerCount ?? 0) || 0,
      Number(publicStats?.followerCount ?? 0) || 0
    );

    // ---- Monetization / revenue ----
    const m10nData = m10nRes?.data ?? m10nRes ?? {};
    const currency = m10nData.selected_currency?.symbol ?? m10nData.selected_currency?.code ?? "$";
    const revenue7d = parseMoney(m10nData.seven_d_income);
    const revenue28d = parseMoney(m10nData.thirty_d_income);
    const revenue60d = parseMoney(m10nData.sixty_d_income);
    const totalRevenue = Math.max(revenue7d, revenue28d, revenue60d);
    const dailyBreakdown = (m10nData.daily_estimated_income ?? []).map((item) => ({
      date: new Date(item.time * 1000).toISOString().split("T")[0],
      revenue: parseMoney(item.money),
    }));
    const activePrograms = (m10nData.m10n_program_user_income ?? []).map((p) => ({
      name: p.m10n_program_name ?? `Program ${p.m10n_program}`,
      programId: p.m10n_program,
      revenue7d: parseMoney(p.seven_d_income),
      revenue30d: parseMoney(p.thirty_d_income),
      revenue60d: parseMoney(p.sixty_d_income),
    }));

    const allPrograms = programsRes?.data?.active_m10n_programs ?? [];
    const programNames = new Set(activePrograms.map((p) => p.name));
    for (const ap of allPrograms) {
      if (ap?.name && !programNames.has(ap.name) && !/shop/i.test(ap.name)) {
        activePrograms.push({ name: ap.name, programId: ap.m10n_project, revenue7d: 0, revenue30d: 0, revenue60d: 0 });
        programNames.add(ap.name);
      }
    }

    // ---- Insights (parity with agent: ok | no_data | unavailable) ----
    // Studio excludes trailing status:2 (unfinalized) days, then sums last N.
    const countTrailingInsightUnavailable = (history) => {
      if (!Array.isArray(history) || history.length === 0) return 0;
      let n = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        if (Number(history[i]?.status) === 2) n += 1;
        else break;
      }
      return n;
    };
    const sumStudioInsightPeriod = (history, periodDays) => {
      if (!Array.isArray(history) || periodDays <= 0) return 0;
      const trim = countTrailingInsightUnavailable(history);
      const end = history.length - trim;
      const start = Math.max(0, end - periodDays);
      let s = 0;
      for (let i = start; i < end; i++) s += Number(history[i]?.value || 0) || 0;
      return s;
    };
    const INSIGHT_PERIODS = [7, 28, 60, 365];
    const getVal = (dayKey, metric) =>
      sumStudioInsightPeriod(insights?.[String(dayKey)]?.[metric], dayKey);
    const historiesHealthy = INSIGHT_PERIODS.every((k) =>
      Array.isArray(insights?.[String(k)]?.vv_history)
    );
    const views7d = getVal(7, "vv_history");
    const views28d = getVal(28, "vv_history");
    const views60d = getVal(60, "vv_history");
    const views365d = getVal(365, "vv_history");
    const likes7d = getVal(7, "like_history");
    const likes28d = getVal(28, "like_history");
    const likes60d = getVal(60, "like_history");
    const likes365d = getVal(365, "like_history");
    const comments7d = getVal(7, "comment_history");
    const comments28d = getVal(28, "comment_history");
    const comments60d = getVal(60, "comment_history");
    const comments365d = getVal(365, "comment_history");
    const shares7d = getVal(7, "share_history");
    const shares28d = getVal(28, "share_history");
    const shares60d = getVal(60, "share_history");
    const shares365d = getVal(365, "share_history");
    const profileViews7d = getVal(7, "pv_history");
    const profileViews28d = getVal(28, "pv_history");
    const profileViews60d = getVal(60, "pv_history");
    const profileViews365d = getVal(365, "pv_history");

    // ---- Per-post rewards (match scrapePageMetrics mapInternalVideoItem + id_programId dedupe) ----
    const postRewardsMapped = (Array.isArray(postRewardsRaw) ? postRewardsRaw : []).map((item) => {
      const money = item.est_rewards || item.estimated_income || item.income || {};
      const amt = parseMoney(money);
      const cur = money.currency?.symbol || money.currency?.code || currency;
      const queriedProgId = item._queried_program_id ? Number(item._queried_program_id) : null;
      const rawPrograms = Array.isArray(item.video_analytics_programs) ? item.video_analytics_programs : [];
      const programDetails = rawPrograms.map((p) => {
        const progId = Number(p.m10n_program ?? p.program_id ?? p.id);
        const progName = (p.program_name && String(p.program_name).trim())
          ? String(p.program_name).trim()
          : (PROGRAM_ID_MAP[progId] || (progId ? `Program ${progId}` : "Chương trình Creator Rewards"));
        return { id: progId, name: progName, isPunished: !!p.is_punished };
      });
      let primaryProgramName = queriedProgId
        ? (PROGRAM_ID_MAP[queriedProgId] || `Program ${queriedProgId}`)
        : null;
      if (!primaryProgramName) {
        primaryProgramName = programDetails[0]?.name || item.m10n_program_name || "Chương trình Creator Rewards";
      }
      const publishTimeUnix = item.publish_date_unix_time
        ? Number(item.publish_date_unix_time)
        : (item.create_time ? Number(item.create_time) : null);
      let postDateStr = null;
      if (publishTimeUnix) {
        const d = new Date((publishTimeUnix > 1e11 ? publishTimeUnix : publishTimeUnix * 1000));
        if (!isNaN(d.getTime())) postDateStr = d.toISOString().split("T")[0];
      }
      const viewsCount = Number(item.views) || Number(item.total_views) || Number(item.play_count) || Number(item.quvv) || 0;
      let rpmStr = null;
      if (item.rpm_metadata?.rpm_integer) {
        rpmStr = `${cur}${(Number(item.rpm_metadata.rpm_integer) / 100).toFixed(2)}`;
      } else if (amt > 0 && viewsCount > 0) {
        rpmStr = `${cur}${((amt / viewsCount) * 1000).toFixed(2)}`;
      }
      const id = safeId(item.video_id_str, item.item_id, item.aweme_id, item.video_id, item.id);
      return {
        id,
        videoId: id,
        title: item.video_name || item.desc || item.title || "Video TikTok",
        coverUrl: item.video_thumbnail || (Array.isArray(item.cover_url) ? item.cover_url[0] : item.cover_url) || null,
        duration: formatDuration(item.video_duration || item.duration),
        postDate: postDateStr,
        publishDate: postDateStr,
        publishTimeUnix: publishTimeUnix && publishTimeUnix > 1e11 ? Math.floor(publishTimeUnix / 1000) : publishTimeUnix,
        programId: queriedProgId || programDetails[0]?.id || 9,
        programName: primaryProgramName,
        isPunished: programDetails.some((p) => p.isPunished) || !!item.is_punished,
        reward: Number(amt.toFixed(2)),
        rewards: Number(amt.toFixed(2)),
        currency: cur,
        views: viewsCount,
        rpm: rpmStr,
      };
    }).filter((p) => !!p.id);
    const postRewards = [];
    {
      const seenKeys = new Set();
      for (const item of postRewardsMapped) {
        const key = `${item.id || item.videoId}_${item.programId || item.programName || "9"}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        postRewards.push(item);
      }
    }

    // ---- videosList from Studio content item_list ----
    const cleanNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const normalizePostTimestamp = (rawTime) => {
      if (!rawTime) return null;
      const n = Number(rawTime);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n > 1e11 ? n : n * 1000;
    };

    let videosList = (Array.isArray(videosRaw) ? videosRaw : []).map((p) => {
      const postTimestamp = normalizePostTimestamp(
        p.post_time || p.create_time || p.publish_date_unix_time || p.createTime
      );
      return {
        id: safeId(p.video_id_str, p.item_id, p.id, p.aweme_id, p.video_id),
        title: p.desc || p.title || p.video_name || "No title",
        views: cleanNum(p.play_count || p.playCount || p.views || p.statistics?.play_count || p.statistics?.playCount || p.stats?.playCount || p.stats?.play_count),
        likes: cleanNum(p.like_count || p.likeCount || p.digg_count || p.diggCount || p.statistics?.digg_count || p.statistics?.diggCount || p.stats?.diggCount || p.stats?.digg_count),
        comments: cleanNum(p.comment_count || p.commentCount || p.statistics?.comment_count || p.statistics?.commentCount || p.stats?.commentCount || p.stats?.comment_count),
        shares: cleanNum(p.share_count || p.shareCount || p.statistics?.share_count || p.statistics?.shareCount || p.stats?.shareCount || p.stats?.share_count),
        duration: formatDuration(p.video_duration || p.duration),
        postTime: postTimestamp ? new Date(postTimestamp).toISOString() : null,
        postDate: postTimestamp
          ? new Date(postTimestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "",
        coverUrl: Array.isArray(p.cover_url) ? p.cover_url[0]
          : (typeof p.cover_url === "string" ? p.cover_url
            : (p.video_thumbnail || p.cover?.url_list?.[0] || p.video?.cover?.url_list?.[0] || null)),
      };
    }).filter((v) => !!v.id || v.title !== "No title");

    // Soft-merge only: decorate item_list rows with monetization metadata.
    // Do NOT copy reward period-views into lifetime engagement, and do NOT
    // append reward-only stubs (that mixes windows and breaks tier parity).
    if (postRewards.length > 0) {
      const rewardMap = new Map();
      for (const pr of postRewards) {
        for (const raw of [pr.id, pr.videoId]) {
          const k = safeId(raw);
          if (k) rewardMap.set(k, pr);
        }
      }
      for (const v of videosList) {
        const match = rewardMap.get(String(v.id));
        if (!match) continue;
        v.programName = match.programName || v.programName;
        v.programs = match.programs || v.programs;
        v.reward = match.reward ?? v.reward;
        v.rewards = match.rewards ?? v.rewards;
        v.isPunished = match.isPunished ?? v.isPunished;
        v.rpm = match.rpm || v.rpm;
        if (match.duration && !v.duration) v.duration = match.duration;
        if (match.coverUrl && !v.coverUrl) v.coverUrl = match.coverUrl;
        if (match.title && (!v.title || v.title === "No title" || v.title === "Video TikTok")) {
          v.title = match.title;
        }
        // Intentionally skip match.views / likes — m10n period stats ≠ lifetime play_count.
      }
    }

    const listViewsSum = videosList.reduce((s, v) => s + (Number(v.views) || 0), 0);
    const videoCount = Math.max(
      Number(studioTotalVideos) || 0,
      Number(publicStats?.videoCount) || 0,
      videosList.length
    );

    // Classify Insights like agent scrapePageMetrics (independent video corroboration).
    let insightsStatus = "unavailable"; // ok | no_data | unavailable
    let insightsFailReason = undefined;
    if (historiesHealthy) {
      const allZero = [
        views7d, views28d, views60d, views365d,
        likes7d, likes28d, likes60d, likes365d,
        comments7d, comments28d, comments60d, comments365d,
        shares7d, shares28d, shares60d, shares365d,
        profileViews7d, profileViews28d, profileViews60d, profileViews365d,
      ].every((v) => v === 0);
      const publicVideos = publicStats ? Number(publicStats.videoCount || 0) : null;
      const videoSignal = Math.max(
        publicVideos || 0,
        Number(studioTotalVideos) || 0,
        videosList.length
      );
      if (!allZero) {
        insightsStatus = "ok";
      } else if (videoSignal > 0) {
        if (listViewsSum > 0 && views365d === 0) {
          insightsStatus = "unavailable";
          insightsFailReason = "empty_response";
        } else {
          insightsStatus = "ok"; // genuine real zeros
        }
      } else if (
        publicVideos === 0 &&
        (Number(studioTotalVideos) || 0) === 0 &&
        videosList.length === 0
      ) {
        insightsStatus = "no_data";
      } else {
        insightsStatus = "unavailable";
        insightsFailReason = "unknown";
      }
    }

    const insightsOk = insightsStatus === "ok";
    const totalViews = insightsOk ? Math.max(listViewsSum, views365d, 0) : undefined;
    const totalLikes = insightsOk ? Math.max(likes365d, 0) : undefined;

    // Studio vv_history is oldest→newest; omit trailing status:2 (unfinalized).
    const buildDailyViewsBreakdown = (vvHistory, endDays = 1) => {
      if (!Array.isArray(vvHistory) || vvHistory.length === 0) return [];
      const trim = countTrailingInsightUnavailable(vvHistory);
      const arr = trim > 0 ? vvHistory.slice(0, vvHistory.length - trim) : vvHistory;
      if (arr.length === 0) return [];
      const end = new Date();
      end.setUTCHours(0, 0, 0, 0);
      end.setUTCDate(end.getUTCDate() - Math.max(0, Number(endDays) || 0) - trim);
      const n = arr.length;
      const out = [];
      for (let i = 0; i < n; i++) {
        const d = new Date(end);
        d.setUTCDate(end.getUTCDate() - (n - 1 - i));
        out.push({
          date: d.toISOString().split("T")[0],
          views: Number(arr[i]?.value || 0) || 0,
        });
      }
      return out;
    };
    const dailyViewsBreakdown = insightsOk
      ? buildDailyViewsBreakdown(insights?.["365"]?.vv_history, 1)
      : [];

    // Account RPM only when Insights are authoritative.
    let rpm = null;
    if (insightsOk) {
      if (revenue28d > 0 && views28d > 0) {
        rpm = Number(((revenue28d / views28d) * 1000).toFixed(3));
      } else if (revenue60d > 0 && views60d > 0) {
        rpm = Number(((revenue60d / views60d) * 1000).toFixed(3));
      } else if (revenue7d > 0 && views7d > 0) {
        rpm = Number(((revenue7d / views7d) * 1000).toFixed(3));
      }
    }

    const resolvedCountry =
      country ||
      detectCountryIsoFromCurrency(currency) ||
      null;

    if (!username && !followerCount && !totalRevenue && videosList.length === 0) {
      return { success: false, error: "extension_sweep_empty_data" };
    }

    const insightFields = insightsOk
      ? {
          totalViews,
          totalLikes,
          rpm,
          sumViews: { views7d, views28d, views60d, views365d, totalViews },
          sumLikes: { likes7d, likes28d, likes60d, likes365d, totalLikes },
          sumComments: { comments7d, comments28d, comments60d, comments365d },
          sumShares: { shares7d, shares28d, shares60d, shares365d },
          sumProfileViews: {
            profileViews7d,
            profileViews28d,
            profileViews60d,
            profileViews365d,
          },
          dailyViewsBreakdown,
        }
      : {};

    return {
      success: true,
      data: {
        username,
        nickname,
        followersCount: followerCount,
        videoCount,
        totalVideos: videoCount,
        totalRevenue,
        currency,
        country: resolvedCountry,
        videosList,
        postRewards,
        creatorRewardsMissing: !(
          m10nRes?.data ||
          m10nRes?.seven_d_income != null ||
          m10nRes?.thirty_d_income != null ||
          m10nRes?.status_code === 0
        ),
        bannedReason: null,
        sumRevenue: { revenue7d, revenue28d, revenue60d, revenue365d: 0, totalRevenue: totalRevenue || 0 },
        dailyRevenueBreakdown: dailyBreakdown,
        activePrograms,
        ...insightFields,
        insightsStatus,
        insightsUnavailable: insightsStatus === "unavailable",
        insightsNoData: insightsStatus === "no_data",
        insightsFailReason,
        flagsVersion: 1,
        isLoggedIn: true,
        gpmProfileId: profileId,
        extractionMethod: "extension",
      },
    };
  } catch (err) {
    return { success: false, error: `assemblePayload: ${err.message}` };
  }
}

async function pushCookiesToAgent(profileId) {
  if (!profileId) return;
  try {
    const byName = new Map();
    for (const query of [
      { domain: ".tiktok.com" },
      { url: "https://www.tiktok.com" },
      { url: "https://tiktok.com" },
    ]) {
      const batch = await chrome.cookies.getAll(query).catch(() => []);
      for (const c of batch || []) {
        if (!c?.name || typeof c.value !== "string") continue;
        byName.set(`${c.name}|${c.domain || ""}|${c.path || "/"}`, c);
      }
    }
    const liveCookies = [...byName.values()].map((c) => {
      // Omitting `expires` for session cookies lets the agent apply its default.
      const payload = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite:
          c.sameSite === "no_restriction"
            ? "None"
            : c.sameSite === "lax"
              ? "Lax"
              : c.sameSite === "strict"
                ? "Strict"
                : "None",
      };
      if (c.expirationDate) {
        payload.expires = Math.round(c.expirationDate);
      }
      return payload;
    });
    if (!liveCookies.length) return;
    await fetch(`http://127.0.0.1:${AGENT_LOCK_PORT}/sync-cookies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, cookies: liveCookies }),
    }).catch(() => { });
  } catch {
    /* non-blocking */
  }
}

/** Probe local GPMLogin API ports; cache the first that returns a real profile list. */
async function discoverGpmApiBase(force = false) {
  const stored = await chrome.storage.local.get(["gpmApiBase", "gpmApiPort", "gpmApiDiscoveredAt"]);
  const fresh =
    !force &&
    stored.gpmApiBase &&
    stored.gpmApiDiscoveredAt &&
    Date.now() - stored.gpmApiDiscoveredAt < 10 * 60 * 1000;

  async function probeValidBase(base) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.GPM_PROBE_MS);
    try {
      const resp = await fetch(`${base}/profiles?page=1&per_page=1&page_size=1`, {
        signal: controller.signal,
      });
      if (!resp || !resp.ok) return false;
      const json = await resp.json().catch(() => null);
      const data = json?.data;
      const rows = Array.isArray(data)
        ? data
        : data && typeof data === "object" && Array.isArray(data.data)
          ? data.data
          : null;
      // Reject v3 health-string bodies like "GPMLogin Global API"
      if (rows === null) return false;
      if (rows.length && !rows[0]?.id) return false;
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Fast-path: probe cached base first if fresh
  if (fresh && stored.gpmApiBase) {
    if (await probeValidBase(stored.gpmApiBase)) {
      const portMatch = stored.gpmApiBase.match(/:(\d+)\//);
      return { online: true, base: stored.gpmApiBase, port: portMatch ? Number(portMatch[1]) : null };
    }
  }

  // Parallel race: probe all candidates simultaneously (first success wins)
  const candidateBases = [];
  if (stored.gpmApiBase) candidateBases.push(stored.gpmApiBase);
  for (const port of GPM_PORT_CANDIDATES) {
    candidateBases.push(`http://127.0.0.1:${port}/api/v1`);
    candidateBases.push(`http://127.0.0.1:${port}/api/v3`);
  }
  const uniqueCandidates = [...new Set(candidateBases)];

  try {
    const winner = await Promise.any(
      uniqueCandidates.map(async (base) => {
        const ok = await probeValidBase(base);
        if (ok) return base;
        throw new Error("unreachable");
      })
    );

    const portMatch = winner.match(/:(\d+)\//);
    const port = portMatch ? Number(portMatch[1]) : null;
    await chrome.storage.local.set({
      gpmApiBase: winner,
      gpmApiPort: port,
      gpmApiDiscoveredAt: Date.now(),
      gpmApiOnline: true,
    });
    return { online: true, base: winner, port };
  } catch {
    // All candidates failed or GPM is offline
  }

  await chrome.storage.local.set({
    gpmApiOnline: false,
    gpmApiDiscoveredAt: Date.now(),
  });
  return {
    online: false,
    base: stored.gpmApiBase || "http://127.0.0.1:9495/api/v1",
    port: stored.gpmApiPort || 9495,
  };
}

/** Single source of truth for auth / revoke user-facing messages. */
function resolveAuthErrorMessage(serverError, httpStatus) {
  const fromServer = typeof serverError === "string" ? serverError.trim() : "";
  if (fromServer) return fromServer;
  if (httpStatus === 403) {
    return "Quyền Extension đã bị vô hiệu hóa bởi Quản trị viên.";
  }
  if (httpStatus === 401) {
    return "Personal Token không hợp lệ hoặc đã bị thu hồi.";
  }
  if (httpStatus) {
    return `Máy chủ trả lỗi HTTP ${httpStatus}`;
  }
  return "Personal Token không hợp lệ hoặc đã bị thu hồi.";
}

/**
 * Mark local token as revoked: set UI flags, badge AUTH.
 * Does NOT wipe personalToken on transient session/DB errors — only when the
 * server clearly rejects the personal token itself.
 */
async function markTokenRevoked(reason, httpStatus) {
  const message = resolveAuthErrorMessage(reason, httpStatus);

  const reasonStr = String(reason || "").toLowerCase();
  const wipePersonal =
    httpStatus === 401 &&
    (reasonStr.includes("personal token") ||
      reasonStr.includes("personaltoken") ||
      reasonStr.includes("token đã bị thu hồi") ||
      reasonStr.includes("token da bi thu hoi") ||
      reasonStr.includes("token không tồn tại"));

  const updates = {
    accessToken: "",
    accessExpiresAt: 0,
    refreshToken: "",
    tokenRevokedReason: message,
    tokenRevokedAt: new Date().toISOString(),
    authRequired: true,
  };
  if (wipePersonal) {
    updates.personalToken = "";
    updates.pairingCode = "";
    updates.tokenRevoked = true;
  } else {
    updates.tokenRevoked = false;
  }

  await chrome.storage.local.set(updates);
  if (chrome.storage.session) {
    await chrome.storage.session.remove(["accessToken", "accessExpiresAt"]);
  }
  setBadge(wipePersonal ? "AUTH" : "…", wipePersonal ? "#ef4444" : "#f59e0b");
  console.warn("[TikTokFlow] Auth issue:", message, { wipePersonal });
  return { authRequired: true, error: message, httpStatus: httpStatus || 401 };
}

async function clearTokenRevokedState(extra = {}) {
  await chrome.storage.local.set({
    tokenRevoked: false,
    tokenRevokedReason: "",
    tokenRevokedAt: null,
    authRequired: false,
    ...extra,
  });
}

// 1. Initialize from bundled config.json (Zero-Typing Onboarding)
async function initFromConfigFile() {
  try {
    const existing = await chrome.storage.local.get([
      "tokenRevoked",
      "personalToken",
      "pairingCode",
    ]);

    const url = chrome.runtime.getURL("config.json");
    const resp = await fetch(url);
    if (!resp.ok) return;

    const fileConfig = await resp.json();
    const updates = {};
    if (fileConfig.serverUrl) updates.serverUrl = fileConfig.serverUrl;
    if (fileConfig.memberName) updates.memberName = fileConfig.memberName;
    if (fileConfig.userEmail) updates.userEmail = fileConfig.userEmail;
    // Feature flags from config.json — allow true/false overrides
    if (typeof fileConfig.autoOpenStudioTab === "boolean") {
      updates.autoOpenStudioTab = fileConfig.autoOpenStudioTab;
    }

    const freshPairing =
      typeof fileConfig.pairingCode === "string" &&
      fileConfig.pairingCode.startsWith("ttf_pair_");

    // New zip with pairing: clear stuck revoke banner from older false 403s and re-pair.
    // Do not re-inject a dead personalToken from legacy zips while revoked.
    if (freshPairing && (existing.tokenRevoked || !existing.personalToken)) {
      updates.pairingCode = fileConfig.pairingCode;
      updates.tokenRevoked = false;
      updates.tokenRevokedReason = "";
      updates.tokenRevokedAt = null;
      updates.authRequired = false;
      if (existing.tokenRevoked) {
        updates.personalToken = "";
        updates.accessToken = "";
        updates.accessExpiresAt = 0;
        updates.refreshToken = "";
      }
      console.log("[TikTokFlow] Fresh pairing from zip — clearing stuck re-auth state.");
    } else if (existing.tokenRevoked) {
      console.log("[TikTokFlow] Skipping secret load from config.json — re-auth required.");
      setBadge("AUTH", "#ef4444");
      // Still allow serverUrl / memberName refresh from zip
      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
      }
      return;
    } else {
      if (fileConfig.personalToken && !existing.personalToken) {
        updates.personalToken = fileConfig.personalToken;
      }
      if (freshPairing && !existing.personalToken && !existing.pairingCode) {
        updates.pairingCode = fileConfig.pairingCode;
      }
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
      console.log("[TikTokFlow] Machine-wide config loaded:", updates.memberName || "ok");
    }
  } catch (err) {
    console.warn("[TikTokFlow] Could not read config.json:", err);
  }
}

/** Redeem pairing code once → store personalToken + session; clear pairingCode. */
let _pairingRedeemInFlight = null;
async function redeemPairingIfNeeded() {
  if (_pairingRedeemInFlight) return _pairingRedeemInFlight;
  _pairingRedeemInFlight = (async () => {
    const data = await chrome.storage.local.get([
      "serverUrl",
      "pairingCode",
      "personalToken",
      "tokenRevoked",
    ]);
    if (data.tokenRevoked || data.personalToken || !data.pairingCode) return;

    const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, "");
    const codeBeingRedeemed = data.pairingCode;
    try {
      let attest;
      try {
        attest = await pollAgentAttest(serverUrl);
      } catch (err) {
        console.warn("[TikTokFlow] Agent attest unavailable for pair:", err?.message || err);
        await chrome.storage.local.set({
          tokenRevoked: true,
          tokenRevokedReason:
            "Client Agent chưa chạy hoặc chưa chứng thực thiết bị. Chạy setup-agent.bat (phím 1) rồi thử lại.",
          tokenRevokedAt: new Date().toISOString(),
          authRequired: true,
        });
        setBadge("AGENT", "#ef4444");
        return;
      }

      const resp = await fetch(`${serverUrl}/api/extension/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode: codeBeingRedeemed, ...attest }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.personalToken) {
        // Another concurrent path may have already redeemed successfully
        const again = await chrome.storage.local.get(["personalToken", "pairingCode"]);
        if (again.personalToken) {
          console.log("[TikTokFlow] Pairing already redeemed by parallel path — ignoring failure.");
          if (again.pairingCode === codeBeingRedeemed) {
            await chrome.storage.local.set({ pairingCode: "" });
          }
          return;
        }
        console.warn("[TikTokFlow] Pairing redeem failed:", json.error || resp.status);
        // Prefer machine Agent token over dead pairing codes (any profile, any time).
        const fromAgent = await bootstrapAuthFromAgent();
        if (fromAgent.ok) return;

        await chrome.storage.local.set({
          tokenRevoked: true,
          tokenRevokedReason:
            json.error ||
            "Mã kích hoạt hết hạn hoặc đã dùng. Cài Client Agent + Personal Token (setup phím 3), hoặc dán Token trong popup.",
          tokenRevokedAt: new Date().toISOString(),
          authRequired: true,
        });
        setBadge("AUTH", "#ef4444");
        return;
      }

      const expiresIn = Number(json.expiresIn) || 900;
      const updates = {
        personalToken: json.personalToken,
        refreshToken: json.refreshToken || "",
        pairingCode: "",
        serverUrl: json.serverUrl || serverUrl,
        tokenRevoked: false,
        tokenRevokedReason: "",
        authRequired: false,
      };
      if (json.user?.email) updates.userEmail = json.user.email;
      if (json.user?.name || json.user?.username) {
        updates.memberName = json.user.name || json.user.username;
      }
      await chrome.storage.local.set(updates);
      if (json.accessToken) {
        await setAccessSession(json.accessToken, Date.now() + expiresIn * 1000 - 30_000);
      }
      console.log("[TikTokFlow] Pairing redeemed successfully.");
    } catch (err) {
      console.warn("[TikTokFlow] Pairing redeem error:", err.message);
    }
  })();
  try {
    await _pairingRedeemInFlight;
  } finally {
    _pairingRedeemInFlight = null;
  }
}

/**
 * Pull Personal Token from Client Agent (machine-wide). Any GPM profile can auth
 * without redeeming a pairing code — Agent must already be installed with a token.
 */
let _agentBootstrapInFlight = null;
async function bootstrapAuthFromAgent() {
  if (_agentBootstrapInFlight) return _agentBootstrapInFlight;
  _agentBootstrapInFlight = (async () => {
    const existing = await chrome.storage.local.get([
      "personalToken",
      "tokenRevoked",
      "serverUrl",
    ]);
    if (existing.personalToken && !existing.tokenRevoked) {
      return { ok: true, source: "storage" };
    }

    try {
      const resp = await fetch(`http://127.0.0.1:${AGENT_LOCK_PORT}/bootstrap-extension`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (resp.status === 404) {
        return { ok: false, reason: "agent_unsupported" };
      }
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok || !json.personalToken) {
        return {
          ok: false,
          reason: json.reason || "agent_no_token",
          error: json.error || null,
        };
      }

      const serverUrl = (json.serverUrl || existing.serverUrl || DEFAULT_SERVER_URL).replace(
        /\/$/,
        ""
      );
      const updates = {
        personalToken: json.personalToken,
        serverUrl,
        pairingCode: "",
        tokenRevoked: false,
        tokenRevokedReason: "",
        authRequired: false,
      };
      if (json.memberEmail) updates.userEmail = json.memberEmail;
      if (json.memberName) updates.memberName = json.memberName;
      await chrome.storage.local.set(updates);

      // Do not exchange JWT here — hundreds of profiles exchanging at once
      // stampede /api/extension/session and trip refresh-reuse killAll.

      console.log("[TikTokFlow] Auth bootstrapped from Client Agent (machine token).");
      setBadge("", "#6b7280");
      return { ok: true, source: "agent" };
    } catch (err) {
      return { ok: false, reason: "agent_unreachable", error: err?.message || String(err) };
    }
  })();
  try {
    return await _agentBootstrapInFlight;
  } finally {
    _agentBootstrapInFlight = null;
  }
}

/** Ensure this profile has credentials: storage → Agent → pairing code. */
async function ensureExtensionAuth(knownData) {
  const data = knownData || (await chrome.storage.local.get(["personalToken", "tokenRevoked"]));
  if (data.personalToken && !data.tokenRevoked) return { ok: true, data };

  const fromAgent = await bootstrapAuthFromAgent();
  if (fromAgent.ok) {
    const refreshed = await chrome.storage.local.get([
      "personalToken",
      "tokenRevoked",
      "serverUrl",
      "refreshToken",
      "userEmail",
      "memberName",
    ]);
    return { ok: true, source: "agent", data: refreshed };
  }

  await redeemPairingIfNeeded();
  const again = await chrome.storage.local.get([
    "personalToken",
    "tokenRevoked",
    "serverUrl",
    "refreshToken",
    "userEmail",
    "memberName",
  ]);
  if (again.personalToken && !again.tokenRevoked) return { ok: true, source: "pair", data: again };
  return { ok: false, reason: fromAgent.reason || "no_auth" };
}

/** Ensure a usable bearer. Prefer personalToken — JWT session exchange stampede
 * across hundreds of GPM profiles causes refresh-reuse killAll + Prisma P2028. */
async function ensureAccessToken() {
  const data = await chrome.storage.local.get([
    "serverUrl",
    "personalToken",
    "refreshToken",
    "tokenRevoked",
  ]);
  const auth = await ensureExtensionAuth(data);
  const effectiveData = auth.data || data;
  const access = await getAccessSession();

  if (effectiveData.tokenRevoked || !effectiveData.personalToken) {
    return { ok: false, bearer: null, authRequired: true };
  }

  // Cached JWT still valid — use it (no network).
  if (access.accessToken && access.accessExpiresAt && Date.now() < access.accessExpiresAt) {
    return { ok: true, bearer: access.accessToken };
  }

  // Fleet-safe path: personalToken is accepted by report/sync APIs directly.
  return { ok: true, bearer: effectiveData.personalToken, legacy: true };
}

async function authorizedFetch(url, options = {}, retried = false) {
  const auth = await ensureAccessToken();
  if (!auth.ok || !auth.bearer) {
    return { resp: null, authRequired: true, error: "Cần xác thực lại Personal Token." };
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${auth.bearer}`,
  };
  const resp = await fetch(url, { ...options, headers });

  // FIX: retry only on 401 (expired session). 403 is a permission decision
  // that a token refresh cannot change — retrying is a wasted round-trip.
  if (resp.status === 401 && !retried) {
    await setAccessSession("", 0);
    return authorizedFetch(url, options, true);
  }

  return { resp };
}

// 2. Storage Helpers
async function getConfig() {
  const data = await chrome.storage.local.get([
    "serverUrl",
    "personalToken",
    "memberName",
    "userEmail",
    "lastFleetSyncTime",
    "latestAccount",
    "gpmProfileCount",
  ]);
  return {
    serverUrl: (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, ""),
    personalToken: data.personalToken || "",
    memberName: data.memberName || "",
    userEmail: data.userEmail || "",
    lastFleetSyncTime: data.lastFleetSyncTime || 0,
    latestAccount: data.latestAccount || null,
    gpmProfileCount: data.gpmProfileCount || 0,
  };
}

// 3. Badge Management
function setBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text });
    if (color) {
      chrome.action.setBadgeBackgroundColor({ color });
    }
  } catch (err) { }
}

// 4. Report Active TikTok Status to TikTokFlow Server
function extractHandleFromLabel(...parts) {
  const combined = parts.filter(Boolean).join(" ");
  if (!combined.trim()) return null;
  const atMatch = combined.match(/@([a-zA-Z0-9._]{2,30})/);
  if (atMatch) return atMatch[1].toLowerCase();
  const bare = combined.trim().replace(/^@/, "");
  if (/^[a-zA-Z0-9._]{2,30}$/.test(bare) && !/\s/.test(bare)) return bare.toLowerCase();
  return null;
}

async function fetchLocalGpmProfiles() {
  let discovered = await discoverGpmApiBase(false);
  if (!discovered.online) {
    discovered = await discoverGpmApiBase(true);
    if (!discovered.online) return [];
  }

  let base = discovered.base;
  if (!base) return [];

  async function fetchGpmProfiles(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.GPM_FETCH_PROFILES_MS);
    try {
      return await fetch(url, { signal: controller.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function extractRows(json) {
    if (!json) return [];
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.data?.data)) return json.data.data;
    if (Array.isArray(json)) return json;
    return [];
  }

  // Probe base first to ensure version compatibility
  let testResp = await fetchGpmProfiles(`${base}/profiles?page=1&per_page=100&page_size=100`);
  if (!testResp || !testResp.ok) {
    const alt = base.includes("/api/v1")
      ? base.replace("/api/v1", "/api/v3")
      : base.replace("/api/v3", "/api/v1");
    testResp = await fetchGpmProfiles(`${alt}/profiles?page=1&per_page=100&page_size=100`);
    if (testResp && testResp.ok) {
      base = alt;
      await chrome.storage.local.set({ gpmApiBase: alt, gpmApiDiscoveredAt: Date.now() });
    } else {
      return [];
    }
  }

  const allProfiles = [];
  const seenIds = new Set();
  const firstJson = await testResp.json().catch(() => null);
  const firstRows = extractRows(firstJson);
  for (const r of firstRows) {
    const id = String(r?.id || "");
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      allProfiles.push(r);
    }
  }

  // If first page returned fewer than 100, we got all profiles
  if (firstRows.length < 100) {
    return allProfiles;
  }

  // Paginate remaining pages up to 50 pages (5,000 profiles)
  let page = 2;
  const maxPages = 50;
  while (page <= maxPages) {
    const resp = await fetchGpmProfiles(`${base}/profiles?page=${page}&per_page=100&page_size=100`);
    if (!resp || !resp.ok) break;
    const json = await resp.json().catch(() => null);
    const rows = extractRows(json);
    if (!rows.length) break;
    let newCount = 0;
    for (const r of rows) {
      const id = String(r?.id || "");
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        allProfiles.push(r);
        newCount++;
      }
    }
    if (newCount === 0 || rows.length < 100) break;
    page++;
  }

  return allProfiles;
}

async function fetchLocalGpmGroups(base) {
  const cached = await chrome.storage.local.get(["gpmGroupsMap", "gpmGroupsMapAt"]);
  const map = new Map();
  if (cached.gpmGroupsMap && typeof cached.gpmGroupsMap === "object") {
    for (const [k, v] of Object.entries(cached.gpmGroupsMap)) {
      map.set(String(k), String(v));
    }
  }
  if (!base) {
    return map;
  }
  if (cached.gpmGroupsMapAt && Date.now() - cached.gpmGroupsMapAt < 60_000 && map.size > 0) {
    return map;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.GPM_FETCH_GROUPS_MS);
    const resp = await fetch(`${base}/groups?page=1&per_page=200&page_size=200`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (resp && resp.ok) {
      const json = await resp.json().catch(() => ({}));
      const rows = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.data)
          ? json.data.data
          : [];
      const newEntries = {};
      for (const g of rows) {
        if (g?.id != null && g?.name) {
          const gid = String(g.id);
          const gname = String(g.name);
          map.set(gid, gname);
          newEntries[gid] = gname;
        }
      }
      if (Object.keys(newEntries).length > 0) {
        await chrome.storage.local.set({
          gpmGroupsMap: { ...(cached.gpmGroupsMap || {}), ...newEntries },
          gpmGroupsMapAt: Date.now(),
        });
      }
    }
  } catch (err) {
    // GPM app likely closed
  }
  return map;
}

function resolveGroupNameFromMap(map, groupId, rawGroupName) {
  const explicit = String(rawGroupName || "").trim();
  if (explicit && !UUID_RE.test(explicit)) return explicit;
  const gid = String(groupId || "").trim();
  if (!gid) return null;
  if (map && map.has(gid)) return map.get(gid);
  // Do not treat a raw numeric id (e.g. "0" or "1") or UUID as a group name
  if (!UUID_RE.test(gid) && !DIGITS_RE.test(gid)) return gid;
  return null;
}

/**
 * Resolve GPM profile for a TikTok username:
 * 1) Agent session-bind (authoritative)
 * 2) Soft cache only if it carries resolveAttest from a prior session bind
 * 3) unique @handle match in GPM profile name/note (no sticky cache without attest)
 */
async function resolveGpmProfileForUsername(username) {
  const clean = String(username || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  if (!clean) return null;

  // Session-bind via Agent first — never trust sticky label/cache over live session.
  try {
    const sessionHit = await resolveBrowserViaAgent(clean);
    if (sessionHit.ok && sessionHit.id) {
      let resolvedGroup = sessionHit.groupName || null;
      if (!resolvedGroup) {
        // GPM Login app may be closed: check cached group name or gpmGroupsMap
        const storedGroup = await chrome.storage.local.get([
          "linkedGpmGroupName",
          "linkedGpmProfileId",
          "gpmGroupsMap",
        ]);
        if (
          storedGroup.linkedGpmProfileId === sessionHit.id &&
          storedGroup.linkedGpmGroupName
        ) {
          resolvedGroup = storedGroup.linkedGpmGroupName;
        } else if (sessionHit.groupId && storedGroup.gpmGroupsMap?.[sessionHit.groupId]) {
          resolvedGroup = storedGroup.gpmGroupsMap[sessionHit.groupId];
        }
      }

      // Always persist local link for Tier-0 — do NOT require groupName.
      // Previously we only wrote linkedGpmProfileId when resolvedGroup was set,
      // so brand-new GPM profiles (often no group) never linked and sweeps timed out.
      await chrome.storage.local.set({
        linkedGpmProfileId: sessionHit.id,
        linkedGpmProfileName: sessionHit.name || "",
        linkedGpmGroupName: resolvedGroup || "",
        linkedGpmUsername: clean,
        linkedGpmResolveAttest: sessionHit.resolveAttest || null,
      });
      console.log(
        `[TikTokFlow][LINK] session-bind saved id=${String(sessionHit.id).slice(0, 8)} ` +
        `@${clean} group="${resolvedGroup || ""}" attest=${!!sessionHit.resolveAttest}`
      );

      return {
        id: sessionHit.id,
        name: sessionHit.name,
        groupName: resolvedGroup || null,
        groupId: sessionHit.groupId || null,
        matchedVia: "session",
        resolveAttest: sessionHit.resolveAttest || null,
      };
    }
    if (sessionHit.reason === "no_match" || sessionHit.reason === "ambiguous") {
      console.warn(
        `[TikTokFlow][LINK] session-bind failed reason=${sessionHit.reason} @${clean}`
      );
      // Drop stale wrong cache for this username
      const cached = await chrome.storage.local.get([
        "linkedGpmProfileId",
        "linkedGpmUsername",
      ]);
      if (
        cached.linkedGpmUsername &&
        String(cached.linkedGpmUsername).toLowerCase() === clean
      ) {
        await chrome.storage.local.remove([
          "linkedGpmProfileId",
          "linkedGpmProfileName",
          "linkedGpmGroupName",
          "linkedGpmUsername",
          "linkedGpmResolveAttest",
        ]);
      }
    }
    if (sessionHit.reason === "agent_unsupported") {
      console.log("[TikTokFlow] Agent không hỗ trợ resolve-browser — fallback label.");
    }
  } catch (err) {
    console.warn("[TikTokFlow] session resolve failed:", err?.message || err);
  }

  const cached = await chrome.storage.local.get([
    "linkedGpmProfileId",
    "linkedGpmProfileName",
    "linkedGpmGroupName",
    "linkedGpmUsername",
    "linkedGpmResolveAttest",
  ]);

  if (
    cached.linkedGpmProfileId &&
    cached.linkedGpmUsername &&
    String(cached.linkedGpmUsername).toLowerCase() === clean &&
    cached.linkedGpmResolveAttest
  ) {
    const attestTs = Number(cached.linkedGpmResolveAttest?.ts);
    // Server rejects attest older than ±120s — never reuse a stale cache HMAC.
    const attestFresh =
      Number.isFinite(attestTs) && Math.abs(Date.now() - attestTs) <= 90_000;
    if (!attestFresh) {
      await chrome.storage.local.remove(["linkedGpmResolveAttest"]);
    } else {
      return {
        id: cached.linkedGpmProfileId,
        name: cached.linkedGpmProfileName || null,
        groupName: cached.linkedGpmGroupName || null,
        matchedVia: "cache",
        resolveAttest: cached.linkedGpmResolveAttest,
      };
    }
  }

  try {
    const rawProfiles = await fetchLocalGpmProfiles();
    const stored = await chrome.storage.local.get(["gpmApiBase"]);
    const groupsMap = await fetchLocalGpmGroups(stored.gpmApiBase || null);
    const hits = [];
    for (const p of rawProfiles) {
      if (!p?.id) continue;
      const labelHandle = extractHandleFromLabel(p.name, p.raw_name, p.note);
      if (labelHandle && labelHandle === clean) {
        const groupName = resolveGroupNameFromMap(groupsMap, p.group_id, p.group_name);
        hits.push({
          id: p.id,
          name: p.name || `Profile ${p.id}`,
          groupName: groupName || null,
          matchedVia: "label",
        });
      }
    }
    const unique = new Map();
    for (const hit of hits) unique.set(hit.id, hit);
    if (unique.size === 1) {
      return [...unique.values()][0];
    }
    if (unique.size > 1) {
      console.warn(`[TikTokFlow] Ambiguous label match for @${clean}: ${unique.size} hits`);
    }
  } catch (err) {
    console.warn("[TikTokFlow] GPM label match failed:", err?.message || err);
  }

  return null;
}

async function reportTikTokStatus(payload) {
  const usernameEarly = String(payload?.username || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  if (usernameEarly) {
    const existing = _identityReportInFlight.get(usernameEarly);
    if (existing) return existing;
  }

  const work = (async () => {
    try {
      if (usernameEarly && payload?.isLoggedIn !== false) {
        const last = await readIdentityThrottle(usernameEarly);
        const ttl =
          last && last.li === (payload?.isLoggedIn === true)
            ? IDENTITY_TTL_UNCHANGED_MS
            : IDENTITY_TTL_CHANGED_MS;
        if (last && Date.now() - last.at < ttl) return { ok: true, skipped: true };
      }

      const initialStore = await chrome.storage.local.get([
        "serverUrl",
        "personalToken",
        "refreshToken",
        "tokenRevoked",
        "userEmail",
        "memberName",
        "latestAccount",
        "linkedGpmProfileId",
        "linkedGpmProfileName",
        "linkedGpmGroupName",
        "linkedGpmUsername",
        "linkedGpmResolveAttest",
        "pendingGpmLinks",
      ]);

      const auth = await ensureExtensionAuth(initialStore);
      const store = auth?.data ? { ...initialStore, ...auth.data } : initialStore;
      const config = {
        serverUrl: (store.serverUrl || "").replace(/\/+$/, ""),
        personalToken: store.personalToken || "",
        userEmail: store.userEmail || "",
        memberName: store.memberName || "",
      };
      if (!config.serverUrl) return { ok: false, error: "no_server" };

      // Viewing someone else's public profile: still allow identity sync when we know
      // the logged-in username. Nickname/avatar must come from OUR hydrate, not their DOM
      // (content script clears isOtherProfilePage after building a safe identity payload).
      if (payload.isOtherProfilePage) {
        console.log(
          `[TikTokFlow] Skip unsafe other-profile payload — viewing @${payload.viewedProfile}`
        );
        await chrome.storage.local.set({
          reportSyncStatus: "idle",
          reportSyncMessage: `Đang xem trang công khai @${payload.viewedProfile} — danh tính tài khoản của bạn không đổi.`,
          lastPageContext: {
            type: "other_profile",
            viewedProfile: payload.viewedProfile,
            at: new Date().toISOString(),
          },
        });
        return { ok: false, error: "other_profile" };
      }

      const username = payload.username || "";

      if (!config.personalToken) {
        console.warn("[TikTokFlow] Skipping report — no personalToken configured");
        await chrome.storage.local.set({
          reportSyncStatus: "error",
          reportSyncMessage: "Chưa có Personal Token.",
        });
        return { ok: false, error: "no_token" };
      }

      const cleanUser = String(username || "")
        .replace(/^@/, "")
        .trim()
        .toLowerCase();

      const resolvedCountry = await resolveReportCountry(payload.country);

      async function postIdentity(gpmMatch) {
        const effectiveId =
          gpmMatch?.id || store.linkedGpmProfileId || undefined;
        const effectiveGroupName =
          gpmMatch?.groupName || store.linkedGpmGroupName || undefined;
        const effectiveProfileName =
          gpmMatch?.name || store.linkedGpmProfileName || undefined;

        const body = {
          username,
          nickname: payload.nickname || "",
          avatarUrl: payload.avatarUrl || "",
          isLoggedIn: payload.isLoggedIn === true,
          memberEmail: config.userEmail || undefined,
          gpmProfileId: effectiveId,
          gpmProfileName: effectiveProfileName,
          gpmGroupName: effectiveGroupName,
          source: "extension",
          metricsSource: "identity",
          country: resolvedCountry,
          resolveAttest: gpmMatch?.resolveAttest || undefined,
        };

        const { resp, authRequired, error } = await authorizedFetch(
          `${config.serverUrl}/api/extension/report`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            // Help MV3 keep the request alive if the SW is suspended mid-flight.
            keepalive: true,
          }
        );

        if (authRequired || !resp) {
          return { ok: false, authError: error || "Cần xác thực lại." };
        }
        if (resp.status === 429 || resp.status === 503) {
          const ms = parseRetryAfterMs(resp);
          _reportBackoffUntil = Math.max(_reportBackoffUntil, Date.now() + ms);
          return {
            ok: false,
            error: `Server busy (${resp.status})`,
            retryAfterMs: ms,
          };
        }
        if (resp.status === 401 || resp.status === 403) {
          const errData = await resp.json().catch(() => ({}));
          await markTokenRevoked(errData.error, resp.status);
          return { ok: false, authError: errData.error || "Token bị thu hồi." };
        }
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          return { ok: false, error: errData.error || `Lỗi HTTP ${resp.status}` };
        }

        const result = await resp.json().catch(() => ({}));
        const linkedId = result?.account?.gpmProfileId || body.gpmProfileId || null;
        return { ok: true, body, result, linkedId, gpmMatch };
      }

      await chrome.storage.local.set({
        reportSyncStatus: "syncing",
        reportSyncMessage: `Đang xác minh @${username}…`,
        reportSyncAt: Date.now(),
      });

      // Persist intent before network — MV3 SW death was aborting in-flight creates
      // (DB stayed empty while "post identity" logs still fired).
      await enqueuePendingIdentityReport({
        username,
        nickname: payload.nickname || "",
        avatarUrl: payload.avatarUrl || "",
        isLoggedIn: payload.isLoggedIn === true,
        country: resolvedCountry || undefined,
        cleanUser,
        enqueuedAt: Date.now(),
      });

      const backoffWait = _reportBackoffUntil - Date.now();
      if (backoffWait > 0) {
        scheduleIdentityRetryAlarm(backoffWait + Math.random() * 3000);
        return { ok: false, error: "backoff" };
      }
      if (!_staggered.has(cleanUser)) {
        _staggered.add(cleanUser);
        await sleep(hashDelayMs(cleanUser));
      }

      // Phase 1: record account in DB immediately — do not wait on GPM resolve.
      let outcome = await postIdentity(null);
      if (!outcome.ok) {
        // App server offline/auth failure must NOT block local GPM linking.
        // Tier-0 only needs linkedGpmProfileId from Client Agent /resolve-browser.
        // Previously we returned here → never resolved → extension_sweep_timeout on new profiles.
        console.warn(
          `[TikTokFlow][LINK] phase1 server report failed (${outcome.authError || outcome.error || "unknown"}) ` +
          `— still attempting local GPM resolve for @${cleanUser}`
        );
        try {
          const gpmMatch = await resolveGpmProfileForUsername(cleanUser || username);
          if (gpmMatch?.id) {
            await chrome.storage.local.set({
              linkedGpmProfileId: gpmMatch.id,
              linkedGpmProfileName: gpmMatch.name || "",
              linkedGpmGroupName: gpmMatch.groupName || "",
              linkedGpmUsername: cleanUser,
              linkedGpmResolveAttest: gpmMatch.resolveAttest || null,
              latestAccount: {
                ...(store.latestAccount || {}),
                username: username || cleanUser,
                nickname: payload.nickname || "",
                avatarUrl: payload.avatarUrl || "",
                isLoggedIn: payload.isLoggedIn === true,
                gpmProfileId: gpmMatch.id,
                lastReportedAt: new Date().toISOString(),
                metricsSource: "identity",
                source: "extension",
              },
            });
            void pushCookiesToAgent(gpmMatch.id);
            console.log(
              `[TikTokFlow][LINK] local-only save after server fail id=${String(gpmMatch.id).slice(0, 8)} @${cleanUser}`
            );
          } else {
            await enqueuePendingGpmLink({
              username,
              nickname: payload.nickname || "",
              avatarUrl: payload.avatarUrl || "",
              isLoggedIn: payload.isLoggedIn === true,
              country: resolvedCountry || undefined,
              cleanUser,
              enqueuedAt: Date.now(),
            });
            scheduleGpmLinkAlarm(2000);
            console.warn(`[TikTokFlow][LINK] local resolve miss @${cleanUser} — queued for retry`);
          }
        } catch (linkErr) {
          console.warn(`[TikTokFlow][LINK] local resolve error: ${linkErr?.message || linkErr}`);
          await enqueuePendingGpmLink({
            username,
            nickname: payload.nickname || "",
            avatarUrl: payload.avatarUrl || "",
            isLoggedIn: payload.isLoggedIn === true,
            country: resolvedCountry || undefined,
            cleanUser,
            enqueuedAt: Date.now(),
          });
          scheduleGpmLinkAlarm(3000);
        }
        scheduleIdentityRetryAlarm(outcome.retryAfterMs ?? 3000);
        await chrome.storage.local.set({
          reportSyncStatus: "error",
          reportSyncMessage: outcome.authError || outcome.error || "Lỗi đồng bộ",
        });
        return { ok: false, error: outcome.authError || outcome.error };
      }
      await dequeuePendingIdentityReport(cleanUser);

      if (outcome.body.isLoggedIn) {
        setBadge("OK", "#10b981");
      } else {
        setBadge("OFF", "#6b7280");
      }

      const prev = store.latestAccount || {};
      await chrome.storage.local.set({
        latestAccount: {
          ...prev,
          username: outcome.body.username || prev.username,
          nickname: outcome.body.nickname || prev.nickname || "",
          avatarUrl: outcome.body.avatarUrl || prev.avatarUrl || "",
          isLoggedIn: outcome.body.isLoggedIn,
          gpmProfileId: outcome.linkedId || prev.gpmProfileId || null,
          lastReportedAt: new Date().toISOString(),
          metricsSource: "identity",
          source: "extension",
        },
        reportSyncStatus: "ok",
        reportSyncMessage: `Đã xác minh · @${cleanUser}`,
        reportSyncAt: Date.now(),
      });

      const targetProfileId = outcome.linkedId || prev.gpmProfileId || null;
      if (targetProfileId) {
        void pushCookiesToAgent(targetProfileId);
      }

      // Phase 2 via alarm — MV3 kills SW after sendResponse; void async is unreliable.
      // Skip enqueue when this profile already has a fresh linked GPM (stops resolve/challenge storms).
      // But if the server row still has no GPM, force phase-2 (local cache can lie).
      const serverGpm =
        outcome.result?.account?.gpmProfileId ||
        outcome.linkedId ||
        null;
      const alreadyLinked =
        store.linkedGpmProfileId &&
        String(store.linkedGpmUsername || "").toLowerCase() === cleanUser &&
        Number.isFinite(Number(store.linkedGpmResolveAttest?.ts)) &&
        Math.abs(Date.now() - Number(store.linkedGpmResolveAttest.ts)) < 10 * 60_000 &&
        !!serverGpm;
      if (!alreadyLinked) {
        const pendingList = Array.isArray(store.pendingGpmLinks)
          ? store.pendingGpmLinks
          : [];
        const alreadyQueued = pendingList.some(
          (x) =>
            String(x.cleanUser || x.username || "")
              .replace(/^@/, "")
              .trim()
              .toLowerCase() === cleanUser
        );
        if (!alreadyQueued) {
          await enqueuePendingGpmLink({
            username,
            nickname: payload.nickname || "",
            avatarUrl: payload.avatarUrl || "",
            isLoggedIn: payload.isLoggedIn === true,
            country: resolvedCountry || undefined,
            cleanUser,
            enqueuedAt: Date.now(),
          });
        }
        scheduleGpmLinkAlarm(alreadyQueued ? 1500 : 500);
      }

      if (usernameEarly) {
        await writeIdentityThrottle(usernameEarly, payload?.isLoggedIn === true);
      }
      return { ok: true };
    } catch (err) {
      console.warn("[TikTokFlow] Failed to report account status:", err.message);
      scheduleIdentityRetryAlarm(5000);
      await chrome.storage.local.set({
        reportSyncStatus: "error",
        reportSyncMessage: err.message || "Lỗi đồng bộ",
      });
      return { ok: false, error: err?.message || "error" };
    }
  })();

  if (usernameEarly) {
    _identityReportInFlight.set(usernameEarly, work);
    work.finally(() => {
      if (_identityReportInFlight.get(usernameEarly) === work) {
        _identityReportInFlight.delete(usernameEarly);
      }
    });
  }
  return work;
}

async function enqueuePendingIdentityReport(item) {
  const store = await chrome.storage.local.get(["pendingIdentityReports"]);
  const list = Array.isArray(store.pendingIdentityReports)
    ? store.pendingIdentityReports
    : [];
  const clean = String(item.cleanUser || item.username || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  const next = list.filter(
    (x) =>
      String(x.cleanUser || x.username || "")
        .replace(/^@/, "")
        .trim()
        .toLowerCase() !== clean
  );
  next.push({ ...item, cleanUser: clean });
  await chrome.storage.local.set({ pendingIdentityReports: next.slice(-30) });
}

async function dequeuePendingIdentityReport(cleanUser) {
  const clean = String(cleanUser || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  const store = await chrome.storage.local.get(["pendingIdentityReports"]);
  const list = Array.isArray(store.pendingIdentityReports)
    ? store.pendingIdentityReports
    : [];
  await chrome.storage.local.set({
    pendingIdentityReports: list.filter(
      (x) =>
        String(x.cleanUser || x.username || "")
          .replace(/^@/, "")
          .trim()
          .toLowerCase() !== clean
    ),
  });
}

function scheduleIdentityRetryAlarm(delayMs = 5000) {
  try {
    chrome.alarms.create(IDENTITY_RETRY_ALARM, {
      when: Date.now() + Math.max(1000, delayMs),
    });
  } catch {
    /* ignore */
  }
}

async function processPendingIdentityReports() {
  const store = await chrome.storage.local.get(["pendingIdentityReports"]);
  const list = Array.isArray(store.pendingIdentityReports)
    ? store.pendingIdentityReports
    : [];
  if (!list.length) return { processed: 0 };
  const remaining = [];
  let processed = 0;
  for (const item of list) {
    if (!item?.username) continue;
    try {
      const result = await reportTikTokStatus({
        username: item.username,
        nickname: item.nickname || "",
        avatarUrl: item.avatarUrl || "",
        isLoggedIn: item.isLoggedIn === true,
        country: item.country || undefined,
      });
      if (result?.ok) processed++;
      else if (Date.now() - (item.enqueuedAt || 0) < 15 * 60_000) {
        remaining.push(item);
      }
    } catch {
      if (Date.now() - (item.enqueuedAt || 0) < 15 * 60_000) remaining.push(item);
    }
  }
  await chrome.storage.local.set({ pendingIdentityReports: remaining });
  if (remaining.length) scheduleIdentityRetryAlarm(15000);
  return { processed, remaining: remaining.length };
}

async function enqueuePendingGpmLink(item) {
  const store = await chrome.storage.local.get(["pendingGpmLinks"]);
  const list = Array.isArray(store.pendingGpmLinks) ? store.pendingGpmLinks : [];
  const clean = String(item.cleanUser || item.username || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  const next = list.filter(
    (x) =>
      String(x.cleanUser || x.username || "")
        .replace(/^@/, "")
        .trim()
        .toLowerCase() !== clean
  );
  next.push({ ...item, cleanUser: clean });
  // Cap queue so storage does not grow unbounded
  await chrome.storage.local.set({ pendingGpmLinks: next.slice(-20) });
}

let _gpmLinkInFlight = null;
let _gpmLinkAlarmSoonest = 0;

function scheduleGpmLinkAlarm(delayMs = 2000) {
  const when = Date.now() + Math.max(500, delayMs);
  // Coalesce — don't stack alarms every 250ms (was causing challenge/resolve storms).
  if (_gpmLinkAlarmSoonest && _gpmLinkAlarmSoonest <= when + 500) return;
  try {
    chrome.alarms.create(GPM_LINK_ALARM, { when });
    // FIX: only record the pending alarm after creation succeeds. Previously
    // a throw left the flag set with no actual alarm — the queue stalled until
    // SW restart.
    _gpmLinkAlarmSoonest = when;
  } catch (err) {
    console.warn("[TikTokFlow] scheduleGpmLinkAlarm failed:", err?.message || err);
    _gpmLinkAlarmSoonest = 0;
  }
}

async function processPendingGpmLinks() {
  if (_gpmLinkInFlight) return _gpmLinkInFlight;
  _gpmLinkInFlight = (async () => {
    _gpmLinkAlarmSoonest = 0;
    const store = await chrome.storage.local.get(["pendingGpmLinks"]);
    const list = Array.isArray(store.pendingGpmLinks) ? store.pendingGpmLinks : [];
    if (!list.length) return { processed: 0 };

    const remaining = [];
    let processed = 0;
    let hadFailure = false;
    for (const item of list) {
      const username = item.username;
      const cleanUser =
        item.cleanUser ||
        String(username || "")
          .replace(/^@/, "")
          .trim()
          .toLowerCase();
      if (!username) continue;
      try {
        const gpmMatch = await resolveGpmProfileForUsername(username);

        if (!gpmMatch?.id) {
          hadFailure = true;
          console.warn(
            `[TikTokFlow][LINK] queue no gpmMatch for @${cleanUser} attempts=${(item.attempts || 0) + 1}`
          );
          const age = Date.now() - (item.enqueuedAt || 0);
          const attempts = (item.attempts || 0) + 1;
          // Retry with backoff up to 10 minutes, then drop
          if (age < 10 * 60_000 && attempts < 12) {
            remaining.push({ ...item, attempts, enqueuedAt: item.enqueuedAt || Date.now() });
          }
          continue;
        }

        // Persist local GPM link immediately so Tier-0 can poll even if the
        // app server is offline (report below may fail).
        await chrome.storage.local.set({
          linkedGpmProfileId: gpmMatch.id,
          linkedGpmProfileName: gpmMatch.name || "",
          linkedGpmGroupName: gpmMatch.groupName || "",
          linkedGpmUsername: cleanUser,
          linkedGpmResolveAttest: gpmMatch.resolveAttest || null,
        });
        console.log(
          `[TikTokFlow][LINK] queue local-save id=${String(gpmMatch.id).slice(0, 8)} @${cleanUser} ` +
          `via=${gpmMatch.matchedVia || "?"} before server report`
        );

        if (Date.now() < _reportBackoffUntil) {
          remaining.push(item); // don't burn an attempt
          void pushCookiesToAgent(gpmMatch.id);
          hadFailure = true;
          continue;
        }

        const prevStored = await chrome.storage.local.get([
          "linkedGpmProfileName",
          "linkedGpmGroupName",
        ]);
        const effectiveGroupName =
          gpmMatch.groupName || prevStored.linkedGpmGroupName || undefined;
        const effectiveProfileName =
          gpmMatch.name || prevStored.linkedGpmProfileName || undefined;

        const config = await getConfig();
        const body = {
          username,
          nickname: item.nickname || "",
          avatarUrl: item.avatarUrl || "",
          isLoggedIn: item.isLoggedIn === true,
          memberEmail: config.userEmail || undefined,
          gpmProfileId: gpmMatch.id,
          gpmProfileName: effectiveProfileName,
          gpmGroupName: effectiveGroupName,
          source: "extension",
          metricsSource: "identity",
          country: item.country || undefined,
          resolveAttest: gpmMatch.resolveAttest,
        };

        const { resp, authRequired } = await authorizedFetch(
          `${config.serverUrl}/api/extension/report`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        if (resp && (resp.status === 429 || resp.status === 503)) {
          _reportBackoffUntil = Date.now() + parseRetryAfterMs(resp);
        }
        if (authRequired || !resp || !resp.ok) {
          hadFailure = true;
          console.warn(
            `[TikTokFlow][LINK] server report failed @${cleanUser} authRequired=${!!authRequired} ` +
            `status=${resp?.status ?? "n/a"} (local link already saved)`
          );
          const attempts = (item.attempts || 0) + 1;
          if (Date.now() - (item.enqueuedAt || 0) < 10 * 60_000 && attempts < 12) {
            remaining.push({ ...item, attempts });
          }
          // Local link is enough for Tier-0; still count as processed for link purposes.
          void pushCookiesToAgent(gpmMatch.id);
          processed++;
          continue;
        }
        const result = await resp.json().catch(() => ({}));
        const linkedId = result?.account?.gpmProfileId || gpmMatch.id || null;

        if (linkedId && cleanUser) {
          const prevStore = await chrome.storage.local.get([
            "latestAccount",
            "linkedGpmGroupName",
            "linkedGpmProfileName",
          ]);
          const prev2 = prevStore.latestAccount || {};
          const finalGroupName =
            gpmMatch.groupName || prevStore.linkedGpmGroupName || "";
          const finalProfileName =
            gpmMatch.name || prevStore.linkedGpmProfileName || "";

          await chrome.storage.local.set({
            latestAccount: {
              ...prev2,
              gpmProfileId: linkedId,
              lastReportedAt: new Date().toISOString(),
            },
            linkedGpmProfileId: linkedId,
            linkedGpmProfileName: finalProfileName,
            linkedGpmGroupName: finalGroupName,
            linkedGpmUsername: cleanUser,
            linkedGpmResolveAttest: gpmMatch.resolveAttest,
            reportSyncStatus: "ok",
            reportSyncMessage: `Đã xác minh · @${cleanUser} · GPM`,
            reportSyncAt: Date.now(),
          });
          void pushCookiesToAgent(linkedId);
        }
        processed++;
      } catch (err) {
        console.warn("[TikTokFlow] GPM link queue item failed:", err?.message || err);
        hadFailure = true;
        const attempts = (item.attempts || 0) + 1;
        if (Date.now() - (item.enqueuedAt || 0) < 10 * 60_000 && attempts < 12) {
          remaining.push({ ...item, attempts });
        }
      }
    }
    await chrome.storage.local.set({ pendingGpmLinks: remaining });
    if (remaining.length) {
      // Exponential-ish backoff: 5s, then up to 60s
      const maxAttempts = Math.max(...remaining.map((r) => r.attempts || 1));
      const delay = Math.min(60_000, 5_000 * Math.max(1, maxAttempts));
      const backoffRemain = Math.max(0, _reportBackoffUntil - Date.now());
      scheduleGpmLinkAlarm(
        Math.max(hadFailure ? delay : 3000, backoffRemain)
      );
    }
    return { processed, remaining: remaining.length };
  })().finally(() => {
    _gpmLinkInFlight = null;
  });
  return _gpmLinkInFlight;
}

// 5. Discover & Sync GPM Fleet via Local GPMLogin API (Supports v1 and v3)
async function syncGpmFleet(force = false) {
  try {
    const config = await getConfig();
    const now = Date.now();

    if (!config.personalToken) {
      const revoked = await chrome.storage.local.get(["tokenRevoked", "tokenRevokedReason"]);
      if (revoked.tokenRevoked) {
        return {
          success: false,
          authRequired: true,
          error:
            revoked.tokenRevokedReason ||
            "Token đã bị thu hồi. Vui lòng nhập Personal Token mới trong popup.",
        };
      }
      return {
        success: false,
        error: "Chưa có Personal Token. Vui lòng nhập Token trong popup extension rồi thử lại.",
      };
    }

    const stored = await chrome.storage.local.get(["serverIntervalMinutes"]);
    const currentIntervalMin = stored.serverIntervalMinutes || 30;
    const cooldownMs = Math.min(SYNC_COOLDOWN_MS, currentIntervalMin * 60 * 1000 * 0.8);

    if (!force && now - config.lastFleetSyncTime < cooldownMs) {
      console.log("[TikTokFlow] GPM Fleet sync in cooldown. Skipping.");
      return { skipped: true, reason: "Cooldown active" };
    }

    await chrome.storage.local.set({
      fleetSyncStatus: "syncing",
      fleetSyncMessage: "Đang quét GPMLogin…",
      fleetSyncAt: Date.now(),
    });

    // GPMLogin v5.0.8+ uses /api/v1/profiles, earlier versions use /api/v3/profiles
    const rawProfiles = await fetchLocalGpmProfiles();

    if (!rawProfiles.length) {
      const discovered = await discoverGpmApiBase(true);
      if (!discovered.online) {
        console.log("[TikTokFlow] Local GPMLogin API is offline (probed common ports).");
        await chrome.storage.local.set({
          fleetSyncStatus: "error",
          fleetSyncMessage: "GPMLogin offline — không tìm thấy API local.",
        });
        return { skipped: true, reason: "GPMLogin offline" };
      }
      await chrome.storage.local.set({
        fleetSyncStatus: "ok",
        fleetSyncMessage: "Không có profile nào trên máy này.",
        lastFleetSyncTime: now,
        gpmProfileCount: 0,
      });
      return { success: true, count: 0 };
    }

    console.log(`[TikTokFlow] Found ${rawProfiles.length} GPM profiles on local machine. Syncing...`);

    const storedBase = await chrome.storage.local.get(["gpmApiBase"]);
    const groupsMap = await fetchLocalGpmGroups(storedBase.gpmApiBase || null);

    const payloadProfiles = rawProfiles.map((p) => {
      let handle = null;
      const combined = `${p.name || ""} ${p.raw_name || ""} ${p.note || ""}`;
      const m = combined.match(/@([a-zA-Z0-9_.-]{3,30})/);
      if (m) handle = m[1].toLowerCase();

      const groupName = resolveGroupNameFromMap(groupsMap, p.group_id, p.group_name);

      return {
        id: p.id,
        name: p.name || `Profile ${p.id}`,
        raw_name: p.raw_name,
        group_id: p.group_id || undefined,
        group_name: groupName || undefined,
        tiktokHandle: handle,
      };
    });

    const syncBody = {
      profiles: payloadProfiles,
    };
    // Identity comes from Authorization Bearer — omit userEmail to avoid false
    // mismatches from stale zip config vs pasted / regenerated token.

    const { resp: syncResp, authRequired, error: authError } = await authorizedFetch(
      `${config.serverUrl}/api/gpm/client-sync`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncBody),
      }
    );

    if (authRequired || !syncResp) {
      return {
        success: false,
        authRequired: true,
        error: authError || "Cần xác thực lại Personal Token.",
      };
    }

    if (syncResp.ok) {
      const syncResult = await syncResp.json();
      await chrome.storage.local.set({
        lastFleetSyncTime: now,
        gpmProfileCount: rawProfiles.length,
        fleetSyncStatus: "ok",
        fleetSyncMessage: `Đã đồng bộ ${rawProfiles.length} profiles lên server.`,
        fleetSyncAt: Date.now(),
      });
      console.log("[TikTokFlow] GPM Fleet sync completed successfully:", syncResult);
      return { success: true, count: rawProfiles.length, result: syncResult };
    }

    const errData = await syncResp.json().catch(() => ({}));
    if (syncResp.status === 401 || syncResp.status === 403) {
      await chrome.storage.local.set({
        fleetSyncStatus: "error",
        fleetSyncMessage: errData.error || "Token bị thu hồi.",
      });
      return await markTokenRevoked(errData.error, syncResp.status);
    }

    const serverError = resolveAuthErrorMessage(errData.error, syncResp.status);
    console.warn("[TikTokFlow] GPM Fleet sync rejected by server:", serverError);
    await chrome.storage.local.set({
      fleetSyncStatus: "error",
      fleetSyncMessage: serverError,
    });
    return { success: false, error: serverError };
  } catch (err) {
    console.warn("[TikTokFlow] Error during GPM Fleet sync:", err.message);
    await chrome.storage.local.set({
      fleetSyncStatus: "error",
      fleetSyncMessage: err.message || "Lỗi không xác định khi đồng bộ.",
    });
    return { success: false, error: err.message || "Lỗi không xác định khi đồng bộ." };
  }
}

// 6. Check Live TikTok Cookies directly
async function checkTikTokCookie() {
  try {
    const cookie = await chrome.cookies.get({
      url: "https://www.tiktok.com",
      name: "sessionid",
    });

    const isLoggedIn = Boolean(cookie && cookie.value);
    setBadge(isLoggedIn ? "OK" : "OFF", isLoggedIn ? "#10b981" : "#6b7280");

    try {
      const cfg = await getConfig();
      if (cfg.latestAccount?.username) {
        await chrome.storage.local.set({
          latestAccount: { ...cfg.latestAccount, isLoggedIn },
        });
        reportTikTokStatus({
          username: cfg.latestAccount.username,
          isLoggedIn,
          source: "extension",
          metricsSource: "identity",
        });
        chrome.storage.local.get(["linkedGpmProfileId"], (s) => {
          if (s?.linkedGpmProfileId) void pushCookiesToAgent(s.linkedGpmProfileId);
        });
      }
    } catch {
      /* ignore */
    }

    return isLoggedIn;
  } catch (err) {
    return false;
  }
}

// 7. Dynamic Alarms from Web App Settings (Periodic & Fixed-Time)
async function fetchServerSchedule() {
  try {
    const config = await getConfig();
    if (!config.serverUrl) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.SERVER_SCHEDULE_MS);
    const { resp, authRequired } = await authorizedFetch(
      `${config.serverUrl}/api/gpm/client-sync`,
      { method: "GET", signal: controller.signal }
    ).catch(() => ({ resp: null, authRequired: true }));
    clearTimeout(timeoutId);

    if (authRequired || !resp) return null;

    if (resp && resp.ok) {
      const data = await resp.json();
      const intervalMinutes =
        typeof data.intervalMinutes === "number" && data.intervalMinutes > 0
          ? Math.max(1, data.intervalMinutes)
          : null;
      const nextFixedTimestamp =
        typeof data.nextFixedTimestamp === "number" && data.nextFixedTimestamp > Date.now()
          ? data.nextFixedTimestamp
          : null;
      const autoEnabled = data.autoEnabled !== false;
      const scheduleSummary = data.scheduleSummary || (intervalMinutes ? `Mỗi ${intervalMinutes} phút` : "Đang bật");

      await chrome.storage.local.set({
        serverIntervalMinutes: intervalMinutes,
        serverNextFixedTimestamp: nextFixedTimestamp,
        serverAutoEnabled: autoEnabled,
        serverScheduleSummary: scheduleSummary,
      });

      return { intervalMinutes, nextFixedTimestamp, autoEnabled, scheduleSummary };
    }
  } catch (err) {
    console.warn("[TikTokFlow] Could not fetch server schedule:", err.message);
  }
  return null;
}

async function setupSyncAlarm() {
  try {
    const live = await fetchServerSchedule();
    const stored = await chrome.storage.local.get([
      "serverIntervalMinutes",
      "serverNextFixedTimestamp",
      "serverAutoEnabled",
      "serverScheduleSummary",
    ]);

    const autoOn = live ? live.autoEnabled : stored.serverAutoEnabled !== false;
    const interval = live ? live.intervalMinutes : stored.serverIntervalMinutes;
    const fixedTimestamp = live ? live.nextFixedTimestamp : stored.serverNextFixedTimestamp;

    chrome.alarms.clear("tiktokflow_fleet_sync");
    chrome.alarms.clear("tiktokflow_fleet_sync_periodic");
    chrome.alarms.clear("tiktokflow_fleet_sync_fixed");

    if (autoOn) {
      // 1. Repeating interval schedule (e.g. Every 15m, 30m, 60m)
      if (interval && interval > 0) {
        chrome.alarms.create("tiktokflow_fleet_sync_periodic", {
          periodInMinutes: interval,
          delayInMinutes: 1,
        });
        console.log(`[TikTokFlow] Periodic sync scheduled every ${interval} minutes.`);
      }

      // 2. Fixed-time schedule (e.g. Daily at 17:00 or specific date/time)
      if (fixedTimestamp && fixedTimestamp > Date.now()) {
        chrome.alarms.create("tiktokflow_fleet_sync_fixed", {
          when: fixedTimestamp,
        });
        const d = new Date(fixedTimestamp);
        console.log(`[TikTokFlow] Fixed time sync scheduled for ${d.toLocaleTimeString("vi-VN")} ${d.toLocaleDateString("vi-VN")}.`);
      }
    } else {
      console.log("[TikTokFlow] Fleet sync is disabled in Web settings.");
    }
  } catch (err) {
    console.warn("[TikTokFlow] Error configuring sync alarm:", err);
  }
}

async function pingTikTokIdentityTabs(reason = "keepalive") {
  try {
    await ensureExtensionAuth();
    const tabs = await chrome.tabs.query({ url: TIKTOK_TAB_URLS });
    for (const tab of tabs || []) {
      if (!tab?.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "FORCE_IDENTITY_SCAN" }, () => {
        void chrome.runtime.lastError;
      });
    }
    return { ok: true, tabCount: (tabs || []).length };
  } catch (err) {
    return { ok: false, error: err?.message || "ping_failed" };
  }
}

async function setupIdentityKeepaliveAlarm() {
  try {
    await chrome.alarms.clear(IDENTITY_KEEPALIVE_ALARM);
    // MV3 SW sleep: wake every 5 minutes (was 1m — too aggressive with challenge/resolve).
    chrome.alarms.create(IDENTITY_KEEPALIVE_ALARM, {
      periodInMinutes: 5,
    });
  } catch (err) {
    console.warn("[TikTokFlow] identity keepalive alarm failed:", err?.message || err);
  }
}

// Lifecycle Events
// Startup must stay sequential: initFromConfigFile reads tokenRevoked before any
// sync/report can write it. Do not Promise.all() these without re-checking that flag.
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[TikTokFlow] Extension installed.");
  await clearStaleEmailMismatchRevoke();
  await initFromConfigFile();
  await ensureExtensionAuth();
  setupSyncAlarm();
  setupIdentityKeepaliveAlarm();
  chrome.alarms.create(EXT_SWEEP_ALARM, { periodInMinutes: 0.5 });
  checkTikTokCookie();
  syncGpmFleet(false);
  void pingTikTokIdentityTabs("onInstalled");
  void processPendingIdentityReports();
  // Poll immediately — don't wait for the first alarm cycle.
  void pollForExtSweepRequest();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[TikTokFlow] Browser started.");
  await clearStaleEmailMismatchRevoke();
  await initFromConfigFile();
  await ensureExtensionAuth();
  setupSyncAlarm();
  setupIdentityKeepaliveAlarm();
  chrome.alarms.create(EXT_SWEEP_ALARM, { periodInMinutes: 0.5 });
  checkTikTokCookie();
  syncGpmFleet(false);
  void pingTikTokIdentityTabs("onStartup");
  void processPendingIdentityReports();
  // Poll immediately — don't wait for the first alarm cycle.
  void pollForExtSweepRequest();
});

/** One-time recovery: old server returned email-mismatch 403 and marked token "revoked". */
async function clearStaleEmailMismatchRevoke() {
  const data = await chrome.storage.local.get([
    "tokenRevoked",
    "tokenRevokedReason",
    "personalToken",
  ]);
  const reason = String(data.tokenRevokedReason || "").toLowerCase();

  // FIX: narrow to the specific historical message. Previous regex matched
  // the literal word "personalToken" anywhere — which the current server also
  // emits for legitimate revokes. Clearing those would defeat token revocation.
  const isLegacyEmailMismatch =
    reason.includes("không khớp") ||
    reason.includes("khong khop") ||
    (reason.includes("email") &&
      (reason.includes("mismatch") || reason.includes("không trùng")));

  if (data.tokenRevoked && isLegacyEmailMismatch) {
    console.log("[TikTokFlow] Clearing legacy email-mismatch re-auth flag.");
    await chrome.storage.local.set({
      tokenRevoked: false,
      tokenRevokedReason: "",
      tokenRevokedAt: null,
      authRequired: !data.personalToken,
    });
  }
}

// FIX: sweep poll now fires ONLY on EXT_SWEEP_ALARM. Previously it piggybacked
// on every alarm (5 different names), which multiplied the poll rate and made
// log analysis impossible. EXT_SWEEP_ALARM fires every 30s in dev / 60s in prod
// (Chrome's minimum for periodInMinutes). Latency is bounded by that interval.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EXT_SWEEP_ALARM) {
    void pollForExtSweepRequest();
    return;
  }
  if (alarm.name === GPM_LINK_ALARM) {
    void processPendingGpmLinks();
    return;
  }
  if (alarm.name === IDENTITY_RETRY_ALARM) {
    void processPendingIdentityReports();
    return;
  }
  if (alarm.name === IDENTITY_KEEPALIVE_ALARM) {
    void pingTikTokIdentityTabs("alarm");
    chrome.storage.local.get(["pendingGpmLinks", "pendingIdentityReports"], (data) => {
      if (Array.isArray(data.pendingIdentityReports) && data.pendingIdentityReports.length) {
        void processPendingIdentityReports();
      }
      if (Array.isArray(data.pendingGpmLinks) && data.pendingGpmLinks.length) {
        void processPendingGpmLinks();
      }
    });
    return;
  }
  if (
    alarm.name === "tiktokflow_fleet_sync" ||
    alarm.name === "tiktokflow_fleet_sync_periodic" ||
    alarm.name === "tiktokflow_fleet_sync_fixed"
  ) {
    syncGpmFleet(alarm.name === "tiktokflow_fleet_sync_fixed").then(() => {
      // Re-evaluate schedule so next fixed time (e.g. tomorrow) is registered
      setupSyncAlarm();
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const url = tab?.url || "";
  if (!/tiktok\.com/i.test(url)) return;
  // Debounce navigation storms (SPA + multi-profile).
  const key = `nav_${tabId}`;
  clearTimeout(chrome.tabs.onUpdated._ttfNavTimers?.[key]);
  if (!chrome.tabs.onUpdated._ttfNavTimers) chrome.tabs.onUpdated._ttfNavTimers = {};
  chrome.tabs.onUpdated._ttfNavTimers[key] = setTimeout(() => {
    chrome.tabs.sendMessage(tabId, { type: "FORCE_IDENTITY_SCAN" }, () => {
      void chrome.runtime.lastError;
    });
    // FIX: Tier-0 sweep poll on every TikTok navigation. Chrome MV3 throttles
    // alarms to ~60s, but tab events wake the service worker immediately. Since
    // the browser must be open for Tier-0 to trigger, this guarantees the sweep
    // request is picked up within seconds of any page load — no alarm wait needed.
    if (!_sweepInFlight) void pollForExtSweepRequest();
  }, 1500);
});

chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.domain.includes("tiktok.com") && changeInfo.cookie.name === "sessionid") {
    if (changeInfo.removed) {
      setBadge("OFF", "#6b7280");
      getConfig().then(async (cfg) => {
        if (cfg.latestAccount?.username) {
          try {
            await chrome.storage.local.set({
              latestAccount: { ...cfg.latestAccount, isLoggedIn: false },
            });
          } catch {
            /* ignore storage error */
          }
          reportTikTokStatus({
            username: cfg.latestAccount.username,
            isLoggedIn: false,
            source: "extension",
            metricsSource: "identity",
          });
        }
      });
    } else {
      setBadge("OK", "#10b981");
      void pingTikTokIdentityTabs("sessionid");
      chrome.storage.local.get(["linkedGpmProfileId"], (s) => {
        if (s?.linkedGpmProfileId) void pushCookiesToAgent(s.linkedGpmProfileId);
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TIKTOK_STATUS_DETECTED") {
    reportTikTokStatus(message.data)
      .then((result) => {
        sendResponse({ received: true, ok: !!(result && result.ok) });
      })
      .catch(() => {
        sendResponse({ received: true, ok: false });
      });
    return true;
  }

  if (message.type === "REQUEST_IDENTITY_SCAN") {
    pingTikTokIdentityTabs("popup").then((res) => {
      sendResponse(res);
    });
    return true;
  }

  if (message.type === "TRIGGER_MANUAL_SYNC") {
    syncGpmFleet(true).then((res) => {
      sendResponse(res);
    });
    return true;
  }

  if (message.type === "PROBE_GPM") {
    discoverGpmApiBase(true).then((res) => {
      sendResponse(res);
    });
    return true;
  }

  if (message.type === "PROBE_AGENT") {
    probeClientAgent().then((res) => {
      sendResponse(res);
    });
    return true;
  }

  if (message.type === "CHECK_COOKIES") {
    checkTikTokCookie().then((isLoggedIn) => {
      sendResponse({ isLoggedIn });
    });
    return true;
  }

  if (message.type === "REFRESH_SCHEDULE") {
    setupSyncAlarm().then(() => {
      chrome.storage.local.get(
        ["serverIntervalMinutes", "serverAutoEnabled", "serverScheduleSummary"],
        (data) => {
          sendResponse(data);
        }
      );
    });
    return true;
  }

  if (message.type === "FORCE_PAIR_REDEEM") {
    ensureExtensionAuth().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "CLEAR_TOKEN_REVOKED") {
    clearTokenRevokedState(message.updates || {}).then(() => {
      setBadge("", "#6b7280");
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "GET_AUTH_STATUS") {
    chrome.storage.local.get(
      ["tokenRevoked", "tokenRevokedReason", "tokenRevokedAt", "authRequired", "personalToken"],
      (data) => {
        sendResponse({
          tokenRevoked: !!data.tokenRevoked,
          authRequired: !!data.authRequired || !!data.tokenRevoked || !data.personalToken,
          reason: data.tokenRevokedReason || "",
          revokedAt: data.tokenRevokedAt || null,
          hasToken: !!data.personalToken,
        });
      }
    );
    return true;
  }
});
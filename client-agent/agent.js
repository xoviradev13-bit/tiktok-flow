import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import crypto from "crypto";
import { exec, execSync } from "child_process";
import util from "util";
import { fileURLToPath } from "url";
import { chromium } from "playwright-core";

const execAsync = util.promisify(exec);

/** Bounded concurrency & pacing constants for internal TikTok Studio monetization API */
export const M10N_MAX_CONCURRENT_PROGRAMS = 2;
export const M10N_PAGE_PACING_MS = 150;

// ==========================================
// 0. MACHINE-WIDE SINGLETON (1 Agent / PC)
// ==========================================
const AGENT_LOCK_PORT = 39741;
const AGENT_LOCK_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "TikTokFlow");
const AGENT_LOCK_FILE = path.join(AGENT_LOCK_DIR, "agent.lock");
const PROGRAM_DATA_DIR = path.join(
  process.env.PROGRAMDATA || "C:\\ProgramData",
  "TikTokFlow"
);
const MACHINE_FP_CACHE = path.join(PROGRAM_DATA_DIR, "machine-fp.cache");
const MACHINE_FP_TTL_MS = 24 * 60 * 60 * 1000;
const RESOLVE_PROFILE_TIMEOUT_MS = 3000;
const RESOLVE_OVERALL_TIMEOUT_MS = 30000; // was 15000; CDP attach can take longer under load
const PROFILE_TIMEOUT_DEFAULT_MS = 150000; // was effectively 60000
const POLL_INTERVAL_MS = 10000;
const MAX_BODY_BYTES = 1024 * 1024;
const GPM_DISCOVERY_CACHE_MS = 30000;
// FIX: gate verbose Tier-0 polling debug behind an env flag. Every poll from
// every open browser logs multiple lines; at fleet scale this drowns real output.
const TIER0_DEBUG = process.env.TIKTOKFLOW_DEBUG_TIER0 === "1";
const tier0Log = TIER0_DEBUG ? console.log.bind(console) : () => { };

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

let lockServer = null;
let lockHeld = false;
let cachedMachineId = "";
let cachedMachineName = "";
let cachedOsUsername = "";
let machineFpDegraded = false; // true when we only managed to hash a partial fingerprint
const MAX_CONCURRENT_RESOLVES = 16;
let resolveActive = 0;
const resolveWaitQueue = [];
let attestRateHits = [];
/**
 * Tier 0: extension sweep handshake.
 * profileId → { requestId, resolve, reject, timer, expectedHandle }
 * `expectedHandle` (when known) is used to sanity-check the extension's response —
 * a mismatch means the wrong browser answered and we must reject the result.
 */
const _pendingExtSweeps = new Map();
let openProfilesSnapshot = {
  at: 0,
  storagePath: null,
  openProfiles: [],
  apiOnline: false,
  gpm: null,
  scanAllDirsOnly: false,
};

/** Persist Tier-0 extension diagnostics for root-cause analysis (no cookie values). */
function dumpTier0Debug(profileId, reason, tier0Debug, extra = {}) {
  try {
    const dumpDir = path.join(SCRIPT_DIR, "test-results", "tier0-debug");
    fs.mkdirSync(dumpDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dumpPath = path.join(
      dumpDir,
      `${String(profileId || "unknown").slice(0, 8)}_${reason}_${stamp}.json`
    );
    fs.writeFileSync(
      dumpPath,
      JSON.stringify(
        {
          dumpedAt: new Date().toISOString(),
          profileId,
          reason,
          ...extra,
          tier0Debug: tier0Debug || null,
        },
        null,
        2
      ),
      "utf8"
    );
    console.warn(`   [TIER-0][DIAG] Wrote debug dump: ${dumpPath}`);
    if (tier0Debug?.autoOpen) {
      console.warn(
        `   [TIER-0][DIAG] autoOpen: attempted=${tier0Debug.autoOpen.attempted} skipped=${tier0Debug.autoOpen.skipped} reason=${tier0Debug.autoOpen.skipReason || tier0Debug.autoOpen.error || "n/a"} sessionidPresent=${tier0Debug.autoOpen.sessionidPresent} altWouldPass=${tier0Debug.autoOpen.wouldPassIfAltCookiesAccepted}`
      );
    }
    if (tier0Debug?.cookies) {
      const c = tier0Debug.cookies;
      console.warn(
        `   [TIER-0][DIAG] cookies: sessionid=${!!c.sessionid?.present} sessionid_ss=${!!c.sessionid_ss?.present} sid_tt=${!!c.sid_tt?.present}`
      );
    }
    if (tier0Debug?.executeScript) {
      console.warn(
        `   [TIER-0][DIAG] executeScript: attempted=${tier0Debug.executeScript.attempted} tabIsStudio=${tier0Debug.executeScript.tabIsStudio} m10nStatus=${tier0Debug.executeScript.summaries?.m10n?._status ?? "n/a"} m10nHasData=${tier0Debug.executeScript.summaries?.m10n?.hasData}`
      );
    }
    if (Array.isArray(tier0Debug?.events)) {
      for (const ev of tier0Debug.events.slice(-12)) {
        console.warn(`   [TIER-0][DIAG] +${ev.t}ms ${ev.step}`);
      }
    }
    return dumpPath;
  } catch (err) {
    console.warn(`   [TIER-0][DIAG] dump failed: ${err.message}`);
    return null;
  }
}

/** Race a promise against a timer; returns the promise result or throws a labelled timeout. */
async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label || "timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Race a promise against a timer that never rejects; useful for cleanup. */
function cap(p, ms) {
  return Promise.race([
    p,
    new Promise((r) => {
      const t = setTimeout(r, ms);
      if (typeof t.unref === "function") t.unref();
    }),
  ]);
}

function safeCall(fn) {
  try {
    const out = fn();
    if (out && typeof out.then === "function") return out.catch(() => { });
  } catch {
    /* ignore */
  }
}

// ==========================================
// 0.1 PER-PROFILE MUTEX & SESSION COOKIE CACHE
// ==========================================
const SESSIONS_DIR = path.join(AGENT_LOCK_DIR, "sessions");
try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch { }

const activeProfileCookies = new Map(); // profileId -> { at, cookies }
const profileLocks = new Map();         // profileId -> barrier promise
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_ENTRIES = 2048;

export function withProfileLock(profileId, fn) {
  const key = String(profileId || "global").toLowerCase();
  const prev = profileLocks.get(key) || Promise.resolve();
  let release;
  const barrier = new Promise((r) => { release = r; });
  const next = prev.then(async () => {
    try {
      return await fn();
    } finally {
      release();
    }
  });
  profileLocks.set(key, barrier);
  // Delete map entry only when nothing else has queued behind us.
  next.finally(() => {
    if (profileLocks.get(key) === barrier) profileLocks.delete(key);
  }).catch(() => { });
  return next;
}

function pruneSessionsIfNeeded() {
  if (activeProfileCookies.size <= MAX_SESSION_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of activeProfileCookies) {
    if (now - (v?.at || 0) > SESSION_TTL_MS) activeProfileCookies.delete(k);
  }
  if (activeProfileCookies.size > MAX_SESSION_ENTRIES) {
    const sorted = [...activeProfileCookies.entries()].sort(
      (a, b) => (a[1].at || 0) - (b[1].at || 0)
    );
    const toDrop = sorted.length - MAX_SESSION_ENTRIES;
    for (let i = 0; i < toDrop; i++) activeProfileCookies.delete(sorted[i][0]);
  }
}

export function saveProfileSession(profileId, cookies) {
  if (!profileId || !Array.isArray(cookies) || !cookies.length) return;
  const hasAuth = cookies.some(
    (c) => c.name === "sessionid" || c.name === "sessionid_ss" || c.name === "sid_tt"
  );
  if (!hasAuth) return;
  const normId = String(profileId).toLowerCase();
  activeProfileCookies.set(normId, { at: Date.now(), cookies });
  pruneSessionsIfNeeded();
  try {
    const file = path.join(SESSIONS_DIR, `${normId}.json`);
    const payload = JSON.stringify({ at: Date.now(), cookies });
    fs.promises.writeFile(file, payload, "utf8").catch(() => { });
  } catch { /* ignore */ }
}

export function loadProfileSession(profileId) {
  if (!profileId) return null;
  const normId = String(profileId).toLowerCase();
  const mem = activeProfileCookies.get(normId);
  if (mem && (Date.now() - mem.at < SESSION_TTL_MS)) return mem.cookies;
  try {
    const file = path.join(SESSIONS_DIR, `${normId}.json`);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data && Array.isArray(data.cookies) && (Date.now() - (data.at || 0) < SESSION_TTL_MS)) {
        activeProfileCookies.set(normId, { at: data.at || Date.now(), cookies: data.cookies });
        return data.cookies;
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function clearProfileSession(profileId) {
  if (!profileId) return;
  const normId = String(profileId).toLowerCase();
  activeProfileCookies.delete(normId);
  try {
    const file = path.join(SESSIONS_DIR, `${normId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch { /* ignore */ }
}

function withResolveSlot(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      resolveActive += 1;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          resolveActive -= 1;
          const next = resolveWaitQueue.shift();
          if (next) next();
        });
    };
    if (resolveActive < MAX_CONCURRENT_RESOLVES) run();
    else resolveWaitQueue.push(run);
  });
}

const ALLOWED_EXTENSION_IDS = new Set([
  "kfmalbcleehaphfiimeoccklecikbcjj",
  ...(process.env.TIKTOKFLOW_DEV_EXTENSION_ID
    ? [process.env.TIKTOKFLOW_DEV_EXTENSION_ID.toLowerCase().trim()]
    : []),
]);

function isExtensionOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  if (origin.startsWith("chrome-extension://")) {
    const extId = origin.replace("chrome-extension://", "").split("/")[0].toLowerCase();
    return ALLOWED_EXTENSION_IDS.has(extId);
  }
  return false;
}

/** Bounded body reader. Rejects oversized payloads and destroys the socket. */
function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (c) => {
      if (done) return;
      size += c.length;
      if (size > maxBytes) {
        done = true;
        reject(new Error("payload_too_large"));
        try { req.destroy(); } catch { /* ignore */ }
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

// ==========================================
// TIKTOK COUNTRY DETECTOR (MATCHES EXTENSION)
// ==========================================
const LANG_ONLY_CODES = new Set([
  "vi", "en", "th", "id", "ms", "ja", "ko", "zh", "fr", "de", "es", "pt", "ru", "ar",
  "hi", "tr", "it", "pl", "nl", "sv", "ro", "uk", "cs", "hu", "el", "he", "bn", "fil",
]);

const CODE_TO_COUNTRY_CODE = {
  us: "US", gb: "UK", uk: "UK", vn: "VN", de: "DE", fr: "FR", be: "BE", nl: "NL",
  id: "ID", th: "TH", my: "MY", ph: "PH", sg: "SG", jp: "JP", kr: "KR", br: "BR",
  mx: "MX", ca: "CA", au: "AU", in: "IN", pk: "PK", bd: "BD", eg: "EG", tr: "TR",
  ru: "RU", es: "ES", it: "IT", pt: "PT", pl: "PL", se: "SE", ch: "CH", at: "AT",
  ie: "IE", tw: "TW", hk: "HK", kh: "KH", mm: "MM", la: "LA",
};

const NAME_TO_COUNTRY_CODE = {
  "united states": "US", "unitedstates": "US", "usa": "US", "us": "US", "america": "US",
  "united kingdom": "UK", "unitedkingdom": "UK", "great britain": "UK", "britain": "UK", "england": "UK", "uk": "UK", "gb": "UK",
  "vietnam": "VN", "viet nam": "VN", "việt nam": "VN", "vn": "VN",
  "germany": "DE", "deutschland": "DE", "de": "DE",
  "france": "FR", "fr": "FR",
  "belgium": "BE", "be": "BE",
  "netherlands": "NL", "nl": "NL",
  "indonesia": "ID", "id": "ID",
  "thailand": "TH", "th": "TH",
  "malaysia": "MY", "my": "MY",
  "philippines": "PH", "ph": "PH",
  "singapore": "SG", "sg": "SG",
  "japan": "JP", "jp": "JP",
  "south korea": "KR", "korea": "KR", "kr": "KR",
  "brazil": "BR", "br": "BR",
  "mexico": "MX", "mx": "MX",
  "canada": "CA", "ca": "CA",
  "australia": "AU", "au": "AU",
  "spain": "ES", "es": "ES",
  "italy": "IT", "it": "IT",
  "taiwan": "TW", "tw": "TW",
  "hong kong": "HK", "hk": "HK",
};

function extractCountryIso(raw, fromStore = false) {
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

function resolveCountryFromRaw(raw, fromStore = false) {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed || /^\d+$/.test(trimmed)) return null;
  if (NAME_TO_COUNTRY_CODE[trimmed]) return NAME_TO_COUNTRY_CODE[trimmed];
  const code = extractCountryIso(raw, fromStore);
  if (code && CODE_TO_COUNTRY_CODE[code]) return CODE_TO_COUNTRY_CODE[code];
  return null;
}

function detectCountryFromCurrency(cur) {
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
    case "₺": case "TRY": return "TR";
    default: return null;
  }
}

function detectCountryFromText(text) {
  if (!text) return null;
  const s = String(text);
  if (/\b(uk|gb|united\s*kingdom|great\s*britain|anh)\b/i.test(s)) return "UK";
  if (/\b(vn|vietnam|việt\s*nam)\b/i.test(s)) return "VN";
  if (/\b(de|germany|deutschland|đức)\b/i.test(s)) return "DE";
  if (/\b(fr|france|pháp)\b/i.test(s)) return "FR";
  if (/\b(us|usa|united\s*states|mỹ)\b/i.test(s)) return "US";
  if (/\b(th|thailand|thái\s*lan)\b/i.test(s)) return "TH";
  if (/\b(id|indonesia)\b/i.test(s)) return "ID";
  if (/\b(ph|philippines)\b/i.test(s)) return "PH";
  if (/\b(my|malaysia)\b/i.test(s)) return "MY";
  if (/\b(sg|singapore)\b/i.test(s)) return "SG";
  if (/\b(jp|japan|nhật\s*bản)\b/i.test(s)) return "JP";
  if (/\b(kr|korea|hàn\s*quốc)\b/i.test(s)) return "KR";
  if (/\b(br|brazil)\b/i.test(s)) return "BR";
  return null;
}

export function detectAccountCountry({
  passportCountryRaw,
  cookieCountryRaw,
  pageCountryHints,
  currency,
  profileName,
  gpmGroupName,
}) {
  const passportCountry = resolveCountryFromRaw(passportCountryRaw, true);
  const rawStore = cookieCountryRaw || pageCountryHints?.storeCountry;
  const cookieCountry = resolveCountryFromRaw(rawStore, true);
  const regionCountry = resolveCountryFromRaw(pageCountryHints?.region, true);
  const currencyCountry = detectCountryFromCurrency(currency);
  const nameCountry = detectCountryFromText(profileName) || detectCountryFromText(gpmGroupName);

  return (
    passportCountry ||
    cookieCountry ||
    regionCountry ||
    currencyCountry ||
    nameCountry ||
    null
  );
}

function computeMachineFingerprint() {
  if (cachedMachineId && !machineFpDegraded) {
    return {
      machineId: cachedMachineId,
      machineName: cachedMachineName,
      osUsername: cachedOsUsername,
    };
  }
  try {
    if (fs.existsSync(MACHINE_FP_CACHE)) {
      const cached = JSON.parse(fs.readFileSync(MACHINE_FP_CACHE, "utf8"));
      if (cached.machineId) {
        // Never expire the cached ID on TTL alone — reuse it and refresh lazily.
        cachedMachineId = cached.machineId;
        cachedMachineName = cached.machineName || os.hostname();
        cachedOsUsername = cached.osUsername || os.userInfo().username || "";
        machineFpDegraded = !!cached.degraded;
        if (!machineFpDegraded && cached.at && Date.now() - Number(cached.at) < MACHINE_FP_TTL_MS) {
          return {
            machineId: cachedMachineId,
            machineName: cachedMachineName,
            osUsername: cachedOsUsername,
          };
        }
      }
    }
  } catch { /* ignore */ }

  let machineGuid = "";
  let boardUuid = "";
  try {
    machineGuid = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"',
      { encoding: "utf8", timeout: 15000 }
    ).trim();
  } catch { machineGuid = ""; }
  try {
    boardUuid = execSync(
      'powershell -NoProfile -Command "(Get-ItemProperty -Path \'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\' -Name MachineGuid).MachineGuid"',
      { encoding: "utf8", timeout: 15000 }
    ).trim();
  } catch { boardUuid = ""; }

  // Degraded: neither PowerShell probe succeeded. Do NOT overwrite a good cached ID.
  const degraded = !machineGuid && !boardUuid;
  if (degraded && cachedMachineId) {
    return {
      machineId: cachedMachineId,
      machineName: cachedMachineName,
      osUsername: cachedOsUsername,
    };
  }

  const raw = `${machineGuid}|${boardUuid}|${os.hostname()}`;
  cachedMachineId = crypto.createHash("sha256").update(raw).digest("hex");
  cachedMachineName = os.hostname();
  cachedOsUsername = os.userInfo().username || "";
  machineFpDegraded = degraded;
  try {
    fs.mkdirSync(PROGRAM_DATA_DIR, { recursive: true });
    fs.writeFileSync(
      MACHINE_FP_CACHE,
      JSON.stringify({
        machineId: cachedMachineId,
        machineName: cachedMachineName,
        osUsername: cachedOsUsername,
        at: Date.now(),
        degraded,
      }),
      "utf8"
    );
  } catch { /* ignore */ }
  return {
    machineId: cachedMachineId,
    machineName: cachedMachineName,
    osUsername: cachedOsUsername,
  };
}

function signAttest({ nonce, challengeTs }) {
  const fp = computeMachineFingerprint();
  const ts = Number(challengeTs);
  if (!nonce || !Number.isFinite(ts)) throw new Error("missing_nonce_or_ts");
  const secret = String(config.agentAttestSecret || "").trim();
  if (!secret) throw new Error("missing_agentAttestSecret");
  const canonical = [
    fp.machineId,
    fp.machineName || "",
    fp.osUsername || "",
    nonce,
    String(ts),
  ].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  return {
    machineId: fp.machineId,
    machineName: fp.machineName,
    osUsername: fp.osUsername,
    nonce,
    ts,
    sig,
  };
}

async function fetchChallengeTs() {
  try {
    const res = await fetch(`${config.serverUrl}/api/extension/challenge`, {
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && Number.isFinite(Number(json.challengeTs))) {
      return Number(json.challengeTs);
    }
  } catch { /* ignore */ }
  if (process.env.NODE_ENV !== "production") return Date.now();
  throw new Error("challenge_unavailable");
}

async function buildAttestFields() {
  const challengeTs = await fetchChallengeTs();
  const nonce = crypto.randomBytes(16).toString("hex");
  return signAttest({ nonce, challengeTs });
}

function signResolveAttest({ sessionHash, gpmProfileId, reason, nonce, challengeTs }) {
  const fp = computeMachineFingerprint();
  const ts = Number(challengeTs);
  const secret = String(config.agentAttestSecret || "").trim();
  if (!secret) throw new Error("missing_agentAttestSecret");
  const canonical = [
    fp.machineId,
    sessionHash || "",
    gpmProfileId || "",
    reason || "",
    nonce,
    String(ts),
  ].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  return { machineId: fp.machineId, nonce, ts, sig };
}

function writeAgentLockFile() {
  try {
    fs.mkdirSync(AGENT_LOCK_DIR, { recursive: true });
    fs.writeFileSync(
      AGENT_LOCK_FILE,
      JSON.stringify(
        {
          pid: process.pid,
          startedAt: new Date().toISOString(),
          cwd: process.cwd(),
          hostname: os.hostname(),
          port: AGENT_LOCK_PORT,
        },
        null,
        2
      ),
      "utf-8"
    );
  } catch (err) {
    console.warn("[!] Khong the ghi agent.lock:", err.message);
  }
}

function releaseAgentLock() {
  if (lockServer) {
    try { lockServer.close(); } catch { /* ignore */ }
    lockServer = null;
  }
  if (lockHeld) {
    try {
      if (fs.existsSync(AGENT_LOCK_FILE)) {
        const raw = JSON.parse(fs.readFileSync(AGENT_LOCK_FILE, "utf-8"));
        if (raw.pid === process.pid) fs.unlinkSync(AGENT_LOCK_FILE);
      }
    } catch { /* ignore */ }
    lockHeld = false;
  }
}

/**
 * Trust policy for the local HTTP server:
 *  - Host header must be loopback (blocks DNS rebinding).
 *  - If no Origin is present (native local client), allow.
 *  - Extension origin → allow.
 *  - Configured serverUrl / localhost:3000 dev origins → allow.
 */
function isTrustedRequest(req) {
  const host = String(req.headers.host || "").toLowerCase();
  const okHost =
    host === `127.0.0.1:${AGENT_LOCK_PORT}` ||
    host === `localhost:${AGENT_LOCK_PORT}` ||
    host === `[::1]:${AGENT_LOCK_PORT}`;
  if (!okHost) return false;

  const origin = String(req.headers.origin || "");
  if (!origin) return true;
  if (isExtensionOrigin(origin)) return true;

  const o = origin.replace(/\/+$/, "").toLowerCase();
  const configured = String(config.serverUrl || "").replace(/\/+$/, "").toLowerCase();
  return (
    (configured && o === configured) ||
    o === "http://localhost:3000" ||
    o === "http://127.0.0.1:3000"
  );
}

// ---------------------------------------------------------------------------
// Runtime state for sync jobs & scheduled sweeps
// ---------------------------------------------------------------------------
const doneScheduleKeys = new Set();
const handledJobIds = new Set();
let lastHandledJobAt = 0;
let isSweepingActive = false;
let isBackgroundSweep = false;
let abortCurrentSweep = false;
let currentJobId = null;

/** Exclusive bind on 127.0.0.1:39741 — second Agent exits. Port free ⇒ stale lock ignored. */
export function acquireAgentLock() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const origin = String(req.headers.origin || "");
      const allowOrigin = isExtensionOrigin(origin) ? origin : "";
      const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      };
      if (allowOrigin) {
        headers["Access-Control-Allow-Origin"] = allowOrigin;
        headers["Vary"] = "Origin";
      }

      const urlPath = String(req.url || "/").split("?")[0];

      if (req.method === "OPTIONS") {
        // Reflect only origins we actually trust.
        const echo = isTrustedRequest(req) ? (origin || "*") : "null";
        res.writeHead(204, {
          ...headers,
          "Access-Control-Allow-Origin": echo,
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Private-Network": "true",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }

      // All non-OPTIONS requests must come from a trusted local context.
      if (!isTrustedRequest(req)) {
        res.writeHead(403, headers);
        res.end(JSON.stringify({ ok: false, error: "origin_forbidden" }));
        return;
      }

      // Web App / Browser Direct GPM Start Profile Trigger
      if (req.method === "POST" && (urlPath === "/start-profile" || urlPath === "/profiles/start")) {
        try {
          const body = await readBody(req);
          const profileId = body.gpmProfileId || body.profileId;
          const targetUrl = body.url || "https://www.tiktok.com/tiktokstudio";
          const explicitPort = Number(body.port);

          if (!profileId) {
            res.writeHead(400, headers);
            res.end(JSON.stringify({ ok: false, error: "missing_profile_id" }));
            return;
          }

          let gpmApi = await discoverGpmApiBase().catch(() => ({ online: false, base: null, port: null }));
          const targetPort = (explicitPort && Number.isFinite(explicitPort) && explicitPort > 0)
            ? explicitPort
            : (gpmApi.port || 9495);
          const candidates = [
            `http://127.0.0.1:${targetPort}/api/v1`,
            `http://127.0.0.1:${targetPort}/api/v3`,
            ...(gpmApi.base ? [gpmApi.base] : []),
          ];

          let startedData = null;
          for (const base of Array.from(new Set(candidates))) {
            try {
              const startRes = await fetch(
                `${base}/profiles/start/${profileId}?skip_proxy_check=true&url=${encodeURIComponent(targetUrl)}&addition_args=${encodeURIComponent(targetUrl)}`,
                { signal: AbortSignal.timeout(5000) }
              );
              if (startRes.ok) {
                startedData = await startRes.json();
                break;
              }
            } catch { /* next */ }
          }

          res.writeHead(200, headers);
          res.end(JSON.stringify({
            ok: !!startedData,
            success: !!startedData,
            data: startedData?.data || startedData,
            port: targetPort,
            profileId,
          }));
          return;
        } catch (err) {
          const status = err.message === "payload_too_large" ? 413 : 500;
          res.writeHead(status, headers);
          res.end(JSON.stringify({ ok: false, error: err.message }));
          return;
        }
      }

      // Web App / Browser Direct GPM Stop Profile Trigger
      if (req.method === "POST" && (urlPath === "/stop-profile" || urlPath === "/profiles/stop")) {
        try {
          const body = await readBody(req);
          const profileId = body.gpmProfileId || body.profileId;
          if (!profileId) {
            res.writeHead(400, headers);
            res.end(JSON.stringify({ ok: false, error: "missing_profile_id" }));
            return;
          }
          const explicitPort = Number(body.port);
          let gpmApi = await discoverGpmApiBase().catch(() => ({ online: false, base: null, port: null }));
          const targetPort = (explicitPort && Number.isFinite(explicitPort) && explicitPort > 0)
            ? explicitPort
            : (gpmApi.port || 9495);
          let stopped = false;
          for (const ver of ["v1", "v3"]) {
            try {
              const stopRes = await fetch(
                `http://127.0.0.1:${targetPort}/api/${ver}/profiles/stop/${profileId}`,
                { signal: AbortSignal.timeout(4000) }
              );
              if (stopRes.ok) { stopped = true; break; }
            } catch { /* next */ }
          }
          res.writeHead(200, headers);
          res.end(JSON.stringify({ ok: stopped, success: stopped, port: targetPort }));
          return;
        } catch (err) {
          const status = err.message === "payload_too_large" ? 413 : 500;
          res.writeHead(status, headers);
          res.end(JSON.stringify({ ok: false, error: err.message }));
          return;
        }
      }

      // Health & Status
      if (
        (req.method === "GET" || req.method === "HEAD") &&
        (urlPath === "/" || urlPath === "" || urlPath === "/status")
      ) {
        res.writeHead(200, headers);
        res.end(JSON.stringify({
          ok: true,
          role: "tiktokflow-agent",
          pid: process.pid,
          hostname: os.hostname(),
          isSweepingActive,
          isBackgroundSweep,
          currentJobId: currentJobId || null,
          handledJobsCount: handledJobIds.size,
          lastHandledJobAt: lastHandledJobAt ? new Date(lastHandledJobAt).toISOString() : null,
        }));
        return;
      }

      // Self-restart / Exit endpoint (loopback trusted only)
      if (req.method === "POST" && (urlPath === "/restart" || urlPath === "/shutdown")) {
        res.writeHead(200, headers);
        res.end(JSON.stringify({ ok: true, message: "stopping_agent", pid: process.pid }));
        console.log(`[*] Nhan yeu cau ${urlPath} tu API local, dang dong agent (PID: ${process.pid})...`);
        setTimeout(() => process.exit(0), 400);
        return;
      }

      // Extension-only endpoints
      if (
        req.method === "POST" &&
        (urlPath === "/attest" ||
          urlPath === "/resolve-browser" ||
          urlPath === "/bootstrap-extension")
      ) {
        if (!allowOrigin) {
          console.warn(
            `[Agent:resolveBrowser] REJECTED origin_forbidden origin="${origin || ""}" path=${urlPath}`
          );
          res.writeHead(403, headers);
          res.end(JSON.stringify({ ok: false, error: "origin_forbidden" }));
          return;
        }
        const now = Date.now();
        attestRateHits = attestRateHits.filter((t) => now - t < 60_000);
        if (attestRateHits.length >= 30) {
          res.writeHead(429, headers);
          res.end(JSON.stringify({ ok: false, error: "rate_limited" }));
          return;
        }
        attestRateHits.push(now);

        try {
          const body = await readBody(req);
          if (urlPath === "/attest") {
            const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
            const challengeTs = Number(body.challengeTs);
            const signed = signAttest({ nonce, challengeTs });
            res.writeHead(200, headers);
            res.end(JSON.stringify(signed));
            return;
          }

          if (urlPath === "/bootstrap-extension") {
            if (config.tokenRevoked || !config.personalToken) {
              res.writeHead(401, headers);
              res.end(JSON.stringify({
                ok: false,
                error:
                  "Client Agent chua co Personal Token. Chay setup-agent.bat (phim 3) hoac cai zip pairing mot lan.",
                reason: "agent_no_token",
              }));
              return;
            }
            res.writeHead(200, headers);
            res.end(JSON.stringify({
              ok: true,
              personalToken: config.personalToken,
              serverUrl: config.serverUrl || "",
              memberEmail: config.memberEmail || "",
              memberName: config.memberName || "",
            }));
            return;
          }

          // /resolve-browser
          const run = async () => {
            const sessionHash = typeof body.sessionHash === "string" ? body.sessionHash.trim() : "";
            const username = typeof body.username === "string" ? body.username.trim() : "";
            const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
            const challengeTs = Number(body.challengeTs);
            if (!sessionHash || !nonce || !Number.isFinite(challengeTs)) {
              const reason = "bad_request";
              const attest = signResolveAttest({
                sessionHash,
                gpmProfileId: "",
                reason,
                nonce: nonce || "0",
                challengeTs: Number.isFinite(challengeTs) ? challengeTs : Date.now(),
              });
              return { ok: false, reason, ...attest };
            }
            return resolveBrowserBySessionHash({
              sessionHash,
              username,
              nonce,
              challengeTs,
              storageBeacon: typeof body.storageBeacon === "string" ? body.storageBeacon.trim() : "",
              cookies: Array.isArray(body.cookies) ? body.cookies : null,
            });
          };

          const result = await withResolveSlot(run);
          res.writeHead(200, headers);
          res.end(JSON.stringify(result));
          return;
        } catch (err) {
          const status = err.message === "payload_too_large" ? 413 : 500;
          res.writeHead(status, headers);
          res.end(JSON.stringify({ ok: false, error: err?.message || "internal_error" }));
          return;
        }
      }

      // Live Cookie Sync — extension origin ONLY (never arbitrary browser origins).
      if (
        req.method === "POST" &&
        (urlPath === "/sync-cookies" || urlPath === "/profiles/sync-cookies")
      ) {
        if (!isExtensionOrigin(origin)) {
          res.writeHead(403, headers);
          res.end(JSON.stringify({ ok: false, error: "origin_forbidden" }));
          return;
        }
        try {
          const body = await readBody(req);
          const profileId = body.gpmProfileId || body.profileId;
          const cookies = body.cookies;
          if (profileId && Array.isArray(cookies) && cookies.length) {
            saveProfileSession(profileId, cookies);
            res.writeHead(200, headers);
            res.end(JSON.stringify({ ok: true, profileId, count: cookies.length }));
            return;
          }
          res.writeHead(400, headers);
          res.end(JSON.stringify({ ok: false, error: "missing_profile_or_cookies" }));
          return;
        } catch (err) {
          const status = err.message === "payload_too_large" ? 413 : 500;
          res.writeHead(status, headers);
          res.end(JSON.stringify({ ok: false, error: err.message }));
          return;
        }
      }

      // -----------------------------------------------------------------------
      // TIER 0: Extension sweep polling endpoints (extension-origin only)
      // -----------------------------------------------------------------------

      // GET /pending-extension-sweep?profileId=X
      // Extension polls this every alarm cycle. Returns pending request if any.
      if (
        (req.method === "GET" || req.method === "HEAD") &&
        urlPath === "/pending-extension-sweep"
      ) {
        // NOTE: Chrome extension SW GET requests to http://localhost do NOT send an Origin header.
        // The endpoint is localhost-only (isTrustedRequest already enforces this), so we rely on
        // a custom header the extension sends instead of Origin for identification.
        const extHeader = req.headers["x-tiktokflow"];
        if (!isExtensionOrigin(origin) && extHeader !== "extension") {
          console.warn(`[TIER-0-DBG] REJECTED — neither extension origin nor x-tiktokflow header: origin="${origin}" x-tiktokflow="${extHeader}"`);
          res.writeHead(403, headers);
          res.end(JSON.stringify({ ok: false, error: "origin_forbidden" }));
          return;
        }
        const qProfileId = String(new URL(`http://x${req.url}`).searchParams.get("profileId") || "");
        // Each extension identifies itself by a stable instanceId (set in background.js).
        const callerInstanceId = String(new URL(`http://x${req.url}`).searchParams.get("instanceId") || "");
        // FIX: Lock TTL must be strictly larger than extractViaExtension's
        // timeout (120s) plus network slack, otherwise a slow sweep has its lock
        // expire mid-flight and another browser can claim the same task.
        // 130s = 120s sweep + 10s safety.
        const LOCK_TTL = 180_000; // ms — must exceed extractViaExtension(150s) + slack

        // Helper: find the pending task this extension is allowed to claim.
        //
        // FIX: The previous "walk the map" fallback assigned ANY unlocked pending
        // task to an extension that didn't identify its profile. That let a fresh
        // browser profile (whose extension had no linkedGpmProfileId yet) pick up
        // another profile's task and return its OWN account's data. The result
        // would be silently recorded against the wrong DB row.
        //
        // New policy: an extension MUST identify its profile. No match → no task.
        const findUnlockedTask = (preferredProfileId) => {
          if (!preferredProfileId) {
            tier0Log("[TIER-0] Poll without profileId — refusing to assign any task.");
            return null;
          }
          const t = _pendingExtSweeps.get(preferredProfileId);
          if (!t) return null;
          const locked =
            t.lockedAt &&
            (Date.now() - t.lockedAt < LOCK_TTL) &&
            t.lockedBy !== callerInstanceId;
          if (locked) return null;
          return { profileId: preferredProfileId, task: t };
        };

        const found = findUnlockedTask(qProfileId);
        const pending = found?.task ?? null;
        const resolvedProfileId = found?.profileId ?? qProfileId;
        if (pending) {
          // Stamp lock so other browser-extension instances skip this task
          pending.lockedAt = Date.now();
          pending.lockedBy = callerInstanceId;
        }
        tier0Log(
          `[TIER-0] poll → qId="${qProfileId.slice(0, 8)}" resolved="${resolvedProfileId.slice(0, 8)}" ` +
          `mapSize=${_pendingExtSweeps.size} found=${!!pending} instanceId="${callerInstanceId.slice(0, 8)}"`
        );
        if (pending) {
          res.writeHead(200, headers);
          res.end(JSON.stringify({ ok: true, requestId: pending.requestId, profileId: resolvedProfileId }));
        } else {
          res.writeHead(200, headers);
          res.end(JSON.stringify({ ok: false }));
        }
        return;
      }

      // POST /extension-sweep-result
      // Extension posts completed sweep data (or error) here.
      if (req.method === "POST" && urlPath === "/extension-sweep-result") {
        tier0Log(`[TIER-0] /extension-sweep-result | origin="${origin}"`);
        const extHeader2 = req.headers["x-tiktokflow"];
        if (!isExtensionOrigin(origin) && extHeader2 !== "extension") {
          console.warn(`[TIER-0] REJECTED sweep-result — origin="${origin}" x-tiktokflow="${extHeader2}"`);
          res.writeHead(403, headers);
          res.end(JSON.stringify({ ok: false, error: "origin_forbidden" }));
          return;
        }
        try {
          const body = await readBody(req);
          const { requestId, profileId } = body;
          const pending = profileId ? _pendingExtSweeps.get(profileId) : null;
          if (!pending || pending.requestId !== requestId) {
            res.writeHead(404, headers);
            res.end(JSON.stringify({ ok: false, error: "no_matching_request" }));
            return;
          }

          // FIX: sanity check the account. If we knew which handle to expect
          // (because a resolve already told us, or it was set at request time)
          // and the extension returned a different one, reject the result.
          const returnedHandle = String(body?.data?.username || "")
            .replace(/^@/, "").trim().toLowerCase();
          const expectedHandle = String(pending.expectedHandle || "")
            .replace(/^@/, "").trim().toLowerCase();
          if (expectedHandle && returnedHandle && expectedHandle !== returnedHandle) {
            console.warn(
              `[TIER-0] Username mismatch for ${profileId.slice(0, 8)}: expected @${expectedHandle}, got @${returnedHandle}. Rejecting.`
            );
            dumpTier0Debug(profileId, "username_mismatch", body.tier0Debug, {
              expectedHandle,
              returnedHandle,
            });
            _pendingExtSweeps.delete(profileId);
            clearTimeout(pending.timer);
            pending.reject(new Error("extension_username_mismatch"));
            res.writeHead(409, headers);
            res.end(JSON.stringify({ ok: false, error: "username_mismatch" }));
            return;
          }

          _pendingExtSweeps.delete(profileId);
          clearTimeout(pending.timer);
          // Always preserve tier0Debug so extractProfileStudio can dump root-cause
          // logs even when the quality gate rejects the payload.
          if (body.success === false || body.error) {
            pending.resolve({
              success: false,
              error: body.error || "extension_sweep_failed",
              tier0Debug: body.tier0Debug || null,
            });
          } else {
            pending.resolve({
              success: true,
              data: body.data,
              tier0Debug: body.tier0Debug || null,
            });
          }
          res.writeHead(200, headers);
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(err.message === "payload_too_large" ? 413 : 500, headers);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      res.writeHead(404, headers);
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error("\n========================================================");
        console.error("   [CHAN] CLIENT AGENT DA DANG CHAY TREN MAY NAY");
        console.error("========================================================");
        console.error(`   Cong khoa 127.0.0.1:${AGENT_LOCK_PORT} dang bi chiem.`);
        console.error("   Chi cho phep 1 Agent / may. Hay dung stop-agent.bat");
        console.error("   truoc khi mo Agent khac.");
        console.error("========================================================\n");
        resolve(false);
      } else {
        console.error("[!] Loi khoa Agent:", err.message);
        resolve(false);
      }
    });

    server.listen(AGENT_LOCK_PORT, "127.0.0.1", () => {
      lockServer = server;
      lockHeld = true;
      writeAgentLockFile();
      console.log(`[*] Agent singleton: dang giu khoa localhost:${AGENT_LOCK_PORT}`);
      resolve(true);
    });
  });
}

// ==========================================
// 1. CONFIGURATION & CREDENTIALS
// ==========================================
const CONFIG_FILE_SCRIPT = path.join(SCRIPT_DIR, "config.json");
const CONFIG_FILE_CWD = path.join(process.cwd(), "config.json");
const CONFIG_FILE = fs.existsSync(CONFIG_FILE_SCRIPT)
  ? CONFIG_FILE_SCRIPT
  : (fs.existsSync(CONFIG_FILE_CWD) ? CONFIG_FILE_CWD : CONFIG_FILE_SCRIPT);

let config = {
  serverUrl: "http://localhost:3000",
  memberEmail: "admin@tiktokflow.com",
  personalToken: "",
  agentAttestSecret: "",
  concurrency: "auto",
  headless: true,
  m10nMaxConcurrentPrograms: M10N_MAX_CONCURRENT_PROGRAMS,
  m10nPagePacingMs: M10N_PAGE_PACING_MS,
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    config = { ...config, ...JSON.parse(raw) };
  } catch (err) {
    console.warn("[!] Khong the doc file config.json, dung cau hinh mac dinh:", err.message);
  }
}

config.serverUrl = (config.serverUrl || "http://localhost:3000").replace(/\/+$/, "");

let persistConfigTimer = null;
function persistConfig(immediate = false) {
  if (immediate) { persistConfig.flush(); return; }
  if (persistConfigTimer) clearTimeout(persistConfigTimer);
  persistConfigTimer = setTimeout(() => {
    persistConfigTimer = null;
    persistConfig.flush();
  }, 300);
}

persistConfig.flush = function () {
  if (persistConfigTimer) { clearTimeout(persistConfigTimer); persistConfigTimer = null; }
  try {
    const tmp = CONFIG_FILE + ".tmp." + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    try { fs.chmodSync(tmp, 0o600); } catch { /* ignore */ }
    fs.renameSync(tmp, CONFIG_FILE);
    try { fs.chmodSync(CONFIG_FILE, 0o600); } catch { /* ignore */ }
  } catch (err) {
    console.warn("[!] Khong the ghi config.json:", err.message);
  }
};

function markTokenRevoked(reason, httpStatus) {
  const message = reason ||
    (httpStatus === 403
      ? "Quyen Extension da bi vo hieu hoa boi Quan tri vien."
      : "Personal Token khong hop le hoac da bi thu hoi.");

  config.personalToken = "";
  config.accessToken = "";
  config.accessExpiresAt = 0;
  config.refreshToken = "";
  config.pairingCode = "";
  config.tokenRevoked = true;
  config.tokenRevokedReason = message;
  config.tokenRevokedAt = new Date().toISOString();
  persistConfig(true);

  console.error("\n========================================================");
  console.error("   [YEU CAU XAC THUC LAI] PERSONAL TOKEN BI THU HOI     ");
  console.error("========================================================");
  console.error(`   ${message}`);
  console.error("   -> Mo trang Cai dat / Users tren web de lay Token moi");
  console.error("   -> Chay setup-agent.bat (phim 3) de nhap Token moi");
  console.error("   -> Hoac tai lai zip (ma pairing) tu Settings");
  console.error("========================================================\n");

  return { authRequired: true, error: message };
}

async function redeemPairingIfNeeded() {
  if (config.tokenRevoked || config.personalToken || !config.pairingCode) return true;
  try {
    const attest = await buildAttestFields();
    const res = await fetch(`${config.serverUrl}/api/extension/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: config.pairingCode, ...attest }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.personalToken) {
      // Do NOT wipe the token/pairing code on transient server errors.
      if (res.status >= 500 || res.status === 429) {
        console.warn(`[!] Pairing tam thoi khong kha dung (HTTP ${res.status}). Se thu lai sau.`);
        return false;
      }
      markTokenRevoked(
        json.error ||
        "Ma pairing het han hoac da dung. Tai lai zip hoac nhap Personal Token (setup-agent.bat phim 3).",
        res.status
      );
      return false;
    }

    config.personalToken = json.personalToken;
    config.accessToken = json.accessToken || "";
    config.accessExpiresAt = json.accessToken
      ? Date.now() + (Number(json.expiresIn) || 900) * 1000 - 30_000
      : 0;
    config.refreshToken = json.refreshToken || "";
    config.pairingCode = "";
    if (json.serverUrl) config.serverUrl = String(json.serverUrl).replace(/\/+$/, "");
    config.tokenRevoked = false;
    config.tokenRevokedReason = "";
    persistConfig();
    console.log("[+] Pairing redeemed thanh cong.");
    return true;
  } catch (err) {
    console.warn("[!] Pairing redeem loi (transient):", err.message);
    return false;
  }
}

async function exchangeSession() {
  const attest = await buildAttestFields();
  const res = await fetch(`${config.serverUrl}/api/extension/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.personalToken}`,
    },
    body: JSON.stringify({ ...attest }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: json.error };
  config.accessToken = json.accessToken;
  config.accessExpiresAt = Date.now() + (Number(json.expiresIn) || 900) * 1000 - 30_000;
  config.refreshToken = json.refreshToken;
  persistConfig();
  return { ok: true };
}

async function refreshSession() {
  const res = await fetch(`${config.serverUrl}/api/extension/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: config.refreshToken }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json.error,
      reuseDetected: !!json.reuseDetected,
    };
  }
  config.accessToken = json.accessToken;
  config.accessExpiresAt = Date.now() + (Number(json.expiresIn) || 900) * 1000 - 30_000;
  config.refreshToken = json.refreshToken;
  persistConfig();
  return { ok: true };
}

async function ensureAccessToken() {
  await redeemPairingIfNeeded();
  if (config.tokenRevoked || !config.personalToken) {
    return { ok: false, bearer: null };
  }
  if (config.accessToken && config.accessExpiresAt && Date.now() < config.accessExpiresAt) {
    return { ok: true, bearer: config.accessToken };
  }
  if (config.refreshToken) {
    const refreshed = await refreshSession();
    if (refreshed.ok) return { ok: true, bearer: config.accessToken };
    if (refreshed.reuseDetected || refreshed.status === 401) {
      const exchanged = await exchangeSession();
      if (exchanged.ok) return { ok: true, bearer: config.accessToken };
      if (exchanged.status === 401 || exchanged.status === 403) {
        markTokenRevoked(exchanged.error, exchanged.status);
        return { ok: false, bearer: null };
      }
    }
  }
  const exchanged = await exchangeSession();
  if (exchanged.ok) return { ok: true, bearer: config.accessToken };
  if (exchanged.status === 401 || exchanged.status === 403) {
    markTokenRevoked(exchanged.error, exchanged.status);
    return { ok: false, bearer: null };
  }
  return { ok: true, bearer: config.personalToken };
}

/** Build fresh auth headers on every call. Never cache the bearer across long sweeps. */
async function getAuthHeaders(extra = {}) {
  let bearer = config.personalToken;
  try {
    const s = await ensureAccessToken();
    if (s.ok && s.bearer) bearer = s.bearer;
  } catch (e) {
    console.warn("[!] ensureAccessToken:", e.message);
  }
  return {
    "Content-Type": "application/json",
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    ...extra,
  };
}

async function verifyPersonalTokenAtStartup() {
  await redeemPairingIfNeeded();

  if (!config.personalToken) {
    if (config.tokenRevoked) {
      markTokenRevoked(config.tokenRevokedReason || "Token da bi thu hoi truoc do.");
      return false;
    }
    console.warn("[!] CHUA CO PERSONAL TOKEN — Agent se khong gui duoc bao cao len server.");
    return false;
  }

  try {
    const session = await ensureAccessToken();
    if (session.ok && session.bearer) {
      config.tokenRevoked = false;
      config.tokenRevokedReason = "";
      persistConfig();
      console.log("[+] Session JWT / token san sang.");
      return true;
    }

    const res = await fetch(`${config.serverUrl}/api/extension/verify-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.personalToken}`,
      },
      body: JSON.stringify({ token: config.personalToken }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.valid) {
      config.tokenRevoked = false;
      config.tokenRevokedReason = "";
      persistConfig();
      console.log(`[+] Token hop le — nhan su: ${data.user?.name || data.user?.email || "OK"}`);
      return true;
    }
    if (res.status === 401 || res.status === 403) {
      markTokenRevoked(data.error, res.status);
      return false;
    }
    console.warn(`[!] Khong xac minh duoc token (HTTP ${res.status}). Tiep tuc voi canh bao.`);
    return true;
  } catch (err) {
    console.warn("[!] Khong ket noi duoc may chu de verify token:", err.message);
    return true;
  }
}

// 🛡️ Lower process priority so the machine stays responsive.
try {
  if (os.constants?.priority?.PRIORITY_BELOW_NORMAL) {
    os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
  }
} catch { /* ignore */ }

const cpuCount = os.cpus()?.length || 4;
const freeMemGb = os.freemem() / (1024 * 1024 * 1024);

let autoConcurrency = 3;
if (freeMemGb < 1.2) {
  autoConcurrency = 1;
} else if (freeMemGb < 2.5 || cpuCount < 4) {
  autoConcurrency = 2;
} else if (cpuCount >= 12 && freeMemGb >= 6.0) {
  autoConcurrency = 5;
} else if (cpuCount >= 8 && freeMemGb >= 4.0) {
  autoConcurrency = 4;
} else {
  autoConcurrency = 3;
}

if (!config.concurrency || config.concurrency === "auto") {
  config.concurrency = autoConcurrency;
} else {
  config.concurrency = Math.max(1, Math.min(Number(config.concurrency) || 3, 6));
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--mute-audio",
  "--no-first-run",
  "--no-default-browser-check",
  "--blink-settings=imagesEnabled=false",
  "--disable-remote-fonts",
];

// ==========================================
// 2. LIFECYCLE & ZOMBIE KILLER
// ==========================================
const activeTempDirs = new Set();
const activeContexts = new Set();

/**
 * Cleanup a temp dir we created. Uses path.relative (not startsWith) so that
 * C:\Temp2 does not match C:\Temp.
 */
function cleanupTempDir(tempDir) {
  if (!tempDir || typeof tempDir !== "string") return;
  try {
    const resolvedTarget = path.resolve(tempDir);
    const resolvedTmp = path.resolve(os.tmpdir());
    const baseName = path.basename(resolvedTarget);

    const rel = path.relative(resolvedTmp, resolvedTarget);
    const isInsideOsTmp = rel && !rel.startsWith("..") && !path.isAbsolute(rel);
    const isInsideGpmTemp = resolvedTarget.includes(".gpm_temp");

    if (!isInsideOsTmp && !isInsideGpmTemp) {
      console.warn("[!] [Bao Ve File] Chan hanh dong xoa ngoai thu muc tam:", resolvedTarget);
      return;
    }

    if (!baseName.startsWith("gpm-agent-") && !baseName.startsWith("agent-") && !baseName.startsWith("agent-min-")) {
      console.warn("[!] [Bao Ve File] Chan hanh dong xoa thu muc khong phai do Agent tao:", resolvedTarget);
      return;
    }

    if (fs.existsSync(resolvedTarget)) {
      fs.rmSync(resolvedTarget, { recursive: true, force: true });
    }
    activeTempDirs.delete(resolvedTarget);
  } catch { /* silent */ }
}

function sweepStaleTempDirs(storageRoot) {
  if (!storageRoot) return;
  try {
    const tempRoot = path.join(storageRoot, ".gpm_temp");
    if (fs.existsSync(tempRoot)) {
      const entries = fs.readdirSync(tempRoot, { withFileTypes: true });
      let cleaned = 0;
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (!ent.name.startsWith("agent-") && !ent.name.startsWith("gpm-agent-") && !ent.name.startsWith("agent-min-")) continue;
        const fullPath = path.join(tempRoot, ent.name);
        // Skip dirs we still hold in memory.
        if (activeTempDirs.has(path.resolve(fullPath))) continue;
        try { fs.rmSync(fullPath, { recursive: true, force: true }); cleaned++; } catch { /* ignore */ }
      }
      if (cleaned > 0) console.log(`[*] Da don dep ${cleaned} thu muc snapshot tam cu trong .gpm_temp`);
    }
  } catch { /* ignore */ }
}

async function emergencyCleanup() {
  persistConfig.flush();
  for (const ctx of activeContexts) {
    try { await cap(ctx.close().catch(() => { }), 3000); } catch { /* ignore */ }
  }
  for (const dir of activeTempDirs) cleanupTempDir(dir);
  releaseAgentLock();
}

process.on("exit", () => {
  persistConfig.flush();
  releaseAgentLock();
});

process.on("SIGINT", async () => {
  console.log("\n[*] Nhan tin hieu dung (Ctrl+C). Dang giai phong RAM va don dep an toan...");
  await emergencyCleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await emergencyCleanup();
  process.exit(0);
});

process.on("uncaughtException", async (err) => {
  console.error("\n[LOI] Loi tien trinh khong xac dinh:", err?.stack || err?.message || err);
  await emergencyCleanup();
  process.exit(1);
});

// IMPORTANT: do NOT exit on unhandled rejection — the daemon must survive a stray promise.
process.on("unhandledRejection", (reason) => {
  const msg = reason && reason.stack ? reason.stack : String(reason);
  console.error("[!] unhandledRejection:", msg);
});

// ==========================================
// 3. READ-ONLY GPM STORAGE & CHROME DISCOVERY
// ==========================================
export function getGpmStoragePath() {
  if (config.gpmStoragePath && fs.existsSync(config.gpmStoragePath)) {
    return config.gpmStoragePath;
  }
  const appData = process.env.APPDATA || "";
  const localAppData = process.env.LOCALAPPDATA || "";

  const settingCandidates = [
    path.join(appData, "GPMLoginGlobal", "setting.dat"),
    path.join(appData, "GPMLoginGlobal", "gpm_setting.dat"),
    path.join(appData, "GPMLogin", "setting.dat"),
    path.join(localAppData, "GPMLoginGlobal", "setting.dat"),
  ];

  for (const sPath of settingCandidates) {
    if (fs.existsSync(sPath)) {
      try {
        const content = fs.readFileSync(sPath, "utf-8");
        const parsed = JSON.parse(content);
        const resolvedPath = parsed.local_storage_path || parsed.profile_path || parsed.storage_path;
        if (resolvedPath && fs.existsSync(resolvedPath)) return resolvedPath;
      } catch { /* ignore */ }
    }
  }

  const fallbacks = [
    "D:\\Tiktok automation",
    "C:\\Tiktok automation",
    "E:\\Tiktok automation",
    path.join(appData, "GPMLoginGlobal", "Profiles"),
    path.join(localAppData, "GPMLoginGlobal", "Profiles"),
    path.join(appData, "GPMLogin", "Profiles"),
  ];

  for (const fb of fallbacks) {
    if (fs.existsSync(fb)) return fb;
  }

  return path.join(appData, "GPMLoginGlobal", "Profiles");
}

export function getChromeExecutablePath() {
  const appData = process.env.APPDATA || "";
  const gpmBrowsersDir = path.join(appData, "GPMLoginGlobal", "Browsers");

  if (fs.existsSync(gpmBrowsersDir)) {
    try {
      const entries = fs.readdirSync(gpmBrowsersDir);
      for (const entry of entries) {
        const candidate = path.join(gpmBrowsersDir, entry, "chrome.exe");
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch { /* ignore */ }
  }

  const systemPaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  ];

  for (const sp of systemPaths) {
    if (fs.existsSync(sp)) return sp;
  }

  return undefined;
}

const GPM_PORT_CANDIDATES = [9495, 9496, 19995, 19996, 19994, 8848];

function readGpmConfiguredApiPort() {
  const appData = process.env.APPDATA || "";
  const localAppData = process.env.LOCALAPPDATA || "";
  const settingCandidates = [
    path.join(appData, "GPMLoginGlobal", "setting.dat"),
    path.join(appData, "GPMLoginGlobal", "gpm_setting.dat"),
    path.join(appData, "GPMLogin", "setting.dat"),
    path.join(localAppData, "GPMLoginGlobal", "setting.dat"),
  ];
  for (const sPath of settingCandidates) {
    try {
      if (!fs.existsSync(sPath)) continue;
      const parsed = JSON.parse(fs.readFileSync(sPath, "utf-8"));
      const port = Number(parsed?.api?.port);
      if (Number.isFinite(port) && port > 0) return port;
    } catch { /* ignore */ }
  }
  return null;
}

let lastGoodGpmBase = null;
// Negative cache: when discovery fails, don't re-probe the full port matrix on every call.
let gpmDiscoveryCache = { at: 0, result: null };

export async function discoverGpmApiBase() {
  if (gpmDiscoveryCache.result && Date.now() - gpmDiscoveryCache.at < GPM_DISCOVERY_CACHE_MS) {
    return gpmDiscoveryCache.result;
  }
  const configuredPort = readGpmConfiguredApiPort();
  const ports = [
    ...(lastGoodGpmBase
      ? [Number((String(lastGoodGpmBase).match(/:(\d+)\//) || [])[1])].filter(Boolean)
      : []),
    ...GPM_PORT_CANDIDATES,
    ...(configuredPort ? [configuredPort] : []),
  ];
  const seen = new Set();
  const bases = [];
  for (const port of ports) {
    if (!port || seen.has(port)) continue;
    seen.add(port);
    for (const ver of ["v1", "v3"]) bases.push(`http://127.0.0.1:${port}/api/${ver}`);
  }

  for (const base of bases) {
    const isDeadConfigured =
      configuredPort &&
      base.includes(`:${configuredPort}/`) &&
      !GPM_PORT_CANDIDATES.includes(configuredPort);
    const probeMs = isDeadConfigured ? 600 : 1200;
    try {
      const resp = await fetch(`${base}/profiles?page=1&per_page=1&page_size=1`, {
        signal: AbortSignal.timeout(probeMs),
      });
      if (!resp || !resp.ok) continue;
      const json = await resp.json().catch(() => null);
      const rows = normalizeGpmProfileRows(json);
      if (!rows) continue;
      const portMatch = base.match(/:(\d+)\//);
      lastGoodGpmBase = base;
      const result = {
        online: true,
        base,
        port: portMatch ? Number(portMatch[1]) : null,
      };
      gpmDiscoveryCache = { at: Date.now(), result };
      return result;
    } catch { /* next */ }
  }

  const offlineResult = {
    online: false,
    base: null,
    port: lastGoodGpmBase
      ? Number((String(lastGoodGpmBase).match(/:(\d+)\//) || [])[1]) || 9495
      : configuredPort || 9495,
  };
  gpmDiscoveryCache = { at: Date.now(), result: offlineResult };
  return offlineResult;
}

function normalizeGpmProfileRows(json) {
  if (!json || typeof json !== "object") return null;
  const data = json.data;
  let rows = null;
  if (Array.isArray(data)) rows = data;
  else if (data && typeof data === "object" && Array.isArray(data.data)) rows = data.data;
  if (!rows || !rows.length) {
    if (data && typeof data === "object" && Array.isArray(data.data) && data.data.length === 0) return [];
    if (Array.isArray(data) && data.length === 0) return [];
    return null;
  }
  if (!rows[0] || typeof rows[0] !== "object" || !rows[0].id) return null;
  return rows;
}

/**
 * Paginated fetch of all GPM profiles.
 * Returns the array; sets `.truncated = true` when the loop stops before the
 * server-reported total. Callers must check `.truncated` before treating the
 * result as authoritative.
 */
export async function fetchAllGpmProfiles(base) {
  const out = [];
  out.truncated = false;
  if (!base) return out;
  const seenIds = new Set();
  let page = 1;
  const maxPages = 100;
  let expectedTotal = null;
  while (page <= maxPages) {
    try {
      const resp = await fetch(
        `${base}/profiles?page=${page}&per_page=100&page_size=100`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!resp.ok) { out.truncated = true; break; }
      const json = await resp.json().catch(() => ({}));
      const rows = normalizeGpmProfileRows(json) || [];
      if (!rows.length) break;
      let newCount = 0;
      for (const r of rows) {
        const id = String(r.id || "");
        if (id && !seenIds.has(id)) { seenIds.add(id); out.push(r); newCount++; }
      }
      if (newCount === 0) break;

      const total = Number(json?.data?.total || json?.total);
      if (Number.isFinite(total) && total > 0) expectedTotal = total;
      const lastPage = Number(json?.data?.last_page || json?.last_page);
      if (lastPage && page >= lastPage) break;
      if (expectedTotal && out.length >= expectedTotal) break;
      page++;
    } catch {
      out.truncated = true;
      break;
    }
  }
  if (expectedTotal && out.length < expectedTotal) out.truncated = true;
  return out;
}

function profileLooksRunning(p) {
  if (!p || typeof p !== "object") return false;
  const status = String(p.status ?? p.state ?? p.run_status ?? "").toLowerCase().trim();
  if (["running", "open", "started", "active", "online", "1", "true"].includes(status)) return true;
  if (p.is_running === true || p.running === true || p.isRunning === true) return true;
  if (p.is_running === 1 || p.running === 1) return true;
  if (p.is_running === "1" || p.running === "1") return true;
  return false;
}

function hasProfileOpenLock(storageRoot, profileId) {
  try {
    const dir = path.join(storageRoot, String(profileId));
    // Do NOT treat a leftover `lockfile` path as proof the browser is open —
    // GPM profile dirs often keep that file on disk after close. Use live locks
    // / DevTools only here; `isProfileBrowserAlive` handles Windows EBUSY on lockfile.
    return (
      fs.existsSync(path.join(dir, "SingletonLock")) ||
      fs.existsSync(path.join(dir, "SingletonSocket")) ||
      fs.existsSync(path.join(dir, "DevToolsActivePort"))
    );
  } catch { return false; }
}

/**
 * Windows-safe check: on Windows, Chrome holds `lockfile` open (deny write).
 * EBUSY / EPERM means the browser is running.
 */
function isProfileBrowserAlive(storageRoot, profileId) {
  const dir = path.join(storageRoot, String(profileId));

  // Windows first: try opening lockfile exclusively.
  if (process.platform === "win32") {
    const lockFile = path.join(dir, "lockfile");
    try {
      const fd = fs.openSync(lockFile, "r+");
      fs.closeSync(fd);
      // Opened fine → not locked by Chrome. Fall through to DevTools check.
    } catch (err) {
      if (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES") return true;
    }
  }

  // POSIX / fallback: parse SingletonLock target.
  const lockPath = path.join(dir, "SingletonLock");
  try {
    let target = "";
    try { target = fs.readlinkSync(lockPath); } catch {
      try { target = fs.readFileSync(lockPath, "utf8"); } catch { target = ""; }
    }
    const m = String(target || "").match(/-(\d+)\s*$/);
    if (m) {
      const pid = Number(m[1]);
      if (Number.isFinite(pid) && pid > 0) {
        try { process.kill(pid, 0); return true; } catch { return false; }
      }
    }
  } catch { /* fall through */ }

  if (readDevToolsActivePort(storageRoot, profileId)) return true;
  return false;
}

function extensionSettingsLogMtime(storageRoot, profileId) {
  const root = path.join(storageRoot, String(profileId), "Default", "Local Extension Settings");
  let newest = 0;
  try {
    if (!fs.existsSync(root)) return 0;
    for (const extDir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!extDir.isDirectory()) continue;
      const dir = path.join(root, extDir.name);
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith(".log")) continue;
        try {
          const mt = fs.statSync(path.join(dir, f)).mtimeMs;
          if (mt > newest) newest = mt;
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return newest;
}

function cheapOpenMtime(storageRoot, profileId) {
  const dir = path.join(storageRoot, String(profileId));
  for (const rel of ["DevToolsActivePort", "SingletonLock", "lockfile"]) {
    try { return fs.statSync(path.join(dir, rel)).mtimeMs || 0; } catch { /* next */ }
  }
  return 0;
}

function rankProfilesForBeaconScan(storageRoot, profiles) {
  return [...profiles].sort((a, b) => cheapOpenMtime(storageRoot, b.id) - cheapOpenMtime(storageRoot, a.id));
}

let processOpenCache = { at: 0, root: "", ids: new Set() };
let processScanInFlight = null;

async function listOpenProfileIdsFromProcesses(storageRoot) {
  const rootKey = String(storageRoot || "");
  const age = Date.now() - processOpenCache.at;
  const sameRoot = processOpenCache.root === rootKey;
  // Non-empty: cache 2.5s. Empty: cache only 1s to avoid hammering the process list.
  const ttl = processOpenCache.ids.size ? 2500 : 1000;
  if (age < ttl && sameRoot) return processOpenCache.ids;
  if (processScanInFlight) return processScanInFlight;

  processScanInFlight = (async () => {
    const open = new Set();
    const rootNorm = path.resolve(storageRoot || "").toLowerCase();
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    function ingestLine(line) {
      if (!line) return;
      const re = /--user-data-dir(?:=|\s+)(?:"([^"]+)"|(\S+))/gi;
      let m;
      while ((m = re.exec(line))) {
        const dir = path.resolve(String(m[1] || m[2] || "").replace(/^"|"$/g, ""));
        const lower = dir.toLowerCase();
        const id = path.basename(dir);
        if (!uuidRe.test(id)) continue;
        if (rootNorm && lower.startsWith(rootNorm)) { open.add(id); continue; }
        if (/tiktok\s*automation|gpmlogin|gpm.?login/i.test(lower)) open.add(id);
      }
    }

    const commands = [
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match \'chrome|gpm|chromium\' } | Select-Object -ExpandProperty CommandLine"',
      'wmic process where "name=\'chrome.exe\' or name=\'gpm_browser.exe\' or name=\'GPMBrowser.exe\'" get CommandLine /value',
    ];

    for (const cmd of commands) {
      try {
        const { stdout } = await execAsync(cmd, {
          encoding: "utf8",
          timeout: 45000,
          windowsHide: true,
          maxBuffer: 16 * 1024 * 1024,
        });
        for (const line of String(stdout || "").split(/\r?\n/)) ingestLine(line);
        if (open.size) break;
      } catch { /* next */ }
    }

    processOpenCache = { at: Date.now(), root: rootKey, ids: open };
    return open;
  })().finally(() => { processScanInFlight = null; });

  return processScanInFlight;
}

function readDevToolsActivePort(storageRoot, profileId) {
  try {
    const candidates = [
      path.join(storageRoot, String(profileId), "DevToolsActivePort"),
      path.join(storageRoot, String(profileId), "Default", "DevToolsActivePort"),
    ];
    for (const file of candidates) {
      if (!fs.existsSync(file)) continue;
      const first = String(fs.readFileSync(file, "utf8") || "").split(/\r?\n/)[0]?.trim();
      const port = Number(first);
      if (Number.isFinite(port) && port > 0) return port;
    }
    return null;
  } catch { return null; }
}

function listAllGpmProfileDirs(storageRoot) {
  if (!storageRoot) return [];
  try {
    return fs.readdirSync(storageRoot, { withFileTypes: true })
      .filter((ent) => ent.isDirectory() && /^[0-9a-f-]{36}$/i.test(ent.name))
      .map((ent) => ({
        id: ent.name,
        name: readGpmProfileNameFromDisk(storageRoot, ent.name) || `Profile ${ent.name}`,
        _diskOnly: true,
      }));
  } catch { return []; }
}

async function listOpenProfilesFromDisk(storageRoot) {
  const ids = new Set();
  if (!storageRoot) return [];
  const procIds = await listOpenProfileIdsFromProcesses(storageRoot);
  for (const id of procIds) ids.add(id);
  try {
    for (const ent of fs.readdirSync(storageRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (!/^[0-9a-f-]{36}$/i.test(ent.name)) continue;
      if (isProfileBrowserAlive(storageRoot, ent.name)) ids.add(ent.name);
    }
  } catch { /* ignore */ }
  return [...ids].map((id) => ({
    id,
    name: readGpmProfileNameFromDisk(storageRoot, id) || `Profile ${id}`,
    _diskOnly: true,
  }));
}

export function readGpmProfileMetaFromDisk(storageRoot, profileId) {
  try {
    const pi = path.join(storageRoot, String(profileId), "Default", "GPMSoft", "gpm_pi.dat");
    if (!fs.existsSync(pi)) return { name: null, groupName: null, groupId: null };
    const raw = fs.readFileSync(pi, "utf8").trim();
    let json = raw;
    try { json = Buffer.from(raw, "base64").toString("utf8"); } catch { /* already plain */ }
    const parsed = JSON.parse(json);
    const name = parsed?.name || parsed?.raw_name || null;
    const rawGid = parsed?.group_id ?? parsed?.groupId ?? parsed?.Group?.id ?? null;
    const groupId = rawGid !== null && rawGid !== undefined ? String(rawGid) : null;
    const groupName = parsed?.group_name || parsed?.groupName || parsed?.Group?.name || null;
    return { name, groupName: groupName || null, groupId };
  } catch {
    return { name: null, groupName: null, groupId: null };
  }
}

function readGpmProfileNameFromDisk(storageRoot, profileId) {
  return readGpmProfileMetaFromDisk(storageRoot, profileId).name;
}

let gpmGroupsCache = { at: 0, byId: new Map(), base: null };
let gpmApiOfflineUntil = 0;

function gpmGroupsCachePaths() {
  const paths = [];
  const programDataDir = path.join(process.env.ProgramData || "C:\\ProgramData", "TikTokFlow");
  paths.push(path.join(programDataDir, "gpm-groups-cache.json"));
  const appData = process.env.APPDATA || "";
  if (appData) paths.push(path.join(appData, "TikTokFlow", "gpm-groups-cache.json"));
  const localAppData = process.env.LOCALAPPDATA || "";
  if (localAppData) paths.push(path.join(localAppData, "TikTokFlow", "gpm-groups-cache.json"));
  const userProfile = process.env.USERPROFILE || "";
  if (userProfile && !userProfile.includes("systemprofile")) {
    paths.push(path.join(userProfile, "AppData", "Roaming", "TikTokFlow", "gpm-groups-cache.json"));
  }
  return [...new Set(paths)];
}

function loadGpmGroupsDiskCache() {
  try {
    const candidates = gpmGroupsCachePaths();
    const byId = new Map();
    let loaded = false;
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(p, "utf8"));
        const entries = raw?.byId && typeof raw.byId === "object" ? raw.byId : {};
        for (const [k, v] of Object.entries(entries)) byId.set(String(k), String(v));
        gpmGroupsCache = { at: Number(raw.at) || Date.now(), byId, base: raw.base || "disk" };
        loaded = true;
        break;
      } catch { /* next */ }
    }
    if (!loaded) gpmGroupsCache = { at: Date.now(), byId: new Map(), base: null };
    return gpmGroupsCache.byId.size > 0;
  } catch {
    gpmGroupsCache = { at: Date.now(), byId: new Map(), base: null };
    return false;
  }
}

function saveGpmGroupsDiskCache() {
  try {
    const byId = {};
    for (const [k, v] of gpmGroupsCache.byId.entries()) byId[k] = v;
    const content = JSON.stringify({ at: Date.now(), base: gpmGroupsCache.base, byId }, null, 2);
    for (const p of gpmGroupsCachePaths()) {
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content, "utf8");
      } catch { /* best-effort */ }
    }
  } catch { /* ignore */ }
}

loadGpmGroupsDiskCache();

async function ensureGpmGroupsCache(gpmBase) {
  if (
    gpmBase &&
    Date.now() - gpmGroupsCache.at < 60_000 &&
    gpmGroupsCache.byId.size &&
    gpmGroupsCache.base === gpmBase
  ) return true;
  if (!gpmBase) {
    if (Date.now() - gpmGroupsCache.at < 60_000 && gpmGroupsCache.byId.size) return true;
    return loadGpmGroupsDiskCache() || gpmGroupsCache.byId.size > 0;
  }
  try {
    const resp = await fetch(`${gpmBase}/groups?page=1&page_size=200&per_page=200`, {
      signal: AbortSignal.timeout(6000),
    });
    const json = await resp.json().catch(() => ({}));
    const rows = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.data?.data) ? json.data.data : [];
    const byId = new Map(gpmGroupsCache.byId);
    for (const g of rows) {
      if (g?.id != null && g?.name) byId.set(String(g.id), String(g.name));
    }
    if (byId.size) {
      gpmGroupsCache = { at: Date.now(), byId, base: gpmBase };
      saveGpmGroupsDiskCache();
      return true;
    }
  } catch { /* ignore */ }
  return loadGpmGroupsDiskCache() || gpmGroupsCache.byId.size > 0;
}

async function lookupGpmGroupName(gpmBase, groupId) {
  const id = String(groupId || "").trim();
  if (!id) return null;
  await ensureGpmGroupsCache(gpmBase || null);
  if (gpmGroupsCache.byId.has(id)) return gpmGroupsCache.byId.get(id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return id;
  return null;
}

async function enrichResolveWithGroup(payload, storagePath, gpmBase) {
  if (!payload?.ok || !payload.gpmProfileId) return payload;
  const meta = storagePath
    ? readGpmProfileMetaFromDisk(storagePath, payload.gpmProfileId)
    : { name: null, groupName: null, groupId: null };
  const gpmProfileName = payload.gpmProfileName || meta.name || null;
  let gpmGroupName = payload.gpmGroupName || meta.groupName || null;
  const groupId = meta.groupId || null;
  if (!gpmGroupName && groupId) gpmGroupName = await lookupGpmGroupName(gpmBase || null, groupId);
  if (!gpmGroupName && gpmBase) {
    try {
      const resp = await fetch(`${gpmBase}/profiles/${payload.gpmProfileId}`, {
        signal: AbortSignal.timeout(5000),
      });
      const json = await resp.json().catch(() => ({}));
      const row = json?.data || json;
      const gid = row?.group_id || groupId;
      if (row?.group_name) gpmGroupName = row.group_name;
      else if (row?.Group?.name) gpmGroupName = row.Group.name;
      else gpmGroupName = await lookupGpmGroupName(gpmBase, gid);
    } catch { /* ignore */ }
  }
  return { ...payload, gpmProfileName, gpmGroupName: gpmGroupName || undefined };
}

async function profileContainsStorageBeaconAsync(storageRoot, profileId, beacon, opts = {}) {
  if (!beacon || beacon.length < 12) return false;
  const logOnly = opts.logOnly === true;
  const root = path.join(storageRoot, String(profileId), "Default", "Local Extension Settings");
  if (!fs.existsSync(root)) return false;
  try {
    const extDirs = await fs.promises.readdir(root, { withFileTypes: true });
    for (const extDir of extDirs) {
      if (!extDir.isDirectory()) continue;
      const dir = path.join(root, extDir.name);
      let files = [];
      try { files = await fs.promises.readdir(dir); } catch { continue; }
      const ranked = files
        .filter((f) => logOnly ? f.endsWith(".log") : (f.endsWith(".log") || f.endsWith(".ldb")))
        .map((f) => {
          const full = path.join(dir, f);
          let mtime = 0;
          try { mtime = fs.statSync(full).mtimeMs; } catch { /* ignore */ }
          return { f, full, mtime, isLog: f.endsWith(".log") };
        })
        .sort((a, b) => a.isLog !== b.isLog ? (a.isLog ? -1 : 1) : b.mtime - a.mtime);
      const limited = logOnly ? ranked.slice(0, 2) : ranked.slice(0, 4);
      for (const { full } of limited) {
        let text = null;
        try {
          const st = await fs.promises.stat(full);
          const maxTail = Number(opts.maxTail) > 0 ? opts.maxTail
            : (st.size <= 10 * 1024 * 1024 ? st.size : 4 * 1024 * 1024);
          const handle = await fs.promises.open(full, "r");
          try {
            const start = Math.max(0, st.size - maxTail);
            const len = st.size - start;
            const buf = Buffer.alloc(len);
            await handle.read(buf, 0, len, start);
            text = buf.toString("latin1");
          } finally { await handle.close(); }
        } catch { text = null; }
        if (text && text.includes(beacon)) return true;
      }
    }
  } catch { return false; }
  return false;
}

let beaconScanTail = Promise.resolve();
function withBeaconScanLock(fn) {
  const run = beaconScanTail.then(fn, fn);
  beaconScanTail = run.then(() => undefined, () => undefined);
  return run;
}

async function findOpenProfileByStorageBeacon(storageRoot, openProfiles, beacon) {
  if (!beacon || !storageRoot || !openProfiles?.length) return [];
  return withBeaconScanLock(async () => {
    const ranked = rankProfilesForBeaconScan(storageRoot, openProfiles);
    for (let attempt = 0; attempt < 2; attempt++) {
      const logOnly = attempt === 0;
      for (const p of ranked) {
        let ok = false;
        try {
          ok = await profileContainsStorageBeaconAsync(storageRoot, p.id, beacon, { logOnly });
        } catch { ok = false; }
        if (ok) {
          return [{
            id: String(p.id),
            name: p.name || readGpmProfileNameFromDisk(storageRoot, p.id) || `Profile ${p.id}`,
          }];
        }
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
    }
    return [];
  });
}

function hasSingletonLock(storagePath, profileId) {
  return hasProfileOpenLock(storagePath, profileId);
}

async function hashSessionCookieValue(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function extractDebugPortFromProfile(p) {
  if (!p || typeof p !== "object") return null;
  const candidates = [
    p.remote_debugging_address,
    p.remote_debugging_port,
    p.debug_port,
    p.debugger_address,
    p?.data?.remote_debugging_address,
    p?.data?.remote_debugging_port,
    p?.data?.debug_port,
  ];
  for (const raw of candidates) {
    if (raw == null || raw === "") continue;
    if (typeof raw === "string" && raw.includes(":")) {
      const n = Number(raw.split(":").pop());
      if (Number.isFinite(n) && n > 0) return n;
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function resolveBrowserBySessionHash({
  sessionHash,
  username,
  nonce,
  challengeTs,
  storageBeacon,
  cookies,
}) {
  const started = Date.now();
  // Hoisted so `finish` can reference it even if it were called earlier.
  const storagePath = getGpmStoragePath();

  const finish = async (payload) => {
    console.log(
      `[Agent:resolveBrowser] finish ok=${!!payload.ok} reason=${payload.reason || "n/a"} ` +
      `id=${String(payload.gpmProfileId || "").slice(0, 8) || "-"} via=${payload.matchedVia || "-"} ` +
      `user=@${username || "?"} elapsed=${Date.now() - started}ms`
    );
    const attest = signResolveAttest({
      sessionHash,
      gpmProfileId: payload.gpmProfileId || "",
      reason: payload.reason || "",
      nonce,
      challengeTs,
    });
    try {
      const base = { ...payload, ...attest };
      if (!base.ok || !base.gpmProfileId) return base;
      if (Array.isArray(cookies) && cookies.length > 0) {
        saveProfileSession(base.gpmProfileId, cookies);
        console.log(`[Agent:resolveBrowser] Auto-saved ${cookies.length} live session cookies for ${base.gpmProfileId}`);
      }
      const meta = storagePath
        ? readGpmProfileMetaFromDisk(storagePath, base.gpmProfileId)
        : { name: null, groupName: null, groupId: null };
      const gpmProfileName = base.gpmProfileName || meta.name || null;
      let gpmGroupName = base.gpmGroupName || meta.groupName || null;

      if (!gpmGroupName && meta.groupId) {
        if (!gpmGroupsCache.byId.size) loadGpmGroupsDiskCache();
        const gid = String(meta.groupId);
        if (gpmGroupsCache.byId.has(gid)) gpmGroupName = gpmGroupsCache.byId.get(gid);
      }

      if (!gpmGroupName && meta.groupId) {
        let apiBase = lastGoodGpmBase;
        if (!apiBase && Date.now() > gpmApiOfflineUntil) {
          try {
            const discovered = await discoverGpmApiBase().catch(() => ({ online: false }));
            if (discovered.online && discovered.base) {
              apiBase = discovered.base;
              lastGoodGpmBase = apiBase;
            } else {
              gpmApiOfflineUntil = Date.now() + 20_000;
            }
          } catch { gpmApiOfflineUntil = Date.now() + 20_000; }
        }
        if (apiBase || gpmGroupsCache.byId.size) {
          gpmGroupName = await Promise.race([
            lookupGpmGroupName(apiBase, meta.groupId),
            new Promise((resolve) => setTimeout(() => resolve(null), 800)),
          ]);
        }
      }

      console.log(
        `[Agent:resolveBrowser] enriched name="${gpmProfileName || ""}" group="${gpmGroupName || ""}" ` +
        `groupId=${meta.groupId || "-"}`
      );

      return {
        ...base,
        gpmProfileName,
        gpmGroupName: gpmGroupName || undefined,
        gpmGroupId: meta.groupId || undefined,
      };
    } catch {
      return { ...payload, ...attest };
    }
  };

  console.log(
    `[Agent:resolveBrowser] start user=@${username || "?"} beacon=${storageBeacon ? storageBeacon.slice(0, 12) + "…" : "none"} ` +
    `cookies=${Array.isArray(cookies) ? cookies.length : 0} hash=${String(sessionHash).slice(0, 10)}…`
  );

  if (storageBeacon && storagePath) {
    let candidates = await listOpenProfilesFromDisk(storagePath);
    const usedAllDirs = !candidates.length;
    if (usedAllDirs) candidates = listAllGpmProfileDirs(storagePath);
    console.log(
      `[Agent:resolveBrowser] beacon-pass1 candidates=${candidates.length} usedAllDirs=${usedAllDirs}`
    );
    if (candidates.length) {
      const beaconHits = await findOpenProfileByStorageBeacon(storagePath, candidates, storageBeacon);
      console.log(
        `[Agent:resolveBrowser] beacon-pass1 hits=${beaconHits.length}` +
        (beaconHits[0] ? ` id=${String(beaconHits[0].id).slice(0, 8)}` : "")
      );
      if (beaconHits.length === 1) {
        return finish({
          ok: true,
          gpmProfileId: beaconHits[0].id,
          gpmProfileName: beaconHits[0].name,
          matchedVia: "session",
          username: username || undefined,
        });
      }
      if (beaconHits.length > 1) return finish({ ok: false, reason: "ambiguous" });
    }
  }

  const SNAPSHOT_TTL_MS = 2500;
  let gpm = openProfilesSnapshot.gpm;
  let profiles = [];
  let apiOnline = openProfilesSnapshot.apiOnline;
  let openProfiles = [];
  let scanAllDirsOnly = false;

  if (
    Date.now() - openProfilesSnapshot.at < SNAPSHOT_TTL_MS &&
    openProfilesSnapshot.openProfiles.length &&
    !openProfilesSnapshot.scanAllDirsOnly
  ) {
    openProfiles = openProfilesSnapshot.openProfiles;
    apiOnline = openProfilesSnapshot.apiOnline;
    gpm = openProfilesSnapshot.gpm || { online: false, base: null };
  } else {
    gpm = await discoverGpmApiBase();
    apiOnline = !!(gpm.online && gpm.base);

    if (apiOnline) {
      try {
        const resp = await fetch(
          `${gpm.base}/profiles?page=1&per_page=200&page_size=200`,
          { signal: AbortSignal.timeout(6000) }
        );
        const json = await resp.json().catch(() => ({}));
        const rows = normalizeGpmProfileRows(json);
        if (rows) profiles = rows;
        else apiOnline = false;
      } catch { apiOnline = false; }
    }

    const processOpenIds = await listOpenProfileIdsFromProcesses(storagePath);
    if (profiles.length) {
      openProfiles = profiles.filter((p) => {
        if (!p?.id) return false;
        if (profileLooksRunning(p)) return true;
        if (processOpenIds.has(String(p.id))) return true;
        if (storagePath && hasProfileOpenLock(storagePath, p.id)) return true;
        return false;
      });
    }

    // Always union disk-open folders. Brand-new GPM profiles often appear on disk
    // (and have SingletonLock) before they show up in GPM API list (e.g. 10 disk vs 7 API).
    const diskOpen = await listOpenProfilesFromDisk(storagePath);
    if (diskOpen.length) {
      const seen = new Set(openProfiles.map((p) => String(p.id).toLowerCase()));
      let merged = 0;
      for (const p of diskOpen) {
        const id = String(p.id || "");
        if (!id || seen.has(id.toLowerCase())) continue;
        openProfiles.push(p);
        seen.add(id.toLowerCase());
        merged += 1;
      }
      if (merged) {
        console.log(`[Agent:resolveBrowser] merged ${merged} disk-open profile(s) not in API filter`);
      }
    }

    if (!openProfiles.length) openProfiles = diskOpen;

    if (!openProfiles.length && profiles.length && storageBeacon) {
      openProfiles = profiles.filter((p) => p?.id).map((p) => ({
        id: String(p.id),
        name: p.name || p.raw_name || `Profile ${p.id}`,
      }));
      scanAllDirsOnly = true;
    }

    if (!openProfiles.length && storagePath && storageBeacon) {
      openProfiles = listAllGpmProfileDirs(storagePath);
      scanAllDirsOnly = true;
    }

    openProfilesSnapshot = {
      at: Date.now(),
      storagePath,
      // Keep candidates even for scanAllDirsOnly so TTL cache isn't empty.
      openProfiles,
      scanAllDirsOnly,
      apiOnline,
      gpm,
    };
  }

  console.log(
    `[Agent:resolveBrowser] openProfiles=${openProfiles.length} apiOnline=${apiOnline} ` +
    `scanAllDirsOnly=${scanAllDirsOnly} process/api-filtered`
  );

  if (!openProfiles.length) {
    console.log(`[Agent:resolveBrowser] empty openProfiles → ${apiOnline ? "no_match" : "gpm_offline"}`);
    return finish({ ok: false, reason: apiOnline ? "no_match" : "gpm_offline" });
  }

  if (storageBeacon && storagePath) {
    const beaconHits = await findOpenProfileByStorageBeacon(storagePath, openProfiles, storageBeacon);
    console.log(
      `[Agent:resolveBrowser] beacon-pass2 hits=${beaconHits.length}` +
      (beaconHits[0] ? ` id=${String(beaconHits[0].id).slice(0, 8)}` : "")
    );
    if (beaconHits.length === 1) {
      return finish({
        ok: true,
        gpmProfileId: beaconHits[0].id,
        gpmProfileName: beaconHits[0].name,
        matchedVia: "session",
        username: username || undefined,
      });
    }
    if (beaconHits.length > 1) return finish({ ok: false, reason: "ambiguous" });
  }

  if (scanAllDirsOnly) {
    const want = String(username || "").replace(/^@/, "").trim().toLowerCase();
    if (want && storagePath) {
      const byHandle = [];
      for (const p of openProfiles) {
        try {
          const h = await findTikTokHandleInProfileAsync(path.join(storagePath, String(p.id)));
          if (h && String(h).toLowerCase() === want) {
            byHandle.push({
              id: String(p.id),
              name: p.name || p.raw_name || `Profile ${p.id}`,
            });
          }
        } catch { /* skip */ }
      }
      if (byHandle.length === 1) {
        return finish({
          ok: true,
          gpmProfileId: byHandle[0].id,
          gpmProfileName: byHandle[0].name,
          matchedVia: "session",
          username: username || undefined,
        });
      }
      if (byHandle.length > 1) return finish({ ok: false, reason: "ambiguous" });
    }
    return finish({ ok: false, reason: "no_match" });
  }

  async function resolveDebugEndpoint(p) {
    const known = extractDebugPortFromProfile(p);
    if (known) return { port: known, profileId: String(p.id), wsUrl: null };
    const diskPort = storagePath && readDevToolsActivePort(storagePath, p.id);
    if (diskPort) return { port: diskPort, profileId: String(p.id), wsUrl: null };
    if (!apiOnline || !gpm?.base) return null;
    try {
      const startRes = await fetch(
        `${gpm.base}/profiles/start/${p.id}?skip_proxy_check=true`,
        { signal: AbortSignal.timeout(RESOLVE_PROFILE_TIMEOUT_MS) }
      );
      const startJson = await startRes.json().catch(() => ({}));
      if (startJson?.success === false) return null;
      const data = startJson?.data || startJson;
      const port = extractDebugPortFromProfile(data);
      const wsUrl = typeof data?.websocket_debugging_url === "string" ? data.websocket_debugging_url : null;
      const profileId = String(data?.profile_id || p.id);
      if ((!port || port <= 0) && !wsUrl) return null;
      return { port, profileId, wsUrl };
    } catch { return null; }
  }

  async function readSessionHashFromEndpoint({ port, wsUrl }) {
    const endpoint = wsUrl || `http://127.0.0.1:${port}`;
    const browser = await chromium.connectOverCDP(endpoint, {
      timeout: RESOLVE_PROFILE_TIMEOUT_MS,
    });
    try {
      const contexts = browser.contexts();
      if (!contexts.length) return null;
      const cookies = await contexts[0].cookies("https://www.tiktok.com");
      const sessionCookie = cookies.find((c) => ["sessionid", "sessionid_ss", "sid_tt"].includes(c.name));
      if (!sessionCookie?.value) return null;
      return hashSessionCookieValue(sessionCookie.value);
    } finally {
      try { await cap(browser.close(), 2000); } catch { /* ignore */ }
    }
  }

  const matches = [];
  for (const p of openProfiles) {
    if (Date.now() - started > RESOLVE_OVERALL_TIMEOUT_MS) {
      return finish({ ok: false, reason: "timeout" });
    }
    try {
      const hit = await withTimeout(
        (async () => {
          const ep = await resolveDebugEndpoint(p);
          if (!ep) return null;
          const hash = await readSessionHashFromEndpoint(ep);
          if (hash !== sessionHash) return null;
          return { id: ep.profileId, name: p.name || p.raw_name || `Profile ${ep.profileId}` };
        })(),
        RESOLVE_PROFILE_TIMEOUT_MS,
        "profile_timeout"
      );
      if (hit) matches.push(hit);
    } catch { /* skip hung profile */ }
  }

  if (matches.length === 1) {
    return finish({
      ok: true,
      gpmProfileId: matches[0].id,
      gpmProfileName: matches[0].name,
      matchedVia: "session",
      username: username || undefined,
    });
  }
  if (matches.length > 1) return finish({ ok: false, reason: "ambiguous" });

  const want = String(username || "").replace(/^@/, "").trim().toLowerCase();
  if (want && storagePath && openProfiles.length) {
    const byHandle = [];
    for (const p of openProfiles) {
      try {
        const h = await findTikTokHandleInProfileAsync(path.join(storagePath, String(p.id)));
        if (h && String(h).toLowerCase() === want) {
          byHandle.push({
            id: String(p.id),
            name: p.name || p.raw_name || `Profile ${p.id}`,
          });
        }
      } catch { /* skip */ }
    }
    if (byHandle.length === 1) {
      return finish({
        ok: true,
        gpmProfileId: byHandle[0].id,
        gpmProfileName: byHandle[0].name,
        matchedVia: "session",
        username: username || undefined,
      });
    }
    if (byHandle.length > 1) return finish({ ok: false, reason: "ambiguous" });
  }

  return finish({ ok: false, reason: "no_match" });
}

// ==========================================
// 4. READ-ONLY TIKTOK HANDLE DETECTION
// ==========================================
const NON_USER_PATH_SEGMENTS = new Set([
  "foryou", "following", "friends", "live", "explore", "search", "messages",
  "inbox", "upload", "setting", "settings", "privacy", "embed", "music", "tag",
  "place", "effect", "coin", "balance", "wallet", "login", "signup", "about",
  "creators", "business", "developers", "legal", "feedback", "discover",
  "channel", "shop", "tiktokstudio", "creator-center",
]);

function isPlausibleTikTokHandle(raw) {
  if (!raw) return false;
  const h = String(raw).replace(/^@/, "").trim();
  if (h.length < 2 || h.length > 24) return false;
  if (!/^[a-zA-Z0-9._]+$/.test(h)) return false;
  if (/https?$/i.test(h)) return false;
  if (NON_USER_PATH_SEGMENTS.has(h.toLowerCase())) return false;
  // Reject base64-ish / binary false positives (e.g. c2ODQ2NTkxMjExMjA).
  // Real TikTok handles are overwhelmingly lowercase; heavy mixed-case + digits is noise.
  const upper = (h.match(/[A-Z]/g) || []).length;
  const lower = (h.match(/[a-z]/g) || []).length;
  const digit = (h.match(/[0-9]/g) || []).length;
  if (upper >= 3 && lower >= 1 && digit >= 1 && upper / h.length >= 0.25) return false;
  if (upper >= 5 && !h.includes(".") && !h.includes("_")) return false;
  // Must contain at least one letter (pure numeric snowflakes are not @handles from History).
  if (lower + upper === 0) return false;
  return true;
}

function scoreLoggedInHandleFromArtifacts(blob) {
  const scores = new Map();
  const bump = (raw, weight) => {
    if (!isPlausibleTikTokHandle(raw)) return;
    const casing = String(raw).replace(/^@/, "").trim();
    const key = casing.toLowerCase();
    const prev = scores.get(key);
    if (prev) prev.score += weight;
    else scores.set(key, { score: weight, casing });
  };

  for (const m of blob.matchAll(/"UniqId"\s*:\s*"([a-zA-Z0-9._]{2,24})"/g)) bump(m[1], 100);
  for (const m of blob.matchAll(/"uniqueId"\s*:\s*"([a-zA-Z0-9._]{2,24})"/g)) bump(m[1], 60);
  for (const m of blob.matchAll(/"unique_id"\s*:\s*"([a-zA-Z0-9._]{2,24})"/g)) bump(m[1], 60);
  for (const m of blob.matchAll(/"screen_name"\s*:\s*"([a-zA-Z0-9._]{2,24})"/g)) bump(m[1], 40);
  for (const m of blob.matchAll(/(?:tiktokstudio|creator-center|Creator_Center)[\s\S]{0,160}?@([a-zA-Z0-9._]{2,24})(?![a-zA-Z0-9._])/gi)) bump(m[1], 25);
  for (const m of blob.matchAll(/refer_title":"\/@([a-zA-Z0-9._]{2,24})"/g)) bump(m[1], 1);
  for (const m of blob.matchAll(/\(@([a-zA-Z0-9._]{2,24})\)/g)) bump(m[1], 3);
  for (const m of blob.matchAll(/https:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._]{2,24})(?![a-zA-Z0-9._])/g)) bump(m[1], 1);

  let best = null;
  let second = 0;
  for (const val of scores.values()) {
    if (!best || val.score > best.score) {
      if (best) second = Math.max(second, best.score);
      best = val;
    } else if (val.score > second) second = val.score;
  }
  if (!best || best.score < 2) return null;
  if (best.score >= 60) return best.casing;
  if (best.score - second >= 3 && best.score >= 5) return best.casing;
  return null;
}

/** Read up to maxBytes from a file (never loads the whole file). Falls back to copyFile on EBUSY. */
export async function readBestEffortAsync(src, maxBytes = 8 * 1024 * 1024) {
  try {
    const handle = await fs.promises.open(src, "r");
    try {
      const st = await handle.stat();
      const len = Math.min(st.size, maxBytes);
      if (len <= 0) return "";
      const buf = Buffer.alloc(len);
      await handle.read(buf, 0, len, 0);
      return buf.toString("latin1");
    } finally { await handle.close(); }
  } catch { /* locked or missing — try copy fallback */ }

  const tmp = path.join(os.tmpdir(), `ttf-rd-${crypto.randomBytes(6).toString("hex")}`);
  try {
    await fs.promises.copyFile(src, tmp);
    const handle = await fs.promises.open(tmp, "r");
    try {
      const st = await handle.stat();
      const len = Math.min(st.size, maxBytes);
      const buf = Buffer.alloc(len);
      await handle.read(buf, 0, len, 0);
      return buf.toString("latin1");
    } finally { await handle.close(); }
  } catch {
    return null;
  } finally {
    try { await fs.promises.unlink(tmp); } catch { /* ignore */ }
  }
}

export async function findTikTokHandleInProfileAsync(profileDir) {
  try {
    const defaultDir = path.join(profileDir, "Default");
    if (!fs.existsSync(defaultDir)) return null;

    const chunks = [];
    const historyPath = path.join(defaultDir, "History");
    if (fs.existsSync(historyPath)) {
      const t = await readBestEffortAsync(historyPath, 16 * 1024 * 1024);
      if (t) chunks.push(t);
    }

    const levelDbDir = path.join(defaultDir, "Local Storage", "leveldb");
    if (fs.existsSync(levelDbDir)) {
      try {
        const files = await fs.promises.readdir(levelDbDir);
        for (const f of files) {
          if (!f.endsWith(".log") && !f.endsWith(".ldb")) continue;
          const t = await readBestEffortAsync(path.join(levelDbDir, f));
          if (t) chunks.push(t);
        }
      } catch { /* ignore */ }
    }

    for (const rel of ["Preferences", "Secure Preferences", "Network/Cookies", "Cookies"]) {
      const p = path.join(defaultDir, rel);
      if (!fs.existsSync(p)) continue;
      const t = await readBestEffortAsync(p);
      if (t) chunks.push(t);
    }

    if (!chunks.length) return null;
    return scoreLoggedInHandleFromArtifacts(chunks.join("\n"));
  } catch { /* ignore */ }
  return null;
}

// ==========================================
// 5. ISOLATED READ-ONLY SNAPSHOT ENGINE
// ==========================================
async function copyFileWithRetryAsync(src, dest, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await fs.promises.copyFile(src, dest);
      return { ok: true };
    } catch (err) {
      if (attempt < maxRetries - 1 && (err.code === "EBUSY" || err.code === "EPERM")) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      return { ok: false, code: err.code };
    }
  }
  return { ok: false };
}

export async function createMinimalProfileSnapshot(profileDir, profileId) {
  if (!fs.existsSync(profileDir)) return null;
  let tempDir = null;
  let cookiesLocked = false;
  try {
    const baseParent = path.dirname(profileDir);
    const tempRoot = fs.existsSync(baseParent) ? path.join(baseParent, ".gpm_temp") : os.tmpdir();
    await fs.promises.mkdir(tempRoot, { recursive: true });
    tempDir = await fs.promises.mkdtemp(path.join(tempRoot, `agent-min-${String(profileId).slice(0, 8)}-`));
    activeTempDirs.add(path.resolve(tempDir));

    const copySafe = async (relPath) => {
      const s = path.join(profileDir, relPath);
      if (!fs.existsSync(s)) return true;
      const d = path.join(tempDir, relPath);
      await fs.promises.mkdir(path.dirname(d), { recursive: true });
      const res = await copyFileWithRetryAsync(s, d);
      if (!res.ok && /cookies/i.test(relPath)) cookiesLocked = true;
      return res.ok;
    };

    await copySafe("Local State");
    await copySafe("gpm_pi.dat");
    await copySafe("Default/Preferences");
    await copySafe("Default/Secure Preferences");
    await copySafe("Default/Network/Cookies");
    await copySafe("Default/Network/Cookies-journal");
    await copySafe("Default/Network/Cookies-wal");
    await copySafe("Default/Network/Network Persistent State");
    await copySafe("Default/Cookies");
    await copySafe("Default/Cookies-journal");
    await copySafe("Default/Cookies-wal");
    await copySafe("Default/Web Data");
    await copySafe("Default/Login Data");

    const levelDbDir = path.join(profileDir, "Default", "Local Storage", "leveldb");
    if (fs.existsSync(levelDbDir)) {
      try {
        const files = await fs.promises.readdir(levelDbDir);
        for (const f of files) {
          if (f === "LOCK" || f.endsWith(".lock")) continue;
          await copySafe(path.join("Default", "Local Storage", "leveldb", f));
        }
      } catch { /* ignore */ }
    }

    const sessDbDir = path.join(profileDir, "Default", "Session Storage");
    if (fs.existsSync(sessDbDir)) {
      try {
        const files = await fs.promises.readdir(sessDbDir);
        for (const f of files) {
          if (f === "LOCK" || f.endsWith(".lock")) continue;
          await copySafe(path.join("Default", "Session Storage", f));
        }
      } catch { /* ignore */ }
    }

    return { tempDir, cookiesLocked };
  } catch (err) {
    cleanupTempDir(tempDir);
    return { tempDir: null, error: err.message };
  }
}

// ==========================================
// 6. CONTROLLED CONCURRENCY (pMap)
// ==========================================
async function pMap(items, mapper, concurrency = 2) {
  const results = [];
  const executing = new Set();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const p = Promise.resolve().then(() => mapper(item, i));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= concurrency) await Promise.race(executing);
  }
  return Promise.all(results);
}

// ==========================================
// 7. HIGH-PERFORMANCE STUDIO EXTRACTOR
// ==========================================
async function scrapePageMetrics(page, context, profileDir, profileId, detectedHandle, methodLabel = "snapshot") {
  try {
    const t_start = Date.now();
    let t_nav = 0, t_insights = 0, t_m10n = 0;

    let userInfo = null;
    let followerCount = 0;
    let rawPostList = [];
    let interceptedRewardAnalytics = null;
    let interceptedPerPostRewards = [];
    let interceptedPerPostUrl = null;
    let interceptedVideoRewardAnalytics = null;
    let interceptedInsightsHistory = null;
    let interceptedVideoCalls = [];
    let interceptedVideoReqHeaders = null;
    let interceptedVideoReqMethod = "GET";
    let interceptedVideoReqBody = null;
    let m10nRateLimited = false;
    let m10nHadAnalytics = false;
    let postRewardsPartial = false;
    let rewardsFailReason = null; // "rate_limited" | "incomplete_list" | "timeout"
    let rewardsNoProgram = false;

    page.on("request", (req) => {
      const url = req.url();
      if (
        !interceptedVideoReqHeaders &&
        (url.includes("item_list") || url.includes("post_list") || url.includes("/content/manage")) &&
        (url.includes("tiktok") || url.includes("tiktokstudio"))
      ) {
        try {
          interceptedVideoReqHeaders = req.headers();
          interceptedVideoReqMethod = req.method();
          interceptedVideoReqBody = req.postData();
        } catch { /* ignore */ }
      }
    });

    page.on("response", async (resp) => {
      const url = resp.url();
      try {
        if (url.includes("/tiktokstudio/api/web/user") && !url.includes("aid=")) {
          const j = await resp.json();
          if (j.userBaseInfo?.UserProfile?.UserBase) userInfo = j.userBaseInfo.UserProfile.UserBase;
        }
        if (url.includes("multiGetFollowRelationCount")) {
          const j = await resp.json();
          if (j.FollowerCount) {
            const firstVal = Object.values(j.FollowerCount)[0];
            if (firstVal !== undefined) followerCount = parseInt(firstVal, 10) || 0;
          }
        }
        if (url.includes("reward_analytics_per_post")) {
          try {
            const j = await resp.json();
            const payload = j.data || j;
            if (Array.isArray(payload.video_analytics_video_list)) {
              interceptedPerPostRewards.push(...payload.video_analytics_video_list);
            }
            interceptedPerPostUrl = url;
          } catch { /* ignore */ }
        } else if (url.includes("/m10n_center/reward_analytics")) {
          const j = await resp.json();
          const payload = j.data || j;
          if (payload.daily_estimated_income || payload.seven_d_income) {
            interceptedRewardAnalytics = payload;
            m10nHadAnalytics = true;
          }
        }
        if (url.includes("video_reward_analytics")) {
          const j = await resp.json();
          const payload = j.data || j;
          if (payload.crp_analytics_data || payload.ttshop_analytics_data) {
            interceptedVideoRewardAnalytics = payload;
          }
        }
        if (url.includes("/aweme/v2/data/insight/")) {
          const j = await resp.json();
          if (j.vv_history || j.like_history) interceptedInsightsHistory = j;
        }
        if (
          url.includes("item_list") || url.includes("post_list") ||
          url.includes("/content/manage") || url.includes("/content/list") ||
          url.includes("/manage/item_list")
        ) {
          try {
            const j = await resp.json();
            const list = j?.itemList || j?.items || j?.item_list || j?.post_list || j?.postList ||
              j?.data?.item_list || j?.data?.itemList || j?.data?.post_list || j?.data?.items || [];
            if (Array.isArray(list) && list.length > 0) {
              interceptedVideoCalls.push({
                has_more: j.has_more ?? j.data?.has_more,
                cursor: j.cursor ?? j.data?.cursor,
                items: list,
                url,
              });
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    });

    const t_nav_start = Date.now();
    await page.goto("https://www.tiktok.com/tiktokstudio/content", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    }).catch(() => { });
    t_nav = Date.now() - t_nav_start;

    const isLoginPage = /login|passport/i.test(page.url()) ||
      (await page.title().catch(() => "")).includes("Log in");
    if (isLoginPage) {
      return { success: false, error: "Profile chua dang nhap TikTok hoac phien dang nhap da het han." };
    }

    let passportCountryRaw = null;
    try {
      passportCountryRaw = await page.evaluate(async () => {
        try {
          const res = await fetch("https://www.tiktok.com/passport/web/account/info/?app_id=1233", {
            credentials: "include",
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) return null;
          const json = await res.json();
          const d = json?.data;
          const val = d?.store_country || d?.country_code || d?.country || null;
          if (val && /^\d+$/.test(String(val))) return null;
          return val;
        } catch { return null; }
      }).catch(() => null);
    } catch { /* ignore */ }

    let cookieCountryRaw = null;
    try {
      const allCookies = await context.cookies(["https://www.tiktok.com", "https://tiktok.com"]);
      const storeCookie = allCookies.find((c) => c.name === "store-country-code");
      if (storeCookie?.value) cookieCountryRaw = storeCookie.value;
    } catch { /* ignore */ }

    const pageCountryHints = await page.evaluate(() => {
      let region = null;
      let storeCountry = null;
      try {
        const m = document.cookie.match(/(?:^|; )store-country-code=([^;]*)/);
        if (m) storeCountry = decodeURIComponent(m[1]);
      } catch { /* ignore */ }
      try {
        const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
        if (el?.textContent) {
          const parsed = JSON.parse(el.textContent);
          const scope = parsed["__DEFAULT_SCOPE__"] || {};
          const ctx = scope["webapp.app-context"] || {};
          region = ctx.appContext?.region || ctx.appContext?.priority_region || ctx.user?.region || null;
        }
      } catch { /* ignore */ }
      return { region, storeCountry };
    }).catch(() => ({ region: null, storeCountry: null }));

    const allVideosMap = new Map();
    let initialHasMore = false;

    const stableVideoKey = (item) => {
      // Prefer string IDs — numeric video_id past Number.MAX_SAFE_INTEGER loses precision
      // (e.g. 7672354208556797206 → 7672354208556797000) and breaks reward merges.
      for (const c of [
        item?.video_id_str,
        item?.item_id,
        item?.aweme_id,
        item?.id,
        item?.video_id,
      ]) {
        if (c == null || c === "") continue;
        if (typeof c === "string" && /^\d{5,}$/.test(c)) return c;
        if (typeof c === "number") {
          if (Number.isSafeInteger(c)) return String(c);
          continue;
        }
        if (typeof c === "bigint") return String(c);
        const s = String(c);
        if (/^\d{5,}$/.test(s)) return s;
      }
      const ts = item?.createTime || item?.create_time || item?.publish_date_unix_time || item?.post_time || 0;
      const desc = item?.desc || item?.title || "";
      return `_ts_${ts}_${String(desc).slice(0, 60)}`;
    };

    const engagementScore = (item) => {
      if (!item || typeof item !== "object") return 0;
      const stats = item.statistics || item.stats || {};
      const play =
        Number(item.play_count) ||
        Number(item.playCount) ||
        Number(stats.play_count) ||
        Number(stats.playCount) ||
        Number(item.views) ||
        0;
      const like =
        Number(item.like_count) ||
        Number(item.likeCount) ||
        Number(item.digg_count) ||
        Number(stats.digg_count) ||
        0;
      return (Number.isFinite(play) ? play : 0) * 1000 + (Number.isFinite(like) ? like : 0);
    };

    const upsertVideoItem = (item) => {
      const key = stableVideoKey(item);
      if (!key) return;
      const prev = allVideosMap.get(key);
      if (!prev || engagementScore(item) >= engagementScore(prev)) {
        allVideosMap.set(key, item);
      }
    };

    const parseCreatorCenterContext = async () => {
      return await page.evaluate(() => {
        const el = document.getElementById("__Creator_Center_Context__");
        if (!el || !el.textContent) return null;
        try {
          const s = el.textContent.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          const parsed = JSON.parse(s);
          const candidates = [
            parsed.firstBatchQueryItems?.item_list,
            parsed.firstBatchQueryItems?.itemList,
            parsed.firstBatchQueryItems?.items,
            parsed.firstBatchQueryItems?.post_list,
            parsed.post_list,
            parsed.postList,
            parsed.item_list,
            parsed.itemList,
            parsed.items,
            parsed.data?.firstBatchQueryItems?.item_list,
            parsed.data?.item_list,
          ];
          const items = [];
          for (const batch of candidates) if (Array.isArray(batch) && batch.length > 0) items.push(...batch);
          const hasMore = !!(parsed.firstBatchQueryItems?.has_more ?? parsed.has_more);
          return { items, hasMore };
        } catch { return null; }
      }).catch(() => null);
    };

    const readStudioTabCount = async () => {
      return await page.evaluate(() => {
        const parseN = (raw) => {
          const n = parseInt(String(raw || "").replace(/,/g, ""), 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        };
        const found = [];
        const push = (n) => { if (n && n > 0) found.push(n); };
        const text = document.body?.innerText || "";
        const patterns = [
          /(?:Bài đăng|Posts?|Videos?|投稿|동영상|視頻|视频)\s*\(?\s*([\d,]+)\s*\)?/gi,
          /([\d,]+)\s+(?:bài đăng|posts?|videos?)/gi,
        ];
        for (const re of patterns) {
          let m;
          while ((m = re.exec(text)) !== null) push(parseN(m[1]));
        }
        for (const el of document.querySelectorAll('button, a, [role="tab"], span, div')) {
          const t = String(el.textContent || "").replace(/\s+/g, " ").trim();
          if (!t || t.length > 48) continue;
          const m =
            t.match(/^(?:Bài đăng|Posts?|Videos?)\s*\(?\s*([\d,]+)\s*\)?$/i) ||
            t.match(/^([\d,]+)\s*(?:Bài đăng|Posts?)$/i);
          if (m) push(parseN(m[1]));
        }
        try {
          const el = document.getElementById("__Creator_Center_Context__");
          if (el?.textContent) {
            const s = el.textContent
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">");
            const parsed = JSON.parse(s);
            const candidates = [
              parsed.total,
              parsed.total_count,
              parsed.item_count,
              parsed.post_count,
              parsed.firstBatchQueryItems?.total,
              parsed.firstBatchQueryItems?.total_count,
              parsed.data?.total,
              parsed.data?.total_count,
            ];
            for (const c of candidates) push(parseN(c));
          }
        } catch { /* ignore */ }
        // Prefer the largest Posts(N) — first match can be a small filtered chip.
        return found.length ? Math.max(...found) : null;
      }).catch(() => null);
    };

    const fetchStudioItemListTotal = async () => {
      return await page.evaluate(async () => {
        try {
          const pickQs = () => {
            const qs = new URLSearchParams();
            try {
              for (const e of performance.getEntriesByType("resource")) {
                const name = e.name || "";
                if (!/item_list|post_list|creator\/manage/i.test(name)) continue;
                const u = new URL(name, location.origin);
                for (const [k, v] of u.searchParams.entries()) {
                  if (v != null && v !== "") qs.set(k, v);
                }
                if ([...qs.keys()].length) break;
              }
            } catch { /* ignore */ }
            if (!qs.has("count")) qs.set("count", "1");
            if (!qs.has("aid")) qs.set("aid", "1988");
            return qs;
          };
          const qs = pickQs();
          const url = `/tiktok/creator/manage/item_list/v1/?${qs.toString()}`;
          const res = await fetch(url, {
            credentials: "include",
            signal: AbortSignal.timeout(6000),
          });
          if (!res.ok) return null;
          const json = await res.json().catch(() => null);
          const candidates = [
            json?.total,
            json?.total_count,
            json?.item_count,
            json?.post_count,
            json?.data?.total,
            json?.data?.total_count,
            json?.data?.item_count,
          ];
          for (const c of candidates) {
            const n = Number(c);
            if (Number.isFinite(n) && n > 0) return n;
          }
          return null;
        } catch {
          return null;
        }
      }).catch(() => null);
    };

    const contentStartTime = Date.now();
    let studioTotalVideos = 0;
    while (Date.now() - contentStartTime < 7000) {
      const tabCnt = await readStudioTabCount();
      if (typeof tabCnt === "number") studioTotalVideos = tabCnt;

      const ctxResult = await parseCreatorCenterContext();
      if (ctxResult?.items?.length) {
        for (const item of ctxResult.items) upsertVideoItem(item);
        if (ctxResult.hasMore) initialHasMore = true;
      }

      for (const call of interceptedVideoCalls) {
        for (const item of call.items) upsertVideoItem(item);
      }

      // Wait for Studio "Posts (N)" count — do not early-exit at 1.5s when count is
      // still 0 (cookie-bridge headless often needs longer). Falling back to public
      // profile videoCount too early caused mismatches vs extension Tier-0 (e.g. 449 vs 469).
      if (studioTotalVideos > 0 && allVideosMap.size >= studioTotalVideos) break;
      if (allVideosMap.size > 0 && studioTotalVideos > 0 && (Date.now() - contentStartTime > 3500)) break;
      if (allVideosMap.size > 0 && studioTotalVideos === 0 && (Date.now() - contentStartTime > 5500)) break;

      await page.waitForTimeout(300);
    }

    const needsMoreVideos = studioTotalVideos > 0 && allVideosMap.size < studioTotalVideos;
    const hasItemListCall = interceptedVideoCalls.some(
      (c) => c.url && (c.url.includes("item_list") || c.url.includes("post_list"))
    );
    if (needsMoreVideos && !hasItemListCall) {
      const triggerWaitStart = Date.now();
      while (
        !interceptedVideoCalls.some((c) => c.url && c.url.includes("item_list")) &&
        Date.now() - triggerWaitStart < 8000
      ) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          document.querySelectorAll('div[class*="content"], div[class*="list"], main').forEach((el) => {
            el.scrollTop = el.scrollHeight;
          });
        }).catch(() => { });
        for (const call of interceptedVideoCalls) {
          for (const item of call.items) upsertVideoItem(item);
        }
        await page.waitForTimeout(1000);
      }
    }

    // In-page item_list pagination (same approach as Tier-0 extension).
    // page.request replay of signed URLs often 401/403; fetch() in Studio tab works.
    let paginationFailedDueToSigning = false;
    try {
      const inPageList = await page.evaluate(async () => {
        const STUDIO_QS_KEYS = [
          "locale", "aid", "priority_region", "region", "tz_name", "app_name",
          "app_language", "device_platform", "channel", "device_id", "os",
          "screen_width", "screen_height", "browser_language", "browser_platform",
          "browser_name", "browser_version", "msToken",
        ];
        const doFetch = (url, opts = {}) =>
          fetch(url, { credentials: "include", signal: AbortSignal.timeout(12000), ...opts })
            .then(async (r) => {
              if (!r.ok) return { _status: r.status };
              try { return await r.json(); } catch (e) { return { _error: String(e) }; }
            })
            .catch((e) => ({ _error: String(e) }));

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
          let best = null, bestScore = -1;
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
              if (/item_list/i.test(raw)) score += 20;
              if (score > bestScore) { bestScore = score; best = qs; }
            } catch { /* next */ }
          }
          return best;
        };

        {
          const end = Date.now() + 8000;
          while (Date.now() < end) {
            const hit = performance.getEntriesByType("resource").some((e) =>
              /creator\/manage\/item_list|item_list\/v1/i.test(e.name || "")
            );
            if (hit) break;
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
        if (donor) {
          for (const [k, v] of donor.entries()) {
            if (v != null && v !== "") baseQs.set(k, v);
          }
        }

        const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
        const parseItemTs = (item) => {
          const t = item.createTime || item.create_time || item.createtime ||
            item.post_time || item.publish_date_unix_time ||
            item.statistics?.createTime || item.item?.createTime;
          if (!t) return 0;
          const n = Number(t);
          return n > 1e11 ? n : n * 1000;
        };

        const items = [];
        const seen = new Set();
        let apiStudioTotal = 0;
        const ingest = (json) => {
          const list = json?.item_list || json?.itemList || json?.items || json?.post_list ||
            json?.data?.item_list || json?.data?.itemList || json?.data?.post_list || json?.data?.items || [];
          if (!Array.isArray(list)) return { list: [], hasMore: false, nextCursor: null };
          const totalCandidates = [
            json?.total, json?.total_count, json?.item_count, json?.post_count,
            json?.data?.total, json?.data?.total_count, json?.data?.item_count,
          ];
          for (const c of totalCandidates) {
            const n = Number(c);
            if (Number.isFinite(n) && n > apiStudioTotal) apiStudioTotal = n;
          }
          for (const item of list) {
            const id = String(item?.video_id_str || item?.item_id || item?.id || item?.aweme_id || item?.video_id || "");
            if (id && !seen.has(id)) { seen.add(id); items.push(item); }
            else if (!id) items.push(item);
          }
          return {
            list,
            hasMore: !!(json?.has_more ?? json?.data?.has_more),
            nextCursor: json?.cursor ?? json?.data?.cursor,
          };
        };

        const itemListPath = "/tiktok/creator/manage/item_list/v1/";
        let cursor = 0;
        let hasMore = true;
        let pagesFetched = 0;
        let lookbackStopped = false;
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
          let result = ingest(used);
          if (!result.list.length) {
            const g = new URL(itemListPath, location.origin);
            for (const [k, v] of baseQs.entries()) {
              if (k === "msToken" || k === "X-Bogus" || k === "X-Gnarly") continue;
              g.searchParams.set(k, v);
            }
            g.searchParams.set("cursor", String(cursor));
            g.searchParams.set("count", "50");
            g.searchParams.set("size", "50");
            result = ingest(await doFetch(g.toString()));
          }
          if (!result.list.length) {
            if (used?._status === 401 || used?._status === 403) {
              return { items, pagesFetched, lookbackStopped, failedSigning: true, studioTotal: apiStudioTotal };
            }
            break;
          }
          pagesFetched++;
          cursor = typeof result.nextCursor === "number" ? result.nextCursor : cursor + result.list.length;
          hasMore = result.hasMore;
          const timestamps = result.list.map(parseItemTs).filter((t) => t > 0);
          if (timestamps.length > 0) {
            const oldest = Math.min(...timestamps);
            if (Date.now() - oldest > LOOKBACK_MS) {
              hasMore = false;
              lookbackStopped = true;
            }
          }
          await new Promise((r) => setTimeout(r, 300));
        }
        return { items, pagesFetched, lookbackStopped, failedSigning: false, studioTotal: apiStudioTotal };
      }).catch(() => null);

      if (inPageList?.failedSigning) {
        paginationFailedDueToSigning = true;
        console.warn("   [PAGINATION] in-page item_list blocked (401/403). Falling back to scroll capture.");
      } else if (inPageList?.items?.length) {
        // Prefer in-page pages (same source as Tier-0) so we don't keep thinner
        // intercept/SSR leftovers that inflate videosList beyond the lookback window.
        allVideosMap.clear();
        for (const item of inPageList.items) upsertVideoItem(item);
        if (inPageList.studioTotal > studioTotalVideos && inPageList.studioTotal > inPageList.items.length) {
          // item_list "total" under lookback can equal the filtered page size —
          // only accept it when it clearly exceeds the harvested window.
          studioTotalVideos = inPageList.studioTotal;
        }
        console.log(
          `   [PAGINATION] in-page item_list: ${inPageList.items.length} (pages=${inPageList.pagesFetched}` +
          `${inPageList.lookbackStopped ? ", lookback_stop" : ""}) → map=${allVideosMap.size}` +
          `${studioTotalVideos ? `, studioTotal=${studioTotalVideos}` : ""}` +
          `${inPageList.studioTotal ? ` (apiTotal=${inPageList.studioTotal})` : ""}`
        );
      }
    } catch { /* ignore */ }

    // Light scroll harvest only when still thin (match extension Tier-0).
    let lastVideoCount = allVideosMap.size;
    let noNewVideoIterations = 0;
    const shouldScroll = allVideosMap.size < 20 && (
      initialHasMore ||
      interceptedVideoCalls.some((c) => c.has_more) ||
      paginationFailedDueToSigning
    );

    if (shouldScroll) {
      for (let scrollIdx = 0; scrollIdx < 8; scrollIdx++) {
        const lastCall = [...interceptedVideoCalls].reverse().find((c) => c.has_more !== undefined);
        if (lastCall && lastCall.has_more === false && allVideosMap.size >= (studioTotalVideos || 1)) break;
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const scrollables = document.querySelectorAll('div[class*="content"], div[class*="table"], div[class*="Table"], div[class*="scroll"], div[class*="list"], div[class*="tbody"], main');
          scrollables.forEach((el) => { el.scrollTop = el.scrollHeight; });
        }).catch(() => { });
        await page.waitForTimeout(1200);

        for (const call of interceptedVideoCalls) {
          for (const item of call.items) upsertVideoItem(item);
        }

        if (allVideosMap.size === lastVideoCount) {
          noNewVideoIterations++;
          if (noNewVideoIterations >= 3) break;
        } else {
          noNewVideoIterations = 0;
          lastVideoCount = allVideosMap.size;
        }
      }
    }

    rawPostList = Array.from(allVideosMap.values());

    if (rawPostList.length === 0) {
      const domPosts = await page.evaluate(() => {
        const items = [];
        const rows = document.querySelectorAll('tr, [role="row"], [class*="video-item"], [class*="VideoItem"], [class*="item-card"]');
        rows.forEach((r) => {
          const titleEl = r.querySelector('[class*="title"], [class*="desc"], a[href*="/video/"]');
          const viewEl = r.querySelector('[class*="view"], td:nth-child(3)');
          const likeEl = r.querySelector('[class*="like"], td:nth-child(4)');
          const commentEl = r.querySelector('[class*="comment"], td:nth-child(5)');
          const idLink = r.querySelector('a[href*="/video/"]');
          let vidId = "";
          if (idLink) {
            const m = idLink.getAttribute("href")?.match(/\/video\/(\d+)/);
            if (m) vidId = m[1];
          }
          if (titleEl && viewEl) {
            items.push({
              item_id: vidId,
              desc: titleEl.textContent.trim(),
              play_count: viewEl.textContent.trim(),
              like_count: likeEl ? likeEl.textContent.trim() : "0",
              comment_count: commentEl ? commentEl.textContent.trim() : "0",
            });
          }
        });
        return items;
      }).catch(() => []);
      rawPostList = domPosts;
    }

    const cleanNum = (val) => {
      if (val === 0 || val === null || val === undefined) return 0;
      if (typeof val === "number") return val;
      const str = String(val).trim();
      if (!str) return 0;
      // Character class bug fixed: use non-capturing alternation for suffixes.
      if (/(?:m|tr|mio)$/i.test(str)) return Math.round(parseFloat(str.replace(",", ".")) * 1_000_000);
      if (/(?:k|n)$/i.test(str)) return Math.round(parseFloat(str.replace(",", ".")) * 1000);
      return parseInt(str.replace(/[^0-9]/g, ""), 10) || 0;
    };

    const formatDuration = (dur) => {
      if (!dur) return null;
      if (typeof dur === "string" && dur.includes(":")) return dur;
      let sec = Number(dur);
      if (isNaN(sec) || sec <= 0) return null;
      // TikTok item_list returns ms. Values >= 1000 are almost certainly ms;
      // values < 1000 are plausibly seconds (very short clips).
      if (sec >= 1000) sec = sec / 1000;
      const totalSec = Math.floor(sec);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const normalizePostTimestamp = (rawTime) => {
      if (!rawTime) return null;
      const n = Number(rawTime);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n > 1e11 ? n : n * 1000;
    };

    const safeVideoId = (...candidates) => {
      for (const c of candidates) {
        if (c == null || c === "") continue;
        if (typeof c === "string" && /^\d{5,}$/.test(c)) return c;
        if (typeof c === "number") {
          if (Number.isSafeInteger(c)) return String(c);
          continue; // unsafe snowflake — skip rather than corrupt
        }
        if (typeof c === "bigint") return String(c);
        const s = String(c);
        if (/^\d{5,}$/.test(s)) return s;
      }
      return "";
    };

    const videosList = rawPostList.map((p) => {
      const postTimestamp = normalizePostTimestamp(
        p.post_time || p.create_time || p.publish_date_unix_time || p.createTime
      );
      return {
        id: safeVideoId(p.video_id_str, p.item_id, p.id, p.aweme_id, p.video_id),
        title: p.desc || p.title || p.video_name || "No title",
        views: cleanNum(p.play_count || p.playCount || p.views || p.statistics?.play_count || p.statistics?.playCount || p.stats?.playCount || p.stats?.play_count),
        likes: cleanNum(p.like_count || p.likeCount || p.digg_count || p.diggCount || p.statistics?.digg_count || p.statistics?.diggCount || p.stats?.diggCount || p.stats?.digg_count),
        comments: cleanNum(p.comment_count || p.commentCount || p.statistics?.comment_count || p.statistics?.commentCount || p.stats?.commentCount || p.stats?.comment_count),
        shares: cleanNum(p.share_count || p.shareCount || p.statistics?.share_count || p.statistics?.shareCount || p.stats?.shareCount || p.stats?.share_count),
        duration: formatDuration(p.video_duration || p.duration),
        postTime: postTimestamp ? new Date(postTimestamp).toISOString() : null,
        createTime: postTimestamp ? Math.floor(postTimestamp / 1000) : null,
        postDate: postTimestamp ? new Date(postTimestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
        coverUrl: Array.isArray(p.cover_url) ? p.cover_url[0]
          : (typeof p.cover_url === "string" ? p.cover_url
            : (p.video_thumbnail || p.cover?.url_list?.[0] || p.video?.cover?.url_list?.[0] || null)),
      };
    }).filter((v) => !!v.id || v.title !== "No title");

    const totalViewsCombined = videosList.reduce((sum, v) => sum + v.views, 0);

    // Always re-read Studio Posts(N) — authoritative library size. Do not skip
    // just because item_list returned a small/filtered "total" (lookback window).
    try {
      if (!/tiktokstudio\/content/i.test(page.url())) {
        await page.goto("https://www.tiktok.com/tiktokstudio/content", {
          waitUntil: "domcontentloaded",
          timeout: 12000,
        }).catch(() => { });
        await page.waitForTimeout(1800);
      } else {
        await page.waitForTimeout(800);
      }
      const tabCount = await readStudioTabCount();
      if (typeof tabCount === "number" && tabCount > studioTotalVideos) {
        studioTotalVideos = tabCount;
      }
    } catch { /* ignore */ }
    if (!studioTotalVideos) {
      try {
        const apiTotal = await fetchStudioItemListTotal();
        // Reject totals that merely mirror the harvested window.
        if (typeof apiTotal === "number" && apiTotal > videosList.length) {
          studioTotalVideos = apiTotal;
        }
      } catch { /* ignore */ }
    }
    if (studioTotalVideos > 0) {
      console.log(`   [STUDIO] Posts total=${studioTotalVideos} (list=${videosList.length})`);
    }

    let sessionHandle = userInfo?.UniqId || null;
    if (!sessionHandle) {
      try {
        const passRes = await page.goto(
          "https://www.tiktok.com/passport/web/account/info/?app_id=1233",
          { waitUntil: "domcontentloaded", timeout: 10000 }
        ).catch(() => null);
        if (passRes) {
          const info = await page.evaluate(() => {
            try { return JSON.parse(document.body?.innerText || "{}"); } catch { return null; }
          }).catch(() => null);
          sessionHandle = info?.data?.username || info?.data?.screen_name || null;
        }
        await page.goto("https://www.tiktok.com/tiktokstudio/content", {
          waitUntil: "domcontentloaded",
          timeout: 12000,
        }).catch(() => { });
      } catch { /* ignore */ }
    }

    const finalHandle = sessionHandle || detectedHandle || null;

    if (detectedHandle && sessionHandle && detectedHandle.toLowerCase() !== String(sessionHandle).toLowerCase()) {
      console.warn(`   [!] Disk handle @${detectedHandle} != session @${sessionHandle} — using session identity`);
    }
    if (!finalHandle) {
      return {
        success: false,
        error: "Khong xac minh duoc username dang nhap (Studio UniqId / passport).",
      };
    }

    let publicStats = null;
    try {
      publicStats = await page.evaluate(async (handle) => {
        try {
          const res = await fetch(`https://www.tiktok.com/@${handle}`, {
            credentials: "include",
            signal: AbortSignal.timeout(6000),
          });
          if (!res.ok) return null;
          const html = await res.text();
          const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
          if (match) {
            const parsed = JSON.parse(match[1]);
            return parsed["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.stats || null;
          }
        } catch { /* ignore */ }
        return null;
      }, finalHandle).catch(() => null);
    } catch { /* ignore */ }

    let views7d = 0, views28d = 0, views60d = 0, views365d = 0;
    let likes7d = 0, likes28d = 0, likes60d = 0, likes365d = 0;
    let comments7d = 0, comments28d = 0, comments60d = 0, comments365d = 0;
    let shares7d = 0, shares28d = 0, shares60d = 0, shares365d = 0;
    let profileViews7d = 0, profileViews28d = 0, profileViews60d = 0, profileViews365d = 0;
    let insightsStatus = "unavailable"; // "ok" | "no_data" | "unavailable"
    let insightsFailReason = null; // session|captcha|timeout|empty_response|unknown
    let insightsFailMarker = null;
    let dailyViewsBreakdown = [];

    /**
     * Studio vv_history is oldest→newest. Trailing status:2 = not finalized yet
     * (Studio excludes them from period cards). Pad requests so trim still leaves
     * a full 7/28/60/365 window.
     */
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

    const t_insights_start = Date.now();
    try {
      const PERIODS = ["7", "28", "60", "365"];

      const evaluateInsightMap = async () => {
        return await page.evaluate(async () => {
          const out = {};
          // Request period + pad so trailing status:2 days don't shrink the window.
          const ranges = [
            { key: "7", days: 14, end_days: 1 },
            { key: "28", days: 35, end_days: 1 },
            { key: "60", days: 67, end_days: 1 },
            { key: "365", days: 372, end_days: 1 },
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
              const res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(6000) });
              const j = await res.json();
              j.__status = res.status;
              out[r.key] = j;
            } catch (e) {
              out[r.key] = { __error: String((e && e.message) || e) };
            }
          }
          return out;
        }).catch(() => ({}));
      };

      // Structurally healthy = vv_history is an ARRAY for every period (empty array is OK).
      const historiesHealthy = (m) => PERIODS.every((k) => Array.isArray(m?.[k]?.vv_history));

      const detectInsightsFailReason = async (m) => {
        const url = page.url();
        if (/login|passport/i.test(url)) return { reason: "session", marker: `url:${url.slice(0, 80)}` };
        const captchaSel = await page.evaluate(() => {
          const sels = [
            "#captcha_container",
            ".captcha_verify_container",
            '[class*="captcha-verify"]',
            'iframe[src*="captcha"]',
          ];
          for (const s of sels) if (document.querySelector(s)) return s;
          return null;
        }).catch(() => null);
        if (captchaSel) return { reason: "captcha", marker: `dom:${captchaSel}` };
        const statuses = PERIODS.map((k) => m?.[k]?.__status);
        const authStatus = statuses.find((s) => s === 401 || s === 403);
        if (authStatus) return { reason: "session", marker: `http:${authStatus}` };
        const errs = PERIODS.map((k) => m?.[k]?.__error).filter(Boolean);
        if (errs.some((e) => /abort|timeout/i.test(e))) {
          return { reason: "timeout", marker: `err:${String(errs[0]).slice(0, 60)}` };
        }
        if (statuses.some((s) => s === 200)) {
          return { reason: "empty_response", marker: "http:200_no_vv_history" };
        }
        return { reason: "unknown", marker: `statuses:${statuses.join(",")}` };
      };

      let rawInsightMap = {};
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) {
          await page.waitForTimeout(attempt === 2 ? 2000 : 4000);
          await page.goto("https://www.tiktok.com/tiktokstudio/analytics", {
            waitUntil: "domcontentloaded",
            timeout: 10000,
          }).catch(() => { });
          await page.waitForTimeout(1200);
        }
        rawInsightMap = await evaluateInsightMap();
        if (historiesHealthy(rawInsightMap)) break;
        const f = await detectInsightsFailReason(rawInsightMap);
        insightsFailReason = f.reason;
        insightsFailMarker = f.marker;
        console.warn(`   [INSIGHTS] attempt ${attempt}/3 unavailable: ${f.reason} (${f.marker})`);
        if (f.reason === "session" || f.reason === "captcha") break;
      }

      const getVal = (d, metric) =>
        sumStudioInsightPeriod((rawInsightMap[String(d)] || {})[metric], d);

      if (historiesHealthy(rawInsightMap)) {
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

        const allZero = [
          views7d, views28d, views60d, views365d,
          likes7d, likes28d, likes60d, likes365d,
          comments7d, comments28d, comments60d, comments365d,
          shares7d, shares28d, shares60d, shares365d,
          profileViews7d, profileViews28d, profileViews60d, profileViews365d,
        ].every((v) => v === 0);

        // Independent video signal (NOT the Insights page)
        const publicVideos = publicStats ? Number(publicStats.videoCount || 0) : null;
        const videoSignal = Math.max(publicVideos || 0, studioTotalVideos || 0, videosList.length);

        if (!allZero) {
          insightsStatus = "ok";
        } else if (videoSignal > 0) {
          // Zeroed Insights but content exists. Plays older than 365d may look zeroed —
          // if list plays exist but 365d views are 0, treat as degraded/mid-load.
          if (totalViewsCombined > 0 && views365d === 0) {
            insightsStatus = "unavailable";
            insightsFailReason = "empty_response";
            insightsFailMarker = "zeroed_with_video_plays";
          } else {
            insightsStatus = "ok"; // genuine real zeros
          }
        } else if (publicVideos === 0 && studioTotalVideos === 0 && videosList.length === 0) {
          insightsStatus = "no_data";
        } else {
          insightsStatus = "unavailable";
          insightsFailReason = "unknown";
          insightsFailMarker = "no_data_uncorroborated";
        }
        if (insightsStatus !== "unavailable") {
          insightsFailReason = null;
          insightsFailMarker = null;
        }
        if (insightsStatus === "ok") {
          // Match request: days 366 / end_days 1 — last point = yesterday UTC.
          dailyViewsBreakdown = buildDailyViewsBreakdown(
            (rawInsightMap["365"] || {}).vv_history,
            1
          );
        }
      }
    } catch (anErr) {
      console.warn("   [!] Analytics fetch warning:", anErr.message);
    }
    t_insights = Date.now() - t_insights_start;
    const insightsOk = insightsStatus === "ok";

    // Trust insights 365d when pagination signing blocked our item_list replay.
    let totalViews = paginationFailedDueToSigning
      ? Math.max(views365d, totalViewsCombined)
      : Math.max(totalViewsCombined, views365d);

    // Top videos 365d
    let topVideos365d = null;
    const fetchTopVideosInPage = async () => {
      return await page.evaluate(async () => {
        const fetchTopVideosByFilter = async (filterNum) => {
          try {
            const typeReq = [{ insigh_type: "top_items", range: 4, filter: filterNum }];
            const tzOffset = -(new Date().getTimezoneOffset()) * 60;
            const url = "/aweme/v2/data/insight/?tz_offset=" + tzOffset + "&type_requests=" + encodeURIComponent(JSON.stringify(typeReq));
            const res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(8000) });
            const j = await res.json();
            return { filterNum, status: res.status, raw: j };
          } catch (e) { return { filterNum, error: e.message }; }
        };
        const [r1, r5, r2] = await Promise.all([
          fetchTopVideosByFilter(1),
          fetchTopVideosByFilter(5),
          fetchTopVideosByFilter(2),
        ]);
        return { r1, r5, r2 };
      }).catch(() => null);
    };

    const getTopItemsList = (r) => {
      if (!r?.raw) return [];
      const ti = r.raw.top_items;
      if (Array.isArray(ti)) return ti.map((x) => x?.value || x);
      if (ti && Array.isArray(ti.value)) return ti.value.map((x) => x?.value || x);
      const fallback = r.raw.top_item_list || r.raw.items || r.raw.data?.top_items || [];
      return Array.isArray(fallback) ? fallback.map((x) => x?.value || x) : [];
    };

    const normalizeTopVideoItem = (rawItem, rank) => {
      if (!rawItem) return null;
      const item = rawItem.value || rawItem;
      const stats = item.statistics || {};
      const coverObj = item.video?.cover || item.cover || {};
      const coverUrl =
        (typeof coverObj === "object" ? (coverObj.url_list?.[0] || coverObj.url) : coverObj) ||
        item.cover_url || item.thumbnail || null;
      const playCount = Number(stats.play_count || item.play_count || item.vv || item.views || 0);
      const likeCount = Number(stats.digg_count || item.digg_count || item.likes || item.like_count || 0);
      const newViewers = Number(stats.new_viewer_count || item.new_viewers || item.uv || 0);
      return {
        rank: rank + 1,
        videoId: String(item.aweme_id || item.item_id || item.video_id || item.id || ""),
        title: item.desc || item.title || item.video_name || null,
        coverUrl: coverUrl || null,
        postedOn: item.create_time
          ? new Date(Number(item.create_time) * 1000).toISOString().split("T")[0]
          : (item.post_date || null),
        viewsInRange: Number(item.vv_in_range || item.views_in_range || playCount),
        newViewersInRange: Number(item.new_viewers_in_range || newViewers),
        likesInRange: Number(item.likes_in_range || item.like_in_range || likeCount),
        allViews: playCount,
        allLikes: likeCount,
      };
    };

    try {
      let rawTopVideos = await fetchTopVideosInPage();
      const countTop = (raw) => (getTopItemsList(raw?.r1).length + getTopItemsList(raw?.r5).length + getTopItemsList(raw?.r2).length);

      if ((!rawTopVideos || countTop(rawTopVideos) === 0) && !page.url().includes("/analytics")) {
        await page.goto("https://www.tiktok.com/tiktokstudio/analytics", {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        }).catch(() => { });
        await page.waitForTimeout(1500);
        const retryTop = await fetchTopVideosInPage();
        if (countTop(retryTop) > countTop(rawTopVideos)) rawTopVideos = retryTop;
      }

      if (rawTopVideos) {
        topVideos365d = {
          mostViews: getTopItemsList(rawTopVideos.r1).map(normalizeTopVideoItem).filter(Boolean),
          mostNewViewers: getTopItemsList(rawTopVideos.r5).map(normalizeTopVideoItem).filter(Boolean),
          mostLikes: getTopItemsList(rawTopVideos.r2).map(normalizeTopVideoItem).filter(Boolean),
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch (tvErr) {
      console.warn("   [!] Top videos fetch error:", tvErr.message);
    }

    // Monetization
    const t_m10n_start = Date.now();
    let totalRewardsUsd = null;
    let shopRewardsUsd = null;
    let shopProgramName = "TikTok Shop for Seller";
    let activePrograms = [];
    let dailyBreakdown = [];
    let revenue7d = null, revenue28d = null, revenue60d = null, revenue365d = null;
    let rpm = null;
    let currency = "$";
    let tiktokShopProgram = null;
    let postRewards = [];
    let creatorRewardsMissing = false;
    let bannedReason = null;

    try {
      if (!interceptedRewardAnalytics) {
        try {
          const directM10n = await page.evaluate(async () => {
            try {
              const res = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics", {
                credentials: "include",
                signal: AbortSignal.timeout(6000),
              });
              if (res.ok) return await res.json();
            } catch { /* ignore */ }
            return null;
          }).catch(() => null);
          if (directM10n && (directM10n.data || directM10n.seven_d_income || directM10n.daily_estimated_income)) {
            interceptedRewardAnalytics = directM10n.data || directM10n;
            m10nHadAnalytics = true;
          }
        } catch { /* ignore */ }
      }

      if (!interceptedRewardAnalytics) {
        // Prefer waitForResponse over fixed sleeps.
        const waitRewards = page.waitForResponse(
          (r) => r.url().includes("/m10n_center/reward_analytics") && r.status() === 200,
          { timeout: 10000 }
        ).catch(() => null);

        await page.goto("https://www.tiktok.com/tiktokstudio/monetization", {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        }).catch(() => { });

        await waitRewards;
      }

      const parseMoney = (m) => {
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
        currency = interceptedRewardAnalytics.selected_currency?.symbol ||
          interceptedRewardAnalytics.selected_currency?.code || "$";
        revenue7d = parseMoney(interceptedRewardAnalytics.seven_d_income);
        revenue28d = parseMoney(interceptedRewardAnalytics.thirty_d_income);
        revenue60d = parseMoney(interceptedRewardAnalytics.sixty_d_income);
        totalRewardsUsd = Math.max(revenue7d || 0, revenue28d || 0, revenue60d || 0) || null;

        dailyBreakdown = (interceptedRewardAnalytics.daily_estimated_income || []).map((item) => ({
          date: new Date(item.time * 1000).toISOString().split("T")[0],
          revenue: parseMoney(item.money),
        }));

        const progsMap = new Map();
        (interceptedRewardAnalytics.m10n_program_user_income || []).forEach((p) => {
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

        activePrograms = Array.from(progsMap.values());
      } else {
        // DOM fallback (best effort)
        await Promise.race([
          page.waitForSelector('[role="tab"], [class*="card"], [class*="reward"], [class*="Card"], [class*="analytic"]', { timeout: 3000 }).catch(() => { }),
          page.waitForTimeout(1500),
        ]);

        const rew = await page.evaluate(() => {
          const detectCur = (str) => {
            if (!str) return null;
            if (str.includes("£")) return "£";
            if (str.includes("₫")) return "₫";
            if (str.includes("€")) return "€";
            if (str.includes("$")) return "$";
            return null;
          };
          const parseAmount = (str) => {
            if (typeof str === "number") return str;
            if (!str) return null;
            const match = String(str).match(/([0-9,]+\.?[0-9]*)/);
            if (!match) return null;
            const num = parseFloat(match[1].replace(/,/g, ""));
            return isNaN(num) ? null : num;
          };
          let cur = "$";
          let tot = null;
          let shop = null;
          let shopName = "TikTok Shop for Seller";
          const programsMap = new Map();
          const candidateCards = Array.from(
            document.querySelectorAll("[role='tab'], [class*='card'], [class*='tab'], [class*='item'], [class*='analytic']")
          ).filter((el) => {
            const t = el.innerText || el.textContent || "";
            return /[$£€₫]\s*\d/i.test(t) && t.length < 250;
          });
          candidateCards.forEach((card) => {
            const raw = (card.innerText || card.textContent || "").trim();
            const foundCur = detectCur(raw);
            if (foundCur) cur = foundCur;
            const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
            if (lines.length === 0) return;
            let amountLineIdx = lines.findIndex((l) => /[$£€₫]\s*[0-9]|^[0-9,.]+\s*[$£€₫]?$/.test(l));
            if (amountLineIdx === -1) {
              amountLineIdx = lines.findIndex((l) => /[$£€₫]?\s*[0-9,]+\.?[0-9]*/.test(l) && !/days|giày|ngày|hôm/i.test(l));
            }
            if (amountLineIdx === -1) return;
            let title = lines.slice(0, amountLineIdx).join(" ").trim();
            if (!title) title = card.getAttribute("aria-label") || card.getAttribute("title") || lines[amountLineIdx + 1] || "";
            title = title.replace(/\s+/g, " ").trim();
            if (!title || title.length > 70) return;
            const amount = parseAmount(lines[amountLineIdx]);
            if (amount === null) return;
            const lower = title.toLowerCase();
            if (lower === "total" || /^total$/i.test(title)) {
              if (tot === null) tot = amount;
            } else if (/tiktok\s*shop|shop\s*for/i.test(lower)) {
              if (shop === null) { shop = amount; shopName = title; }
            } else if (!programsMap.has(title)) {
              programsMap.set(title, amount);
            }
          });
          return {
            tot, shop, shopName, cur,
            activeProgs: Array.from(programsMap.entries()).map(([name, revenue]) => ({
              name, revenue7d: 0, revenue30d: revenue, revenue60d: 0,
            })),
          };
        }).catch(() => ({ tot: null, shop: null, shopName: "TikTok Shop for Seller", cur: "$", activeProgs: [] }));

        totalRewardsUsd = rew.tot;
        shopRewardsUsd = rew.shop;
        shopProgramName = rew.shopName || shopProgramName;
        currency = rew.cur || "$";
        activePrograms = rew.activeProgs || [];
      }

      try {
        const home365 = await page.evaluate(async () => {
          try {
            var typeReq = [{ insight_type: 126, data_date_range: 4 }];
            var url = "/tiktok/v1/analytics/insights/?type_requests=" + encodeURIComponent(JSON.stringify(typeReq)) + "&time_offset=25200&is_dark_mode=false";
            var resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
            var j = await resp.json();
            return j.analytics_overview_rewards?.total?.amount ?? null;
          } catch { return null; }
        }).catch(() => null);
        if (typeof home365 === "number") {
          revenue365d = home365;
          if (totalRewardsUsd === null || totalRewardsUsd === 0) totalRewardsUsd = revenue365d;
        }
      } catch { /* ignore */ }

      // RPM must use matched windows (same period for revenue and views).
      // Try 28d first (most reliable), then fall through to 60d, then 7d.
      if (revenue28d > 0 && views28d > 0) {
        rpm = Number(((revenue28d / views28d) * 1000).toFixed(3));
      } else if (revenue60d > 0 && views60d > 0) {
        rpm = Number(((revenue60d / views60d) * 1000).toFixed(3));
      } else if (revenue7d > 0 && views7d > 0) {
        rpm = Number(((revenue7d / views7d) * 1000).toFixed(3));
      }

      const sampleVideoId = videosList.find((v) => v.id && /^\d+$/.test(String(v.id)))?.id;
      if (sampleVideoId && (!interceptedPerPostUrl || interceptedPerPostRewards.length === 0)) {
        try {
          await page.goto(`https://www.tiktok.com/tiktokstudio/monetization/item/${sampleVideoId}/`, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          }).catch(() => { });
          const itemStart = Date.now();
          while (Date.now() - itemStart < 8000 && (!interceptedPerPostUrl || interceptedPerPostRewards.length === 0)) {
            await page.waitForTimeout(300);
          }
        } catch { /* ignore */ }
      }

      postRewards = [];

      const ALL_M10N_PROGRAMS = [
        "M10N_PROGRAM_UNSPECIFIED", "M10N_PROGRAM_VIDEO_GIFTS", "M10N_PROGRAM_TIPS",
        "M10N_PROGRAM_CREATOR_NEXT", "M10N_PROGRAM_CREATOR_FUND", "M10N_PROGRAM_TIKTOK_CREATOR_MARKETPLACE",
        "M10N_PROGRAM_SHOUTOUTS", "M10N_PROGRAM_LIVE_GIFTS", "M10N_PROGRAM_TIKTOK_SHOP",
        "M10N_PROGRAM_CREATOR_INCENTIVES", "M10N_PROGRAM_SERIES", "M10N_PROGRAM_TIKTOK_SHOP_MERCHANT",
        "M10N_PROGRAM_MUSIC_PROMOTION", "M10N_PROGRAM_LIVE_SUBSCRIPTION", "M10N_PROGRAM_TIKTOK_CREATIVE_CHALLENGE",
        "M10N_PROGRAM_TIKTOK_GAMING_REWARD", "M10N_PROGRAM_TIKTOK_BRANDED_MISSION", "M10N_PROGRAM_TIKTOK_LOCAL_SERVICE",
        "M10N_PROGRAM_GO_LIVE_INCENTIVE", "M10N_PROGRAM_GO_LIVE_LEADS", "M10N_PROGRAM_SOUNDON", "M10N_PROGRAM_GO_LIVE_SMB",
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21
      ];

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

      const mapInternalVideoItem = (item) => {
        const money = item.est_rewards || {};
        const cur = money.currency?.symbol || money.currency?.code || "$";
        let amt = 0;
        if (money.formatted_no_symbol) {
          amt = parseFloat(String(money.formatted_no_symbol).replace(/,/g, "")) || 0;
        } else {
          const units = typeof money.units === "number" ? money.units : parseInt(money.units || "0", 10) || 0;
          const nanos = typeof money.nanos === "number" ? money.nanos : parseInt(money.nanos || "0", 10) || 0;
          amt = units + nanos / 1e9;
        }
        let durationStr = null;
        if (typeof item.video_duration === "number" && item.video_duration > 0) {
          let durSec = item.video_duration;
          if (durSec >= 1000) durSec = durSec / 1000;
          const m = Math.floor(durSec / 60);
          const s = Math.floor(durSec % 60);
          durationStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        }
        let postDateStr = null;
        let publishTimeUnix = null;
        if (item.publish_date_unix_time) {
          publishTimeUnix = Number(item.publish_date_unix_time);
          const d = new Date(publishTimeUnix * 1000);
          if (!isNaN(d.getTime())) postDateStr = d.toISOString().split("T")[0];
        }
        const viewsCount = Number(item.views) || Number(item.total_views) || Number(item.quvv) || 0;
        let rpmStr = null;
        if (item.rpm_metadata?.rpm_integer) {
          const rVal = (Number(item.rpm_metadata.rpm_integer) / 100).toFixed(2);
          rpmStr = `${cur}${rVal}`;
        } else if (amt > 0 && viewsCount > 0) {
          rpmStr = `${cur}${((amt / viewsCount) * 1000).toFixed(2)}`;
        }
        const rawPrograms = Array.isArray(item.video_analytics_programs) ? item.video_analytics_programs : [];
        const programDetails = rawPrograms.map((p) => {
          const progId = Number(p.m10n_program ?? p.program_id ?? p.id);
          const progName = (p.program_name && String(p.program_name).trim())
            ? String(p.program_name).trim()
            : (PROGRAM_ID_MAP[progId] || (progId ? `Program ${progId}` : "Chương trình Creator Rewards"));
          return { id: progId, name: progName, isPunished: !!p.is_punished };
        });
        const queriedProgId = item._queried_program_id ? Number(item._queried_program_id) : null;
        let primaryProgramName = queriedProgId ? (PROGRAM_ID_MAP[queriedProgId] || `Program ${queriedProgId}`) : null;
        if (!primaryProgramName) primaryProgramName = programDetails[0]?.name || "Chương trình Creator Rewards";
        const isPunished = programDetails.some((p) => p.isPunished) || !!item.is_punished;
        const rewardVideoId = (() => {
          const str = item.video_id_str;
          if (typeof str === "string" && /^\d{5,}$/.test(str)) return str;
          const raw = item.video_id;
          if (typeof raw === "string" && /^\d{5,}$/.test(raw)) return raw;
          if (typeof raw === "number" && Number.isSafeInteger(raw)) return String(raw);
          if (typeof raw === "bigint") return String(raw);
          // Prefer string form even if not digit-only; never Number() unsafe snowflakes.
          if (typeof str === "string" && str) return str;
          if (raw != null && raw !== "") return String(raw);
          return "";
        })();
        return {
          id: rewardVideoId,
          videoId: rewardVideoId,
          title: item.video_name || "Video TikTok",
          coverUrl: item.video_thumbnail || null,
          duration: durationStr,
          postDate: postDateStr,
          publishDate: postDateStr,
          publishTimeUnix,
          programId: queriedProgId || programDetails[0]?.id || 9,
          programName: primaryProgramName,
          isPunished,
          reward: Number(amt.toFixed(2)),
          rewards: Number(amt.toFixed(2)),
          currency: cur,
          views: viewsCount,
          rpm: rpmStr,
        };
      };

      const paginationBaseUrl = interceptedPerPostUrl || (await page.evaluate(() => {
        const entries = performance.getEntriesByType("resource").map((e) => e.name);
        return entries.find((u) => u.includes("reward_analytics_per_post?")) ||
          entries.find((u) => u.includes("/m10n_center/reward_analytics?")) || null;
      }).catch(() => null)) || "/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0";

      let allApiItems = [];
      if (paginationBaseUrl) {
        try {
          const evalResult = await page.evaluate(async ({ baseReqUrl, allPrograms, maxConcurrentPrograms, pagePacingMs }) => {
            const extra = [];
            let activeProgramIds = [];
            let pageCapHit = false;
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

            try {
              const probeUrl = new URL(baseReqUrl, window.location.origin);
              probeUrl.pathname = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post";
              probeUrl.searchParams.set("page", "0");
              probeUrl.searchParams.set("video_analytics_filter", JSON.stringify({
                video_analytics_display_time_range: 3,
                video_analytics_sort_by_type: 3,
                video_analytics_programs: allPrograms,
              }));
              const probeRes = await fetch(probeUrl.toString(), {
                credentials: "include",
                signal: AbortSignal.timeout(8000),
              });
              if (probeRes.status === 429) return { items: [], rateLimited: true, progId: "probe", page: 0, pageCapHit: false };
              const probeJson = await probeRes.json();
              const probePayload = probeJson?.data || probeJson;
              if (Array.isArray(probePayload?.video_analytics_active_programs) && probePayload.video_analytics_active_programs.length > 0) {
                activeProgramIds = probePayload.video_analytics_active_programs;
              }
              const probeList = probePayload?.video_analytics_video_list || [];
              if (probeList.length > 0 && activeProgramIds.length <= 1) {
                const singleProgId = activeProgramIds[0] || 9;
                for (const item of probeList) { item._queried_program_id = singleProgId; extra.push(item); }
              }
            } catch { /* ignore */ }

            async function fetchProgramPages(progId, startPage = 0, maxPages = 20) {
              const progItems = [];
              let p = startPage;
              let keepGoing = true;
              let capHit = false;
              while (keepGoing && p < maxPages) {
                if (p > startPage && pagePacingMs > 0) await sleep(pagePacingMs);
                try {
                  const u = new URL(baseReqUrl, window.location.origin);
                  u.pathname = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post";
                  u.searchParams.set("page", String(p));
                  u.searchParams.set("video_analytics_filter", JSON.stringify({
                    video_analytics_display_time_range: 3,
                    video_analytics_sort_by_type: 3,
                    video_analytics_programs: [progId],
                  }));
                  const r = await fetch(u.toString(), {
                    credentials: "include",
                    signal: AbortSignal.timeout(8000),
                  });
                  if (r.status === 429) return { progItems, rateLimited: true, page: p, capHit };
                  const j = await r.json();
                  const payload = j?.data || j;
                  const list = payload?.video_analytics_video_list || [];
                  for (const item of list) { item._queried_program_id = progId; progItems.push(item); }
                  keepGoing = !!payload?.has_more;
                  if (!list.length) break;
                  p++;
                } catch { break; }
              }
              if (keepGoing && p >= maxPages) capHit = true;
              return { progItems, rateLimited: false, page: p, capHit };
            }

            if (activeProgramIds.length > 1) {
              for (let i = 0; i < activeProgramIds.length; i += maxConcurrentPrograms) {
                const batch = activeProgramIds.slice(i, i + maxConcurrentPrograms);
                const batchResults = await Promise.all(batch.map((progId) => fetchProgramPages(progId, 0, 20)));
                for (let bIdx = 0; bIdx < batchResults.length; bIdx++) {
                  const bRes = batchResults[bIdx];
                  if (bRes.progItems && bRes.progItems.length > 0) extra.push(...bRes.progItems);
                  if (bRes.capHit) pageCapHit = true;
                  if (bRes.rateLimited) return { items: extra, rateLimited: true, progId: batch[bIdx], page: bRes.page, pageCapHit };
                }
              }
            } else {
              const targetProgId = activeProgramIds[0] || 9;
              const res = await fetchProgramPages(targetProgId, 1, 25);
              if (res.progItems && res.progItems.length > 0) extra.push(...res.progItems);
              if (res.capHit) pageCapHit = true;
              if (res.rateLimited) return { items: extra, rateLimited: true, progId: targetProgId, page: res.page, pageCapHit };
            }
            return { items: extra, rateLimited: false, pageCapHit };
          }, {
            baseReqUrl: paginationBaseUrl,
            allPrograms: ALL_M10N_PROGRAMS,
            maxConcurrentPrograms: Number(config.m10nMaxConcurrentPrograms) > 0 ? Number(config.m10nMaxConcurrentPrograms) : M10N_MAX_CONCURRENT_PROGRAMS,
            pagePacingMs: Number.isFinite(Number(config.m10nPagePacingMs)) ? Number(config.m10nPagePacingMs) : M10N_PAGE_PACING_MS,
          });

          if (evalResult) {
            allApiItems = evalResult.items || [];
            if (evalResult.rateLimited) {
              m10nRateLimited = true;
              postRewardsPartial = true;
              console.warn(`   [RATE-LIMIT] Tier A (program: ${evalResult.progId}, page: ${evalResult.page}) returned HTTP 429`);
            }
            if (evalResult.pageCapHit) postRewardsPartial = true;
          }
        } catch { /* ignore */ }
      }

      const safeMapInternal = (items) => {
        const mapped = [];
        for (const it of items) {
          try { mapped.push(mapInternalVideoItem(it)); } catch { /* skip malformed */ }
        }
        return mapped;
      };

      if (Array.isArray(allApiItems) && allApiItems.length > 0) {
        const mapped = safeMapInternal(allApiItems);
        const seenKeys = new Set();
        postRewards = [];
        for (const item of mapped) {
          const key = `${item.id || item.videoId}_${item.programId || item.programName || "9"}`;
          if (!seenKeys.has(key)) { seenKeys.add(key); postRewards.push(item); }
        }
      } else if (Array.isArray(interceptedPerPostRewards) && interceptedPerPostRewards.length > 0) {
        const mapped = safeMapInternal(interceptedPerPostRewards);
        const seenKeys = new Set();
        postRewards = [];
        for (const item of mapped) {
          const key = `${item.id || item.videoId}_${item.programId || item.programName || "9"}`;
          if (!seenKeys.has(key)) { seenKeys.add(key); postRewards.push(item); }
        }
      }

      // Retry-once on 429, using a bounded per-page retry.
      if (!postRewards || postRewards.length === 0) {
        try {
          const directApiResult = await page.evaluate(async ({ allPrograms, pagePacingMs }) => {
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            try {
              const perfEntries = performance.getEntriesByType("resource")
                .map((e) => e.name)
                .filter((u) => u.includes("reward_analytics_per_post"));
              const defaultFilter = encodeURIComponent(JSON.stringify({
                video_analytics_display_time_range: 3,
                video_analytics_sort_by_type: 3,
                video_analytics_programs: allPrograms,
              }));
              const baseUrl = perfEntries[0] || `/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0&video_analytics_filter=${defaultFilter}`;
              const allItems = [];
              let p = 0;
              let keepGoing = true;
              let rateLimited = false;
              let rateLimitedPage = 0;
              let pageCapHit = false;
              while (keepGoing && p < 8) {
                if (p > 0 && pagePacingMs > 0) await sleep(pagePacingMs);
                let attempt = 0;
                let gotResponse = false;
                while (attempt < 2 && !gotResponse) {
                  try {
                    const u = new URL(baseUrl, window.location.origin);
                    u.searchParams.set("page", String(p));
                    u.searchParams.set("video_analytics_filter", JSON.stringify({
                      video_analytics_display_time_range: 3,
                      video_analytics_sort_by_type: 3,
                      video_analytics_programs: allPrograms,
                    }));
                    const res = await fetch(u.toString(), {
                      credentials: "include",
                      signal: AbortSignal.timeout(8000),
                    });
                    if (res.status === 429) {
                      if (attempt === 0) { await sleep(1500); attempt++; continue; }
                      rateLimited = true;
                      rateLimitedPage = p;
                      gotResponse = true;
                      break;
                    }
                    const j = await res.json();
                    const payload = j?.data || j;
                    const list = payload?.video_analytics_video_list || [];
                    if (list.length > 0) allItems.push(...list);
                    keepGoing = !!payload?.has_more;
                    if (!list.length) keepGoing = false;
                    gotResponse = true;
                  } catch {
                    break;
                  }
                }
                if (!gotResponse || rateLimited) break;
                p++;
              }
              if (keepGoing && p >= 8) pageCapHit = true;
              return { items: allItems, rateLimited, rateLimitedPage, pageCapHit };
            } catch { return { items: [], rateLimited: false, rateLimitedPage: 0, pageCapHit: false }; }
          }, {
            allPrograms: ALL_M10N_PROGRAMS,
            pagePacingMs: Number.isFinite(Number(config.m10nPagePacingMs)) ? Number(config.m10nPagePacingMs) : M10N_PAGE_PACING_MS,
          });

          if (directApiResult?.rateLimited) {
            m10nRateLimited = true;
            postRewardsPartial = true;
            console.warn(`   [RATE-LIMIT] Tier B (page: ${directApiResult.rateLimitedPage}) returned HTTP 429`);
          }
          if (directApiResult?.pageCapHit) postRewardsPartial = true;

          if (Array.isArray(directApiResult?.items) && directApiResult.items.length > 0) {
            const mapped = safeMapInternal(directApiResult.items);
            const seenIds = new Set();
            postRewards = [];
            for (const item of mapped) {
              const key = item.id || item.videoId || item.title;
              if (!seenIds.has(key)) { seenIds.add(key); postRewards.push(item); }
            }
          }
        } catch { /* ignore */ }
      }

      if (totalRewardsUsd === null || totalRewardsUsd === 0) {
        const sumPostRewards = postRewards.reduce((sum, p) => sum + (Number(p.reward || p.rewards) || 0), 0);
        if (sumPostRewards > 0) totalRewardsUsd = Number(sumPostRewards.toFixed(2));
      }

      if (!postRewards || postRewards.length === 0) {
        try {
          await page.evaluate(() => { window.scrollBy(0, 700); }).catch(() => { });
          await page.waitForTimeout(1000);
          postRewards = await page.evaluate(() => {
            const parseMoney = (str) => {
              if (!str) return { amount: 0, currency: "$" };
              let cur = "$";
              if (str.includes("₫")) cur = "₫";
              else if (str.includes("£")) cur = "£";
              else if (str.includes("€")) cur = "€";
              const cleaned = str.replace(/[^0-9,.]/g, "").replace(/,/g, "");
              const amt = parseFloat(cleaned) || 0;
              return { amount: amt, currency: cur };
            };
            const results = [];
            const candidateCards = Array.from(document.querySelectorAll("div, article, li"))
              .filter((el) => {
                const text = el.innerText || "";
                const hasCur = /[$£€₫]/.test(text);
                const hasViewsOrDate = /(?:lượt xem|views?|\d{4}[/-]\d{2}|\d{2}[/-]\d{2}|\d{1,2}:\d{2})/i.test(text);
                const hasImg = !!el.querySelector("img, video, [style*='background-image']");
                return hasCur && hasViewsOrDate && hasImg && text.length < 500 && el.children.length >= 2;
              });
            const leafCards = candidateCards.filter((card) => !candidateCards.some((other) => other !== card && card.contains(other)));
            for (const card of leafCards) {
              try {
                const text = card.innerText || "";
                const isNotice = /search query|low traffic|thông tin sẽ hiển thị|chưa có dữ liệu|no data|available once|chưa đủ điều kiện|not eligible/i.test(text);
                if (isNotice) continue;
                let vidId = null;
                const link = card.querySelector('a[href*="/video/"]');
                if (link) {
                  const m = link.getAttribute("href")?.match(/\/video\/(\d+)/);
                  if (m) vidId = m[1];
                }
                const dataId = card.getAttribute("data-id") || card.getAttribute("data-item-id") || card.getAttribute("data-video-id");
                if (!vidId && dataId && /^\d+$/.test(dataId)) vidId = dataId;
                const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
                const img = card.querySelector("img");
                const coverUrl = img?.src || img?.getAttribute("data-src") || null;
                const durationMatch = text.match(/\b\d{1,2}:\d{2}\b/);
                const duration = durationMatch ? durationMatch[0] : null;
                const moneyMatch = text.match(/([$£€₫]\s*[0-9,.]+|[0-9,.]+\s*[$£€₫])/);
                const moneyInfo = moneyMatch ? parseMoney(moneyMatch[0]) : { amount: 0, currency: "$" };
                const viewsMatch = text.match(/([0-9,.]+[kKmM]?)\s*(?:lượt xem|views?)/i) || text.match(/(?:lượt xem|views?)\s*:?\s*([0-9,.]+[kKmM]?)/i);
                const views = viewsMatch ? viewsMatch[1] : null;
                const rpmMatch = text.match(/RPM\s*:?\s*([$£€₫]?\s*[0-9,.]+)/i) || text.match(/(?:RPM|rpm)\s+([$£€₫]?\s*[0-9,.]+)/);
                let rpmStr = rpmMatch ? rpmMatch[1].trim() : null;
                let parsedViewsNum = 0;
                if (views) {
                  const cleanViews = String(views).trim().toLowerCase();
                  if (cleanViews.endsWith("k")) parsedViewsNum = parseFloat(cleanViews) * 1000;
                  else if (cleanViews.endsWith("m")) parsedViewsNum = parseFloat(cleanViews) * 1000000;
                  else parsedViewsNum = parseFloat(cleanViews.replace(/,/g, "")) || 0;
                }
                if (!rpmStr && moneyInfo.amount > 0 && parsedViewsNum > 0) {
                  const calculatedRpm = Math.round((moneyInfo.amount / parsedViewsNum) * 1000 * 100) / 100;
                  if (calculatedRpm > 0) rpmStr = `${moneyInfo.currency}${calculatedRpm.toFixed(2)}`;
                }
                const dateMatch = text.match(/\b(?:\d{4}[/-]\d{2}[/-]\d{2}|\d{2}[/-]\d{2}[/-]\d{4})(?:\s+\d{1,2}:\d{2})?\b/) ||
                  text.match(/\b\d{1,2}:\d{2}\s+\d{2}[/-]\d{2}[/-]\d{4}\b/);
                const postDate = dateMatch ? dateMatch[0] : null;
                const progMatch = text.match(/(?:Chương trình\s+)?Creator Rewards(?:\s+Program)?/i) || text.match(/TikTok Shop(?:\s+for\s+Creator)?/i);
                const programName = progMatch ? progMatch[0] : "Chương trình Creator Rewards";
                let title = "";
                for (const line of lines) {
                  if (
                    line === duration ||
                    line === moneyMatch?.[0] ||
                    line.includes(moneyMatch?.[0] || "___") ||
                    line === viewsMatch?.[0] ||
                    line.includes("lượt xem") || line.includes("views") ||
                    line.includes("RPM") || line.includes("rpm") ||
                    line.includes("Xem chi tiết") || line.includes("View details") ||
                    line === programName || line === dateMatch?.[0]
                  ) continue;
                  if (line.length > title.length) title = line;
                }
                const hasVideoEvidence = !!vidId || !!duration || (views && parsedViewsNum > 0) || (moneyInfo.amount > 0 && !!postDate);
                if (!hasVideoEvidence) continue;
                if (coverUrl || title || moneyInfo.amount > 0) {
                  let publishTimeUnix = null;
                  if (postDate) {
                    const parsedTs = new Date(postDate).getTime();
                    if (!isNaN(parsedTs)) publishTimeUnix = Math.floor(parsedTs / 1000);
                  }
                  results.push({
                    id: vidId || null, videoId: vidId || null,
                    title: title || "Video", coverUrl, duration,
                    postDate, publishDate: postDate, publishTimeUnix,
                    programName, reward: moneyInfo.amount, currency: moneyInfo.currency,
                    views, rpm: rpmStr,
                  });
                }
              } catch { /* ignore */ }
            }
            return results;
          }).catch(() => []);
        } catch { /* ignore */ }
      }

      // Banned/creator-rewards flag: only when we actually captured both signals.
      creatorRewardsMissing = false;
      bannedReason = null;
      rewardsNoProgram = false;

      if (!m10nRateLimited && m10nHadAnalytics) {
        try {
          const pageText = await page
            .evaluate(() => document.body?.innerText || "")
            .catch(() => "");

          const hasCreatorRewardsInProg =
            Array.isArray(activePrograms) &&
            activePrograms.some((p) =>
              p.programId === 9 ||
              p.programId === 4 ||
              /creator\s*reward|quỹ\s*nhà\s*sáng\s*tạo|sáng\s*tạo|beta/i.test(p.name)
            );
          // Informational only — the sidebar always contains this string.
          const hasCreatorRewardsInText =
            /creator\s*rewards?|chương\s*trình\s*creator\s*rewards|quỹ\s*nhà\s*sáng\s*tạo/i.test(
              pageText
            );

          // Authoritative decision: use the API program list only.
          const hasCreatorRewards = hasCreatorRewardsInProg;

          // Check if there are any videos in postRewards tied specifically to Creator Rewards / Beta
          const hasCreatorPostRewards =
            Array.isArray(postRewards) &&
            postRewards.some((p) =>
              p.programId === 9 ||
              p.programId === 4 ||
              /creator\s*reward|quỹ\s*nhà\s*sáng\s*tạo|beta/i.test(p.programName || "")
            );

          const programCount = Array.isArray(activePrograms) ? activePrograms.length : 0;

          // Positive evidence this account is/was enrolled in Creator Rewards.
          // TikTok Creator Rewards Program strictly requires >= 10,000 followers.
          // Accounts with other programs (LIVE rewards, Gaming Incentive, Shop, etc.)
          // or < 10,000 followers must NOT be flagged as banned from Creator Rewards.
          const isEligibleForCreatorRewards =
            followerCount >= 10000 || hasCreatorPostRewards;

          if (isEligibleForCreatorRewards && !hasCreatorRewards) {
            // Enrolled/eligible creator with no Creator Rewards in active program list
            // ⇒ program was revoked / banned.
            creatorRewardsMissing = true;
            bannedReason = "Bị ngừng chương trình TikTok Beta (Creator Rewards Program)";
          } else {
            creatorRewardsMissing = false;
            if (!hasCreatorRewards && !isEligibleForCreatorRewards && programCount === 0) {
              rewardsNoProgram = true;
            }
          }
        } catch { /* ignore */ }
      }
      if (m10nRateLimited) rewardsFailReason = "rate_limited";
      else if (postRewardsPartial) rewardsFailReason = "incomplete_list";
      else if (!m10nHadAnalytics) rewardsFailReason = "timeout";
    } catch { /* ignore */ }
    t_m10n = Date.now() - t_m10n_start;

    // Match extension Tier-0: totalLikes = Studio insights 365d when available.
    // Public profile heartCount is often a rounded display figure (e.g. 300.8K → 300800)
    // and diverged from extension runs (230229).
    let totalLikes = likes365d;
    if (!totalLikes) {
      totalLikes = cleanNum(publicStats?.heartCount || publicStats?.heart || userInfo?.totalLikes || 0);
      try {
        const headerLikes = await page.evaluate(() => {
          const text = document.body?.innerText || "";
          const m = text.match(/(?:Lượt thích|Likes?)\s*\n*\s*([\d,.]+[kKmM]?)/i) || text.match(/([\d,.]+[kKmM]?)\s*\n*\s*(?:Lượt thích|Likes?)/i);
          return m ? (m[1] || m[2]) : null;
        }).catch(() => null);
        if (headerLikes) {
          const parsed = cleanNum(headerLikes);
          if (parsed > totalLikes) totalLikes = parsed;
        }
      } catch { /* ignore */ }
    }

    const sumPostRewards = (postRewards || []).reduce((s, p) => s + (Number(p.rewards) || Number(p.reward) || 0), 0);
    const effectiveTotalRevenue = Number((
      totalRewardsUsd ||
      Math.max(revenue7d || 0, revenue28d || 0, revenue60d || 0, revenue365d || 0) ||
      sumPostRewards ||
      0
    ).toFixed(2));

    // RPM already set from matched windows above; do NOT recompute using mismatched windows.

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

    const sumRevenue = {
      revenue7d: revenue7d || 0,
      revenue28d: revenue28d || 0,
      revenue60d: revenue60d || 0,
      revenue365d: revenue365d || 0,
      totalRevenue: effectiveTotalRevenue,
    };
    const sumViews = { views7d, views28d, views60d, views365d, totalViews };
    const sumLikes = { likes7d, likes28d, likes60d, likes365d, totalLikes };
    const sumComments = { comments7d, comments28d, comments60d, comments365d };
    const sumShares = { shares7d, shares28d, shares60d, shares365d };
    const sumProfileViews = { profileViews7d, profileViews28d, profileViews60d, profileViews365d };

    const storageRoot = path.dirname(profileDir);
    const meta = readGpmProfileMetaFromDisk(storageRoot, profileId);
    let gpmGroupName = meta.groupName || null;
    if (!gpmGroupName && meta.groupId) {
      gpmGroupName = await lookupGpmGroupName(lastGoodGpmBase || null, meta.groupId);
    }

    // Re-read store-country after Studio navigation — cookie-bridge sessions often
    // lacked it at first paint, then TikTok sets it once authenticated pages load.
    if (!cookieCountryRaw) {
      try {
        const later = await context.cookies(["https://www.tiktok.com", "https://tiktok.com"]);
        const storeCookie = later.find((c) => c.name === "store-country-code");
        if (storeCookie?.value) cookieCountryRaw = storeCookie.value;
      } catch { /* ignore */ }
    }
    if (!cookieCountryRaw || !passportCountryRaw) {
      try {
        const hints = await page.evaluate(() => {
          let storeCountry = null;
          let storePassport = null;
          try {
            const m = document.cookie.match(/(?:^|; )store-country-code=([^;]*)/);
            if (m) storeCountry = decodeURIComponent(m[1]);
          } catch { /* ignore */ }
          return { storeCountry, storePassport };
        }).catch(() => ({}));
        if (!cookieCountryRaw && hints?.storeCountry) cookieCountryRaw = hints.storeCountry;
      } catch { /* ignore */ }
    }

    const detectedCountry = detectAccountCountry({
      passportCountryRaw,
      cookieCountryRaw,
      pageCountryHints,
      currency,
      profileName: meta.name,
      gpmGroupName,
    });

    // Soft-merge only: decorate item_list rows with monetization metadata.
    // Do NOT copy reward period-views into lifetime engagement, and do NOT
    // append reward-only stubs (that mixes windows and breaks tier parity).
    if (Array.isArray(postRewards) && postRewards.length > 0) {
      const rewardMap = new Map();
      for (const pr of postRewards) {
        for (const raw of [pr.id, pr.videoId]) {
          if (raw == null || raw === "") continue;
          const k = typeof raw === "string" && /^\d{5,}$/.test(raw)
            ? raw
            : (typeof raw === "number" && Number.isSafeInteger(raw) ? String(raw) : String(raw));
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

    if (topVideos365d) {
      // Enrich only — do not append top-insight videos into videosList.
      // videosList = Studio item_list window; postRewards stays a separate array.
      const allTop = [
        ...(topVideos365d.mostViews || []),
        ...(topVideos365d.mostNewViewers || []),
        ...(topVideos365d.mostLikes || []),
      ];
      for (const tv of allTop) {
        const tvId = String(tv.videoId || "");
        if (!tvId) continue;
        const v = videosList.find((x) => String(x.id) === tvId);
        if (!v) continue;
        if (tv.allViews && (!v.views || v.views === 0)) v.views = tv.allViews;
        if (tv.allLikes && (!v.likes || v.likes === 0)) v.likes = tv.allLikes;
        if (tv.coverUrl && !v.coverUrl) v.coverUrl = tv.coverUrl;
        if (tv.title && (!v.title || v.title === "No title")) v.title = tv.title;
      }
    }

    const gpmProfileName = meta.name || `Profile ${String(profileId).slice(0, 8)}`;
    const t_total = Date.now() - t_start;
    console.log(
      `   [PERF] Profile ${profileId} (@${finalHandle || "unknown"}): total=${t_total}ms (nav=${t_nav}ms, insights=${t_insights}ms, m10n=${t_m10n}ms, videos=${videosList.length})`
    );

    // Prefer Studio Posts (N) when known — public profile videoCount can lag/differ
    // (cookie-bridge previously reported 449/321 while extension had 469/435).
    const realTotalVideos = studioTotalVideos > 0
      ? studioTotalVideos
      : Math.max(publicStats?.videoCount || 0, videosList.length);
    const finalFollowerCount = Math.max(
      followerCount,
      publicStats?.followerCount || 0,
      Number(userInfo?.FanCount || 0),
      Number(userInfo?.FanCnt || 0),
    );

    if (!userInfo && !realTotalVideos && !finalFollowerCount && !totalRewardsUsd) {
      return { success: false, error: "unauthenticated_session_empty_data" };
    }

    return {
      success: true,
      data: {
        username: finalHandle,
        nickname: userInfo?.NickName || null,
        followersCount: finalFollowerCount,
        totalLikes,
        ...(insightsOk ? { totalViews } : {}),
        videoCount: realTotalVideos,
        totalVideos: realTotalVideos,
        totalRevenue: effectiveTotalRevenue,
        currency,
        country: detectedCountry,
        rpm,
        videosList,
        postRewards: postRewards || [],
        // Marks data as incomplete when a 429 or a hard page cap truncated postRewards.
        postRewardsPartial: postRewardsPartial || undefined,
        creatorRewardsMissing: !!creatorRewardsMissing,
        bannedReason: bannedReason || null,
        sumRevenue,
        ...(insightsOk
          ? { sumViews, sumLikes, sumComments, sumShares, sumProfileViews, dailyViewsBreakdown }
          : {}),
        revenueBreakdown,
        dailyRevenueBreakdown: dailyBreakdown,
        insightsHistory: interceptedInsightsHistory,
        topVideos365d: topVideos365d || null,
        insightsStatus,
        insightsUnavailable: insightsStatus === "unavailable",
        insightsNoData: insightsStatus === "no_data",
        insightsFailReason: insightsFailReason || undefined,
        insightsFailMarker: insightsFailMarker || undefined,
        rewardsFailReason: rewardsFailReason || undefined,
        rewardsNoProgram: rewardsNoProgram || undefined,
        flagsVersion: 1,
        isLoggedIn: true,
        gpmProfileId: profileId,
        gpmProfileName,
        gpmGroupName: gpmGroupName || undefined,
        memberEmail: config.memberEmail,
        extractionMethod: methodLabel,
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Three-tier extraction. `ctl` (optional) collects closer callbacks so a caller
 * timeout can actually tear down the browser/context/page it started.
 */
/**
 * Tier 0: Ask the extension running inside the live profile browser to scrape
 * TikTok Studio data using its own authenticated session. Completely invisible
 * to the user — no new tabs, no navigation. Resolves when the extension POSTs
 * the result to /extension-sweep-result, or rejects on timeout.
 */
function extractViaExtension(profileId, timeoutMs = 120_000, expectedHandle = "") {
  return new Promise((resolve, reject) => {
    const requestId = `${profileId}-${Date.now()}`;
    const timer = setTimeout(() => {
      _pendingExtSweeps.delete(profileId);
      reject(new Error("extension_sweep_timeout"));
    }, timeoutMs);
    _pendingExtSweeps.set(profileId, {
      requestId,
      resolve,
      reject,
      timer,
      // FIX: passed through to the POST handler for the username sanity check.
      expectedHandle: expectedHandle || "",
    });
  });
}

/** Cancel an in-flight Tier-0 sweep so the next profile is not blocked. */
export function cancelExtensionSweep(profileId) {
  const pending = _pendingExtSweeps.get(profileId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  _pendingExtSweeps.delete(profileId);
  try { pending.reject(new Error("extension_sweep_cancelled")); } catch { /* ignore */ }
  return true;
}

export async function extractProfileStudio(profileDir, profileId, chromePath, detectedHandle, ctl = null) {
  return withProfileLock(profileId, async () => {
    const storageRoot = path.dirname(profileDir);
    let lastError = null;

    const registerCloser = (fn) => {
      if (ctl && ctl.closers && typeof ctl.closers.add === "function") ctl.closers.add(fn);
    };

    // -------------------------------------------------------------------------
    // TIER 1: Direct CDP attach
    // -------------------------------------------------------------------------
    const activePort = readDevToolsActivePort(storageRoot, profileId);
    if (activePort) {
      console.log(`   [CDP] Profile ${profileId.slice(0, 8)} has active port :${activePort}. Testing connection...`);
      let cdpBrowser = null;
      let cdpPage = null;
      try {
        cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${activePort}`, { timeout: 8000 });
        registerCloser(async () => { try { await cdpBrowser?.close(); } catch { /* ignore */ } });
        const contexts = cdpBrowser.contexts();
        if (contexts.length > 0) {
          const cdpContext = contexts[0];
          cdpPage = await cdpContext.newPage();
          registerCloser(async () => { try { await cdpPage?.close(); } catch { /* ignore */ } });
          console.log(`   [CDP] Opened isolated probe tab. Extracting TikTok Studio metrics...`);
          const res = await scrapePageMetrics(cdpPage, cdpContext, profileDir, profileId, detectedHandle, "cdp");
          if (res.success) {
            console.log(`   [CDP] Tier 1 extraction succeeded for @${res.data.username}`);
            try {
              const liveCookies = await cdpContext.cookies(["https://www.tiktok.com", "https://tiktok.com"]);
              if (liveCookies?.length) saveProfileSession(profileId, liveCookies);
            } catch { /* ignore */ }
            return res;
          } else {
            console.warn(`   [CDP] Tier 1 unauthenticated/error: ${res.error}. Falling back...`);
            lastError = res.error;
          }
        }
      } catch (cdpErr) {
        console.warn(`   [CDP] Attach failed on :${activePort}: ${cdpErr.message}. Falling back...`);
        lastError = cdpErr.message;
      } finally {
        // Disconnect the CDP WebSocket without closing the user's browser.
        if (cdpBrowser) { try { await cap(cdpBrowser.close(), 2000); } catch { /* ignore */ } }
      }
    }

    // -------------------------------------------------------------------------
    // TIER 0: Extension-assisted sweep (profile browser is open)
    // When Chrome is running for this profile the Cookies file is locked and
    // Tiers 2/3 will always fail with profile_in_use_cookies_locked. The only
    // viable path is the extension inside the live browser.
    // -------------------------------------------------------------------------
    let browserWasOpen = false;
    try {
      const processOpenIds = await listOpenProfileIdsFromProcesses(storageRoot);
      const idKey = String(profileId);
      const idLower = idKey.toLowerCase();
      const inProcessList =
        processOpenIds.has(idKey) ||
        processOpenIds.has(idLower) ||
        [...processOpenIds].some((x) => String(x).toLowerCase() === idLower);
      const browserOpen =
        inProcessList ||
        isProfileBrowserAlive(storageRoot, profileId) ||
        hasProfileOpenLock(storageRoot, profileId);
      if (browserOpen) {
        browserWasOpen = true;
        console.log(`   [TIER-0] Profile ${profileId.slice(0, 8)} browser is open — requesting extension sweep...`);
        try {
          // FIX: pass detectedHandle (when known) so a misrouted response can be
          // rejected by the POST handler.
          // Timeout 150s covers MV3 alarm throttle (~60s) + full Studio/m10n sweep.
          // Retry once only on fast quality-reject (m10n unavailable) — do NOT retry
          // full timeouts (would exceed typical 180s caller budgets).
          let extResult = null;
          for (let attempt = 1; attempt <= 2; attempt++) {
            extResult = await extractViaExtension(profileId, 150_000, detectedHandle || "");
            if (extResult?.tier0Debug) {
              dumpTier0Debug(profileId, extResult.success ? "received" : "extension_failed", extResult.tier0Debug, {
                extensionSuccess: !!extResult.success,
                extensionError: extResult.error || null,
                attempt,
              });
            }
            if (!extResult?.success) {
              console.warn(`   [TIER-0] Extension returned failure (${extResult?.error || "no data"}).`);
              lastError = extResult?.error || "extension_sweep_no_data";
              break;
            }
            const d = extResult.data ?? {};
            const hasRevenue = (d.sumRevenue?.totalRevenue ?? 0) > 0 || (d.totalRevenue ?? 0) > 0;
            const hasPostRewards = Array.isArray(d.postRewards) && d.postRewards.length > 0;
            const m10nConfirmedActive = d.creatorRewardsMissing === false;
            const m10nConfirmedBanned = d.creatorRewardsMissing === true;
            const dataQualityOk = m10nConfirmedActive || m10nConfirmedBanned || hasRevenue || hasPostRewards;

            if (dataQualityOk) {
              console.log(
                `   [TIER-0] Extension returned data for @${d?.username || "unknown"} ` +
                `(revenue=${d.totalRevenue ?? 0}, postRewards=${Array.isArray(d.postRewards) ? d.postRewards.length : 0}, ` +
                `creatorRewardsMissing=${d.creatorRewardsMissing}, attempt=${attempt})`
              );
              return extResult;
            }

            console.warn(`   [TIER-0] m10n unavailable for @${d?.username || "unknown"} (attempt ${attempt}/2) — Studio tab not loaded.`);
            dumpTier0Debug(profileId, "m10n_unavailable_quality_reject", extResult.tier0Debug, {
              username: d.username || null,
              creatorRewardsMissing: d.creatorRewardsMissing,
              totalRevenue: d.totalRevenue ?? null,
              followersCount: d.followersCount ?? null,
              postRewardsCount: Array.isArray(d.postRewards) ? d.postRewards.length : 0,
              videosListCount: Array.isArray(d.videosList) ? d.videosList.length : 0,
              totalViews: d.totalViews ?? null,
              attempt,
            });
            lastError = "extension_m10n_unavailable";
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 2500));
              continue;
            }
          }
        } catch (tier0Err) {
          console.warn(`   [TIER-0] ${tier0Err.message}.`);
          lastError = tier0Err.message;
        }
        // Browser is open: Tiers 2 and 3 require the Cookies file which GPM locks
        // exclusively while Chrome is running — they will always fail. Return a
        // clean skip so the caller knows to close the browser and retry.
        console.warn(`   [TIER-0] Browser is open and sweep failed — Tiers 2/3 skipped (cookies locked). Close the browser and rerun.`);
        return { success: false, error: "browser_open_sweep_failed", skipped: true };
      }
    } catch (openIdsErr) {
      console.warn(`   [TIER-0] Could not check open profiles: ${openIdsErr.message}. Continuing...`);
    }


    // -------------------------------------------------------------------------
    // PROXY + UA LOOKUP (used by Tier 2 and Tier 3)
    // Fetch the profile's proxy config and configured UA from GPM once, so both
    // fallback tiers launch with the same IP/fingerprint as the user's real browser.
    // -------------------------------------------------------------------------
    let profileProxyConfig = null;
    let profileUserAgent = USER_AGENT;
    try {
      const gpmForProxy = await discoverGpmApiBase().catch(() => null);
      if (gpmForProxy?.online && gpmForProxy.base) {
        const profRes = await fetch(`${gpmForProxy.base}/profiles/${profileId}`, {
          signal: AbortSignal.timeout(4000),
        });
        if (profRes.ok) {
          const profJson = await profRes.json().catch(() => ({}));
          const row = profJson?.data || profJson;
          // Proxy
          const pType = String(row?.proxy_type || row?.proxyType || "").toLowerCase();
          const pHost = row?.proxy_host || row?.proxyHost || "";
          const pPort = row?.proxy_port || row?.proxyPort || "";
          const pUser = row?.proxy_user || row?.proxyUser || row?.proxy_username || "";
          const pPass = row?.proxy_pass || row?.proxyPass || row?.proxy_password || "";
          if ((pType === "http" || pType === "https" || pType === "socks5") && pHost && pPort) {
            profileProxyConfig = {
              server: `${pType === "socks5" ? "socks5" : "http"}://${pHost}:${pPort}`,
              ...(pUser ? { username: String(pUser) } : {}),
              ...(pPass ? { password: String(pPass) } : {}),
            };
            console.log(`   [PROXY] Profile ${profileId.slice(0, 8)}: using ${pType}://${pHost}:${pPort}`);
          } else {
            console.log(`   [PROXY] Profile ${profileId.slice(0, 8)}: no proxy configured in GPM`);
          }
          // UA
          const ua = row?.user_agent || row?.userAgent || row?.ua || "";
          if (ua && ua.length > 20) profileUserAgent = ua;
        }
      }
    } catch (proxyLookupErr) {
      console.warn(`   [PROXY] GPM proxy lookup failed (${proxyLookupErr.message}). Proceeding without proxy.`);
    }

    // -------------------------------------------------------------------------
    // TIER 2: Cookie Bridge
    // -------------------------------------------------------------------------
    const cachedCookies = loadProfileSession(profileId);
    if (cachedCookies && cachedCookies.length > 0) {
      console.log(`   [COOKIE-BRIDGE] Found ${cachedCookies.length} session cookies for ${profileId.slice(0, 8)}. Launching clean context...`);
      let bBrowser = null;
      let bContext = null;
      try {
        bBrowser = await chromium.launch({
          headless: config.headless !== false,
          executablePath: chromePath,
          args: LAUNCH_ARGS,
          ...(profileProxyConfig ? { proxy: profileProxyConfig } : {}),
          timeout: 20000,
        });
        registerCloser(async () => { try { await bBrowser?.close(); } catch { /* ignore */ } });
        bContext = await bBrowser.newContext({
          userAgent: profileUserAgent,
          viewport: { width: 1440, height: 900 },
        });
        registerCloser(async () => { try { await bContext?.close(); } catch { /* ignore */ } });
        activeContexts.add(bContext);

        // Skip cookies that Playwright cannot accept.
        const formatted = [];
        for (const c of cachedCookies) {
          if (!c || !c.name || typeof c.value !== "string") continue;
          let domain = String(c.domain || "");
          if (domain && !domain.startsWith(".")) domain = "." + domain;
          if (!domain) continue; // addCookies will reject hostless cookies
          // __Host- prefix forbids domain.
          if (String(c.name).startsWith("__Host-")) domain = undefined;
          let sameSite = "None";
          const ss = String(c.sameSite || "").toLowerCase();
          if (ss === "lax") sameSite = "Lax";
          else if (ss === "strict") sameSite = "Strict";
          else if (ss === "no_restriction" || ss === "none" || ss === "unspecified" || !ss) sameSite = "None";
          formatted.push({
            name: c.name,
            value: c.value,
            domain: domain,
            path: c.path || "/",
            expires: c.expirationDate || c.expires || (Math.floor(Date.now() / 1000) + 86400 * 30),
            httpOnly: !!c.httpOnly,
            secure: c.secure !== false,
            sameSite,
          });
        }

        let cookiesAdded = false;
        try {
          if (formatted.length) {
            await bContext.addCookies(formatted);
            cookiesAdded = true;
          }
        } catch (addErr) {
          console.warn(`   [COOKIE-BRIDGE] Bulk addCookies failed (${addErr.message}). Trying one-by-one...`);
          for (const c of formatted) {
            try { await bContext.addCookies([c]); cookiesAdded = true; } catch { /* skip bad cookie */ }
          }
        }

        if (!cookiesAdded) {
          console.warn(`   [COOKIE-BRIDGE] No cookies could be added. Falling back to Tier 3.`);
          lastError = "no_cookies_added";
        } else {
          const bPage = await bContext.newPage();
          registerCloser(async () => { try { await bPage?.close(); } catch { /* ignore */ } });
          const res = await scrapePageMetrics(bPage, bContext, profileDir, profileId, detectedHandle, "cookie_bridge");
          if (res.success && res.data && res.data.username) {
            const d = res.data;
            const videosList = Array.isArray(d.videosList) ? d.videosList : [];
            const postRewards = Array.isArray(d.postRewards) ? d.postRewards : [];
            const declaredVideoCount = Number(d.totalVideos || d.videoCount || 0);
            const isMonetizedAccount = postRewards.length > 0;
            // Only call the session "degraded" when it truly looks like a redirect-to-login:
            // a real empty account has declaredVideoCount === 0.
            const contentPageFailed =
              d.followersCount === 0 &&
              (d.totalViews ?? 0) === 0 &&
              declaredVideoCount > 0;
            const videosOnlyFromRewards = videosList.length > 0 && videosList.length <= postRewards.length;
            const massiveVideoGap = declaredVideoCount > 100 && videosList.length < declaredVideoCount * 0.5;
            const isDegradedSession = isMonetizedAccount && contentPageFailed && (videosOnlyFromRewards || massiveVideoGap);

            if (isDegradedSession) {
              console.warn(
                `   [COOKIE-BRIDGE] DEGRADED SESSION for @${d.username}: ` +
                `followers=${d.followersCount}, totalViews=${d.totalViews}, ` +
                `videosList=${videosList.length}, declared=${declaredVideoCount}. Forcing Tier 3...`
              );
              clearProfileSession(profileId);
              lastError = "degraded_cookie_bridge_content_redirect";
            } else {
              console.log(`   [COOKIE-BRIDGE] Tier 2 extraction succeeded for @${d.username} (${d.videoCount} videos)`);
              return res;
            }
          } else {
            console.warn(`   [COOKIE-BRIDGE] Invalid session. Falling back to Tier 3...`);
            clearProfileSession(profileId);
            lastError = res.error || "incomplete_cookie_bridge_data";
          }
        }
      } catch (bridgeErr) {
        console.warn(`   [COOKIE-BRIDGE] Error: ${bridgeErr.message}. Falling back...`);
        lastError = bridgeErr.message;
      } finally {
        if (bContext) {
          activeContexts.delete(bContext);
          try { await cap(bContext.close(), 3000); } catch { /* ignore */ }
        }
        if (bBrowser) { try { await cap(bBrowser.close(), 3000); } catch { /* ignore */ } }
      }
    }

    // -------------------------------------------------------------------------
    // TIER 3: Snapshot
    // -------------------------------------------------------------------------
    console.log(`   [SNAPSHOT] Running Tier 3 minimal snapshot for ${profileId.slice(0, 8)}...`);
    const snapshotResult = await createMinimalProfileSnapshot(profileDir, profileId);
    if (!snapshotResult || !snapshotResult.tempDir) {
      return { success: false, error: snapshotResult?.error || "Khong the tao snapshot profile" };
    }

    const { tempDir, cookiesLocked } = snapshotResult;
    if (cookiesLocked) {
      console.warn(`   [SNAPSHOT] Network\\Cookies is locked. Profile is in use.`);
      cleanupTempDir(tempDir);
      return { success: false, error: "profile_in_use_cookies_locked" };
    }

    let snapContext = null;
    try {
      snapContext = await chromium.launchPersistentContext(tempDir, {
        headless: config.headless !== false,
        executablePath: chromePath,
        args: LAUNCH_ARGS,
        userAgent: profileUserAgent,
        viewport: { width: 1440, height: 900 },
        ...(profileProxyConfig ? { proxy: profileProxyConfig } : {}),
        timeout: 20000,
      });
      registerCloser(async () => { try { await snapContext?.close(); } catch { /* ignore */ } });
      activeContexts.add(snapContext);
      const snapPage = await snapContext.newPage();
      registerCloser(async () => { try { await snapPage?.close(); } catch { /* ignore */ } });
      const res = await scrapePageMetrics(snapPage, snapContext, profileDir, profileId, detectedHandle, "snapshot");
      if (res.success) {
        console.log(`   [SNAPSHOT] Tier 3 extraction succeeded for @${res.data.username}`);
        try {
          const freshCookies = await snapContext.cookies(["https://www.tiktok.com", "https://tiktok.com"]);
          if (freshCookies?.length) saveProfileSession(profileId, freshCookies);
        } catch { /* ignore */ }
        return res;
      }
      // Tier 3 also failed — log so there's a trace before returning the failure.
      console.warn(`   [SNAPSHOT] Tier 3 extraction failed: ${res.error || lastError || "unknown"}. All tiers exhausted.`);
      return { success: false, error: res.error || lastError || "snapshot_extraction_failed" };
    } catch (snapErr) {
      return { success: false, error: snapErr.message || lastError || "Snapshot extraction failed" };
    } finally {
      if (snapContext) {
        activeContexts.delete(snapContext);
        try { await cap(snapContext.close(), 3000); } catch { /* ignore */ }
      }
      cleanupTempDir(tempDir);
    }
  });
}

// ==========================================
// 8. MAIN SECURE AGENT EXECUTION
// ==========================================
const isDaemon = process.argv.includes("--daemon");

async function isJobCancelled(jobId) {
  if (!jobId) return false;
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.cancelledJobIds) && data.cancelledJobIds.includes(jobId)) return true;
      if (data.cancelledJobId && data.cancelledJobId === jobId) return true;
    }
  } catch { /* ignore */ }
  return false;
}

/**
 * Lightweight inventory synchronization without launching browsers or deep scraping.
 * Used on daemon startup and inventory updates to inform the server of local profiles.
 */
async function syncProfilesInventoryOnly() {
  const tokenOk = await verifyPersonalTokenAtStartup();
  if (!tokenOk && config.tokenRevoked) return { success: false, reason: "token_revoked" };

  const storagePath = getGpmStoragePath();
  const gpmApi = await discoverGpmApiBase().catch(() => ({ online: false, base: null, port: null }));
  sweepStaleTempDirs(storagePath);

  if (!fs.existsSync(storagePath)) return { success: false, reason: "no_storage_dir" };

  const allEntries = fs.readdirSync(storagePath, { withFileTypes: true });
  const diskDirs = allEntries.filter(
    (e) =>
      e.isDirectory() &&
      !e.name.startsWith("_") &&
      /^[0-9a-f-]{36}$/i.test(e.name) &&
      fs.existsSync(path.join(storagePath, e.name, "Default"))
  );

  let allowedIds = null;
  let apiOffline = !gpmApi.online || !gpmApi.base;
  let apiListTruncated = false;
  if (!apiOffline) {
    try {
      const rows = await fetchAllGpmProfiles(gpmApi.base);
      allowedIds = new Set(rows.map((r) => String(r.id)));
      apiListTruncated = !!rows.truncated;
    } catch {
      apiOffline = true;
    }
  }

  const useApiFilter = allowedIds && !apiListTruncated;
  const profileDirs = diskDirs.filter((e) => {
    if (useApiFilter) return allowedIds.has(e.name);
    if (allowedIds && allowedIds.size === 0 && !apiListTruncated && !apiOffline) return false;
    return true;
  });

  const profilesToSync = [];
  await pMap(profileDirs, async (p) => {
    const fullDir = path.join(storagePath, p.name);
    const meta = readGpmProfileMetaFromDisk(storagePath, p.name);
    const profileName = meta.name || `Profile ${p.name.slice(0, 8)}`;
    let groupName = meta.groupName || null;
    if (!groupName && meta.groupId) {
      groupName = await lookupGpmGroupName(useApiFilter ? gpmApi.base : null, meta.groupId);
    }
    let handle = null;
    try { handle = await findTikTokHandleInProfileAsync(fullDir); } catch { handle = null; }
    profilesToSync.push({
      id: p.name,
      name: profileName,
      groupId: meta.groupId || null,
      groupName: groupName || null,
      tiktokHandle: handle,
    });
  }, Math.max(2, Math.min(cpuCount, 8)));

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        gpmPort: gpmApi?.port || null,
        gpmOnline: !!gpmApi?.online,
        gpmBaseUrl: gpmApi?.base || null,
        profiles: profilesToSync.map((p) => ({
          id: p.id,
          name: p.name,
          group_id: p.groupId || undefined,
          group_name: p.groupName || undefined,
          tiktokHandle: p.tiktokHandle || null,
        })),
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      console.log(`[*] [Inventory] Da dong bo ${profilesToSync.length} profiles len Server.`);
    }
  } catch (err) {
    console.warn("[!] Dong bo inventory that bai:", err.message);
  }
}

async function performFullSweep(syncJob = null) {
  const jobId = (typeof syncJob === "object" && syncJob !== null) ? (syncJob.id || syncJob.jobId) : syncJob;
  const targetProfileId = (typeof syncJob === "object" && syncJob !== null) ? syncJob.targetProfileId : null;
  const targetHandle = (typeof syncJob === "object" && syncJob !== null) ? syncJob.targetHandle : null;

  console.log("\n========================================================");
  console.log("   [TIKTOKFLOW] SECURE CLIENT AGENT (DEEP SWEEPER)      ");
  console.log("========================================================");
  console.log(`[+] Server URL    : ${config.serverUrl}`);
  console.log(`[+] Nhan vien     : ${config.memberEmail}`);
  console.log(`[+] Concurrency   : ${config.concurrency} luong ngam song song`);
  console.log(`[+] Che do        : ${config.headless ? "Headless Vo hinh (Bao mat 100%)" : "Hien thi cua so"}`);
  if (targetProfileId || targetHandle) {
    console.log(`[+] Che do quet   : Chi dinh 1 Profile (${targetProfileId || ""} @${targetHandle || ""})`);
  }
  console.log("--------------------------------------------------------");

  const tokenOk = await verifyPersonalTokenAtStartup();
  if (!tokenOk && config.tokenRevoked) {
    console.error("[!] Dung quet — can nhap Personal Token moi truoc khi tiep tuc.");
    return { successCount: 0, failCount: 0, profilesCount: 0 };
  }

  const storagePath = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const gpmApi = await discoverGpmApiBase();

  sweepStaleTempDirs(storagePath);

  console.log(`[*] Thu muc Profiles (Read-Only): ${storagePath}`);
  console.log(`[*] Trinh duyet Chrome: ${chromePath || "Playwright Chromium tich hop"}`);
  if (gpmApi.online) {
    console.log(`[*] GPMLogin API: Online · localhost:${gpmApi.port} (${gpmApi.base})`);
  } else {
    console.log(`[*] GPMLogin API: Offline (da do cong 9495/19995/19996…). Agent van quet o dia Profiles.`);
  }

  if (!fs.existsSync(storagePath)) {
    console.error(`[!] LOI: Khong tim thay thu muc profile GPMLogin tai:\n   ${storagePath}`);
    return { successCount: 0, failCount: 0, profilesCount: 0 };
  }

  const allEntries = fs.readdirSync(storagePath, { withFileTypes: true });
  const diskDirs = allEntries.filter(
    (e) =>
      e.isDirectory() &&
      !e.name.startsWith("_") &&
      /^[0-9a-f-]{36}$/i.test(e.name) &&
      fs.existsSync(path.join(storagePath, e.name, "Default"))
  );

  // Fetch allowed GPM IDs. Distinguish "API offline" from "API returned 0".
  let allowedIds = null;
  let apiOffline = !gpmApi.online || !gpmApi.base;
  let apiListTruncated = false;
  if (!apiOffline) {
    try {
      const rows = await fetchAllGpmProfiles(gpmApi.base);
      allowedIds = new Set(rows.map((r) => String(r.id)));
      apiListTruncated = !!rows.truncated;
      console.log(`[*] GPM API danh sach: ${allowedIds.size} profile${apiListTruncated ? " (WARN: truncated)" : ""}.`);
    } catch (err) {
      console.warn(`[*] Khong doc duoc GPM API list: ${err?.message || err}`);
      apiOffline = true;
    }
  }

  // If the API list is partial, fall back to disk to avoid dropping profiles.
  const useApiFilter = allowedIds && !apiListTruncated;
  if (apiListTruncated) {
    console.warn("[*] GPM API list bi cat ngan — dung toan bo folder tren o dia de tranh bo sot.");
  }

  const openIds = await listOpenProfileIdsFromProcesses(storagePath);
  const profileDirs = diskDirs.filter((e) => {
    if (useApiFilter) return allowedIds.has(e.name);
    if (allowedIds && allowedIds.size === 0 && !apiListTruncated && !apiOffline) {
      // API online but reported 0 — respect it. Do NOT fall back to disk.
      return false;
    }
    return true;
  });

  console.log(
    `[*] Tim thay ${diskDirs.length} folder tren o dia; dong bo ${profileDirs.length} profile hop le` +
    (useApiFilter ? " (theo GPM API)" : (apiOffline ? " (GPM API offline)" : " (fallback disk)"))
  );

  const profilesToSync = [];
  // Parallelise handle detection with a bounded pool.
  await pMap(profileDirs, async (p) => {
    const fullDir = path.join(storagePath, p.name);
    const meta = readGpmProfileMetaFromDisk(storagePath, p.name);
    const profileName = meta.name || `Profile ${p.name.slice(0, 8)}`;
    let groupName = meta.groupName || null;
    if (!groupName && meta.groupId) {
      groupName = await lookupGpmGroupName(useApiFilter ? gpmApi.base : null, meta.groupId);
    }
    let handle = null;
    try { handle = await findTikTokHandleInProfileAsync(fullDir); } catch { handle = null; }
    profilesToSync.push({
      id: p.name,
      name: profileName,
      groupId: meta.groupId || null,
      groupName: groupName || null,
      tiktokHandle: handle,
      fullDir,
    });
  }, Math.max(2, Math.min(cpuCount, 8)));

  // Sync Fleet Inventory
  console.log("\n[>] Dang dong bo danh sach profile len may chu...");
  let authBlocked = config.tokenRevoked;
  if (!config.personalToken) {
    console.warn("   [!] CHUA CO PERSONAL TOKEN: hay chay setup-agent.bat (chon 3) hoac tai lai zip pairing.");
  }

  try {
    const headers = await getAuthHeaders();
    if (!headers.Authorization && config.tokenRevoked) authBlocked = true;
    const res = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        gpmPort: gpmApi?.port || null,
        gpmOnline: !!gpmApi?.online,
        gpmBaseUrl: gpmApi?.base || null,
        profiles: profilesToSync.map((p) => ({
          id: p.id,
          name: p.name,
          group_id: p.groupId || undefined,
          group_name: p.groupName || undefined,
          tiktokHandle: p.tiktokHandle || null,
        })),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      const syncResult = await res.json().catch(() => ({}));
      console.log(`   [OK] Dong bo thanh cong danh sach: ${syncResult.totalScanned || profilesToSync.length} tai khoan ghi nhan.`);
    } else if (res.status === 401 || res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      markTokenRevoked(errData.error, res.status);
      authBlocked = true;
    } else {
      const err = await res.text().catch(() => "");
      console.warn(`   [!] May chu phan hoi (${res.status}):`, err.slice(0, 150));
    }
  } catch (err) {
    console.warn("   [!] Khong the ket noi toi server de dong bo danh sach:", err.message);
  }

  if (authBlocked) {
    console.error("[!] Dung Deep Sweeper — Personal Token can duoc cap nhat truoc.");
    return { successCount: 0, failCount: 0, profilesCount: profilesToSync.length };
  }

  let activeTikTokProfiles = [];
  if (targetProfileId || targetHandle) {
    const matched = profilesToSync.filter((p) => {
      if (targetProfileId && String(p.id).toLowerCase() === String(targetProfileId).toLowerCase()) return true;
      if (targetHandle && p.tiktokHandle && p.tiktokHandle.toLowerCase() === String(targetHandle).toLowerCase()) return true;
      return false;
    });
    if (matched.length > 0) {
      activeTikTokProfiles = [matched[0]];
      console.log(`[*] [Targeted Sync] Chi dong bo 1 profile duoc chi dinh: ${matched[0].name} (${matched[0].id.slice(0, 8)}) @${matched[0].tiktokHandle || "N/A"}`);
    } else {
      console.warn(`[!] [Targeted Sync] Khong tim thay profile (${targetProfileId || targetHandle}) tren may tram nay.`);
      return { successCount: 0, failCount: 0, profilesCount: profilesToSync.length };
    }
  } else {
    const seenHandles = new Set();
    for (const p of profilesToSync) {
      if (p.tiktokHandle) {
        const lower = p.tiktokHandle.toLowerCase();
        if (seenHandles.has(lower)) continue;
        seenHandles.add(lower);
      }
      activeTikTokProfiles.push(p);
    }
  }

  console.log(`\n[*] Bat dau cao so lieu chuyen sau TikTok Studio (${activeTikTokProfiles.length} accounts)...\n`);

  const RELOGIN_ERR_RE = /chua dang nhap|phien dang nhap|unauthenticated_session/i;

  function classifyProfile({ extractError, reportFailed, d, flags }) {
    if (reportFailed) return { bucket: "failed", reason: "report_failed" };
    if (extractError) {
      return RELOGIN_ERR_RE.test(extractError)
        ? { bucket: "relogin_needed", reason: "session" }
        : { bucket: "failed", reason: String(extractError).slice(0, 80) };
    }
    const iStatus = flags?.insightsStatus
      ?? (d.insightsNoData ? "no_data" : d.insightsUnavailable ? "skipped_empty" : "written");
    const rStatus = flags?.rewardsStatus ?? (d.postRewardsPartial ? "partial" : "written");
    const failReason = d.insightsFailReason || flags?.insightsFailReason || null;
    const iIncomplete = iStatus === "skipped_stale" || iStatus === "skipped_empty";

    if (iIncomplete && (failReason === "session" || failReason === "captcha")) {
      return { bucket: "relogin_needed", reason: failReason };
    }
    if (iIncomplete) {
      return {
        bucket: "incomplete_insights",
        status: iStatus,
        reason: failReason || "unknown",
        alsoIncompleteRewards: rStatus === "skipped_empty",
      };
    }
    if (rStatus === "skipped_empty") {
      return {
        bucket: "incomplete_rewards",
        status: rStatus,
        reason: d.rewardsFailReason || "unknown",
      };
    }
    return { bucket: "ok", partialRewards: rStatus === "partial" };
  }

  let jobCancelled = false;
  const outcomes = new Map(); // profile.id -> { username, bucket, status?, reason?, ... }
  const setOutcome = (p, o) =>
    outcomes.set(p.id, { username: p.tiktokHandle || p.id.slice(0, 8), ...o });

  const reportedUsernames = new Set();
  const timeoutMs = Number(config.profileTimeoutMs) || PROFILE_TIMEOUT_DEFAULT_MS;

  const scanOne = async (p, idx, pass = 1, timeoutOverrideMs = null) => {
    try {
      if (isBackgroundSweep && abortCurrentSweep) {
        console.log(`\n[*] Tam dung quet lich trinh ngam de uu tien job dong bo tu nguoi dung.`);
        return;
      }
      if (authBlocked || config.tokenRevoked) {
        setOutcome(p, { bucket: "failed", reason: "auth_blocked" });
        return;
      }
      if (jobId) {
        const cancelled = await isJobCancelled(jobId);
        if (cancelled) {
          jobCancelled = true;
          console.log(`\n[!] Job dong bo ${jobId} da duoc HUY boi nguoi dung tu Web UI.`);
          return;
        }
      }
      if (jobCancelled) return;

      const label = p.tiktokHandle ? `@${p.tiktokHandle}` : `Profile ${p.id.slice(0, 8)}`;
      console.log(`[${idx + 1}/${activeTikTokProfiles.length}] [SCAN] Dang quet ${label}...${pass > 1 ? ` (requeue pass ${pass})` : ""}`);

      const ctl = { closers: new Set() };
      let timer;
      const scanTimeoutMs = timeoutOverrideMs || timeoutMs;
      const result = await Promise.race([
        extractProfileStudio(p.fullDir, p.id, chromePath, p.tiktokHandle, ctl),
        new Promise((_, rej) => {
          timer = setTimeout(() => rej(new Error(`Scan exceeded ${scanTimeoutMs / 1000}s`)), scanTimeoutMs);
        }),
      ]).catch(async (err) => {
        await Promise.allSettled([...ctl.closers].map((fn) => Promise.resolve().then(fn).catch(() => { })));
        return { success: false, error: err.message };
      }).finally(() => { if (timer) clearTimeout(timer); });

      if (result.success && result.data) {
        const d = result.data;
        const normUser = (d.username || "").toLowerCase();
        if (pass === 1 && normUser && reportedUsernames.has(normUser)) {
          console.log(`   [*] @${d.username} da duoc bao cao trong dot quet nay — bo qua trung lap.`);
          return;
        }
        if (normUser) reportedUsernames.add(normUser);

        const activeProgStr = (d.revenueBreakdown?.activePrograms && d.revenueBreakdown.activePrograms.length > 0)
          ? d.revenueBreakdown.activePrograms.map((prog) => `${prog.name}: ${d.currency}${prog.revenue !== null && prog.revenue !== undefined ? prog.revenue : 0}`).join(", ")
          : "Khong co";

        const dailyCount = Array.isArray(d.dailyRevenueBreakdown) ? d.dailyRevenueBreakdown.length : 0;
        const postRewardCount = Array.isArray(d.postRewards) ? d.postRewards.length : 0;
        console.log(
          `   [OK] @${d.username}: ${d.followersCount.toLocaleString()} followers | ` +
          `${(d.totalViews ?? 0).toLocaleString()} views | ` +
          `Total: ${d.currency}${d.totalRevenue !== null ? d.totalRevenue : 0} ` +
          `(7d: ${d.currency}${d.sumRevenue?.revenue7d || 0}, 28d: ${d.currency}${d.sumRevenue?.revenue28d || 0}, 365d: ${d.currency}${d.sumRevenue?.revenue365d || 0}) | ` +
          `Shop: ${d.currency}${d.revenueBreakdown?.tiktokShop?.revenue30d || 0} | ` +
          `Daily Points: ${dailyCount} days | Post Rewards: ${postRewardCount} videos` +
          (d.postRewardsPartial ? " [PARTIAL]" : "") +
          (d.insightsStatus ? ` [insights=${d.insightsStatus}]` : "") +
          (d.creatorRewardsMissing ? " [CANH BAO: BI NGUNG TIKTOK BETA]" : "") +
          ` Active: [${activeProgStr}]`
        );

        const gpmProfileName = d.gpmProfileName || p.name || undefined;
        const gpmGroupName = d.gpmGroupName || p.groupName || undefined;

        let reportOk = false;
        let reportFlags = null;
        let authRetried = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const headers = await getAuthHeaders();
            const reportRes = await fetch(`${config.serverUrl}/api/extension/report`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                ...d,
                postRewards: d.postRewards,
                postRewardsPartial: d.postRewardsPartial,
                creatorRewardsMissing: d.creatorRewardsMissing,
                bannedReason: d.bannedReason,
                gpmProfileName,
                gpmGroupName,
                source: "agent",
                metricsSource: "agent",
                memberEmail: undefined,
                flagsVersion: 1,
              }),
              // Large insightsHistory / postRewards can exceed 30s under DB load.
              signal: AbortSignal.timeout(90000),
            });

            if (reportRes.status === 401 && !authRetried) {
              authRetried = true;
              config.accessExpiresAt = 0;
              attempt--;
              continue;
            }
            if (reportRes.status === 401 || reportRes.status === 403) {
              const errData = await reportRes.json().catch(() => ({}));
              markTokenRevoked(errData.error, reportRes.status);
              authBlocked = true;
              console.warn(`   [!] Bao cao bi tu choi (auth) — dung cac profile con lai.`);
              break;
            }
            if (reportRes.status === 429 || reportRes.status >= 500) {
              const errBody = await reportRes.json().catch(() => ({}));
              const backoffMs = 1500 * (attempt + 1) + Math.floor(Math.random() * 1000);
              console.warn(
                `   [!] Server tra ve ${reportRes.status} khi bao cao @${d.username}` +
                `${errBody?.error ? ` (${errBody.error})` : ""}. Thu lai sau ${backoffMs}ms...`
              );
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
            if (!reportRes.ok) {
              const errBody = await reportRes.json().catch(() => ({}));
              console.warn(
                `   [!] May chu tu choi bao cao @${d.username}: HTTP ${reportRes.status}` +
                `${errBody?.error ? ` — ${errBody.error}` : ""}`
              );
              break;
            }
            reportOk = true;
            reportFlags = (await reportRes.json().catch(() => null))?.flags ?? null;
            console.log(
              `   [REPORT-OK] @${d.username} insights=${reportFlags?.insightsStatus || "?"} rewards=${reportFlags?.rewardsStatus || "?"}`
            );
            break;
          } catch (postErr) {
            if (attempt < 2) {
              const backoffMs = 1500 * (attempt + 1) + Math.floor(Math.random() * 1000);
              console.warn(`   [!] Report @${d.username} attempt ${attempt + 1} loi: ${postErr.message} — retry ${backoffMs}ms`);
              await new Promise((r) => setTimeout(r, backoffMs));
            } else {
              console.warn(`   [!] Khong the gui bao cao @${d.username}:`, postErr.message);
            }
          }
        }

        setOutcome(p, classifyProfile({ reportFailed: !reportOk, d, flags: reportFlags }));
      } else {
        setOutcome(p, classifyProfile({ extractError: result.error || "extract_failed" }));
        console.log(`   [!] ${label}: ${result.error || "Khong the lay so lieu"}`);
      }
    } catch (mapperErr) {
      setOutcome(p, { bucket: "failed", reason: String(mapperErr.message).slice(0, 80) });
      console.warn(`   [!] Mapper error for ${p.id}: ${mapperErr.message}`);
    }
  };

  await pMap(
    activeTikTokProfiles,
    (p, idx) => scanOne(p, idx, 1),
    config.concurrency || 1
  );

  const REQUEUE_MAX = 5;
  const REQUEUE_BUDGET_MS = 90_000;
  const countB = (b) => [...outcomes.values()].filter((o) => o.bucket === b).length;

  let requeueRan = false;
  let requeueSkipped = null;
  const notRetried = [];

  const firstIncomplete = [...outcomes.entries()].filter(([, o]) => o.bucket === "incomplete_insights");
  const insightsEligible = outcomes.size - countB("failed") - countB("relogin_needed");
  const incompleteRate = insightsEligible ? firstIncomplete.length / insightsEligible : 0;

  if (jobCancelled || authBlocked || config.tokenRevoked) {
    requeueSkipped = "cancelled_or_auth";
  } else if (firstIncomplete.length > 0) {
    if (insightsEligible >= 4 && incompleteRate >= 0.5) {
      requeueSkipped = "systemic_insights_failure";
    } else {
      const ordered = firstIncomplete.sort(
        (a, b) => (a[1].status === "skipped_empty" ? 0 : 1) - (b[1].status === "skipped_empty" ? 0 : 1)
      );
      const batch = ordered.slice(0, REQUEUE_MAX);
      for (const [, o] of ordered.slice(REQUEUE_MAX)) {
        notRetried.push({ username: o.username, status: o.status, reason: "requeue_cap" });
      }
      requeueRan = true;
      const t0 = Date.now();
      for (const [id, o] of batch) {
        const left = REQUEUE_BUDGET_MS - (Date.now() - t0);
        if (left <= 5000) {
          notRetried.push({ username: o.username, status: o.status, reason: "requeue_budget" });
          continue;
        }
        const p = activeTikTokProfiles.find((x) => x.id === id);
        if (p) await scanOne(p, 0, 2, left);
      }
    }
  }

  const capList = (arr, n = 20) => ({ items: arr.slice(0, n), truncated: Math.max(0, arr.length - n) });
  const pick = (b) => [...outcomes.values()].filter((o) => o.bucket === b)
    .map((o) => ({ username: o.username, status: o.status, reason: o.reason }));

  const incL = capList(pick("incomplete_insights"));
  const reloginL = capList(pick("relogin_needed"));
  const failedL = capList(pick("failed"));

  const summary = {
    summaryVersion: 1,
    processedCount: outcomes.size,
    ok: countB("ok"),
    incomplete_insights: countB("incomplete_insights"),
    incomplete_rewards: countB("incomplete_rewards"),
    partial_rewards: [...outcomes.values()].filter((o) => o.partialRewards).length,
    alsoIncompleteRewards: [...outcomes.values()].filter((o) => o.alsoIncompleteRewards).length,
    failed: countB("failed"),
    relogin_needed: countB("relogin_needed"),
    requeueRan,
    requeueSkipped,
    incompleteInsights: incL.items,
    incompleteInsightsTruncatedCount: incL.truncated,
    notRetried: notRetried.slice(0, 20),
    notRetriedTotal: notRetried.length,
    reloginNeeded: reloginL.items,
    reloginNeededTruncatedCount: reloginL.truncated,
    failedAccounts: failedL.items,
    failedAccountsTruncatedCount: failedL.truncated,
  };

  const bucketSum = summary.ok + summary.incomplete_insights + summary.incomplete_rewards
    + summary.failed + summary.relogin_needed;
  if (bucketSum !== summary.processedCount) {
    console.warn("[!] bucket sum mismatch", { bucketSum, processed: summary.processedCount, summary });
  }

  console.log("\n========================================================");
  console.log("   [HOAN THANH] QUET SO LIEU TIKTOK STUDIO              ");
  console.log("========================================================");
  console.log(`[OK] ok=${summary.ok} incomplete_insights=${summary.incomplete_insights} ` +
    `incomplete_rewards=${summary.incomplete_rewards} relogin=${summary.relogin_needed} failed=${summary.failed}`);
  console.log(`[*]  Thoi gian hoan tat: ${new Date().toLocaleTimeString("en-GB")}`);
  console.log("--------------------------------------------------------\n");

  return {
    successCount: summary.ok,
    failCount: summary.failed + summary.relogin_needed,
    profilesCount: profilesToSync.length,
    summary,
  };
}

// ==========================================
// 9. DAEMON MODE
// ==========================================
async function fetchServerSchedule() {
  try {
    const portHeaders = {};
    try {
      const gpmApi = await discoverGpmApiBase().catch(() => ({ online: false, port: null }));
      if (gpmApi?.port) portHeaders["x-gpm-port"] = String(gpmApi.port);
      portHeaders["x-gpm-online"] = String(!!gpmApi?.online);
    } catch { /* ignore */ }

    const headers = await getAuthHeaders(portHeaders);
    const res = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("[!] Khong the ket noi lay lich trinh tu Server:", e.message);
  }
  return null;
}

function trimDoneScheduleKeys() {
  const today = new Date().toDateString();
  for (const k of doneScheduleKeys) {
    if (!k.startsWith(today) && !k.includes("_H") && !k.includes("_M")) {
      // Keep today's keys only.
      if (!k.startsWith(today)) doneScheduleKeys.delete(k);
    }
  }
  // Also trim ancient job ids to bound memory.
  if (handledJobIds.size > 500) {
    const arr = [...handledJobIds];
    handledJobIds.clear();
    for (let i = arr.length - 200; i < arr.length; i++) handledJobIds.add(arr[i]);
  }
}

/**
 * Optimistically claim job so it transitions PENDING -> PROCESSING on the server.
 * This prevents the server's 5-minute timeout from auto-cancelling the job.
 */
async function claimJobOnServer(jobId) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "start_job",
        jobId,
        machineId: cachedMachineId || undefined,
        machineName: cachedMachineName || os.hostname(),
      }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Handle one polling tick. Returns true if a sync job or scheduled sweep ran.
 */
async function checkAndRunSchedule(scheduleInfo) {
  if (!scheduleInfo) return false;

  const incomingJob = scheduleInfo.syncJob;
  if (incomingJob?.requestedAt) {
    const sigAt = Number(incomingJob.requestedAt);
    const jobId = incomingJob.id || incomingJob.jobId;
    // Track by ID, not by timestamp (clock skew safe).
    if (jobId && handledJobIds.has(String(jobId))) return false;
    if (Date.now() - sigAt > 45 * 60 * 1000) return false; // stale job (> 45 mins)

    // If a background sweep (scheduled/startup) is running, abort it to prioritize user job!
    if (isSweepingActive && isBackgroundSweep) {
      console.log(`\n[*] [SyncQueue] Co job moi (${jobId}) tu Web UI trong khi dang quet ngam. Yeu cau tam dung quet ngam de uu tien job!`);
      abortCurrentSweep = true;
    }

    if (isSweepingActive) {
      console.log(`[*] Dang ban xu ly (${currentJobId ? `Job ${currentJobId}` : "quet ngam"}), cho luot tiep nhan job ${jobId}...`);
      // Optimistically claim job so it transitions PENDING -> PROCESSING on server
      // and does NOT get auto-cancelled after 5 minutes!
      if (incomingJob.status === "PENDING" && jobId) {
        claimJobOnServer(jobId).catch(() => { });
      }
      return false;
    }

    handledJobIds.add(String(jobId));
    lastHandledJobAt = Date.now();
    isSweepingActive = true;
    isBackgroundSweep = false;
    abortCurrentSweep = false;
    currentJobId = jobId;
    console.log(`\n[*] [SyncQueue] Nhan job dong bo tu Web/VPS (Job: ${jobId || "N/A"})! Bat dau quet ngay...`);

    try {
      const headers = await getAuthHeaders();

      // 1. Report job started (PROCESSING) — race-safe claim.
      // The server atomically transitions PENDING → PROCESSING. If another Agent
      // already claimed it, we get 409 and MUST NOT run the sweep.
      let startWon = true;
      if (jobId) {
        try {
          const startRes = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              action: "start_job",
              jobId,
              machineId: cachedMachineId || undefined,
              machineName: cachedMachineName || os.hostname(),
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (startRes.status === 409) {
            const errBody = await startRes.json().catch(() => ({}));
            console.log(
              `[*] Job ${jobId} đã được Agent khác tiếp nhận (${errBody?.reason || "already_claimed"}) — bỏ qua.`
            );
            startWon = false;
          } else if (startRes.status === 401 || startRes.status === 403) {
            // Token invalid/revoked — do not run the sweep.
            console.warn(`[!] Không thể bắt đầu job (HTTP ${startRes.status}) — bỏ qua.`);
            startWon = false;
          } else if (!startRes.ok && startRes.status !== 200) {
            // Any other non-OK response: log but proceed, to avoid starving the fleet
            // over a transient server hiccup. The job will still get its result.
            console.warn(`[!] Server trả về HTTP ${startRes.status} khi start_job — vẫn tiếp tục quét.`);
          }
        } catch (e) {
          // Network error: proceed. The server will time out the PENDING job if we
          // never reach it. Better to attempt a sweep than to drop the request.
          console.warn("[!] Khong the bao cao bat dau job:", e.message);
        }
      }

      // If another Agent won the claim (or auth failed), release state and bail.
      if (!startWon) {
        isSweepingActive = false;
        currentJobId = null;
        return false;
      }

      // 2. Perform sweep (passes targetProfileId / targetHandle if single account)
      let stats = { successCount: 0, failCount: 0, profilesCount: 0 };
      try {
        stats = await performFullSweep(incomingJob);
        if (jobId) {
          const summary = stats?.summary
            ? JSON.stringify(stats.summary)
            : (stats?.successCount > 0
              ? `Đã đồng bộ ${stats.profilesCount} profile (quét thành công ${stats.successCount} tài khoản)`
              : `Đã đồng bộ ${stats?.profilesCount || 0} profile GPMLogin`);
          const headers2 = await getAuthHeaders();
          await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
            method: "POST",
            headers: headers2,
            body: JSON.stringify({
              action: "complete_job",
              jobId,
              successCount: stats?.successCount || 0,
              failCount: stats?.failCount || 0,
              profilesCount: stats?.profilesCount || 0,
              resultSummary: summary,
            }),
            signal: AbortSignal.timeout(15000),
          }).catch(() => { });
        }
      } catch (err) {
        if (jobId) {
          const headers2 = await getAuthHeaders().catch(() => ({}));
          await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
            method: "POST",
            headers: headers2,
            body: JSON.stringify({
              action: "fail_job",
              jobId,
              errorMessage: err.message || "Loi quet tu Client Agent",
            }),
            signal: AbortSignal.timeout(15000),
          }).catch(() => { });
        }
      }
    } finally {
      isSweepingActive = false;
      currentJobId = null;
    }
    return true;
  }

  // Time-based schedules.
  const now = new Date();
  const currentHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayStr = now.toDateString();
  trimDoneScheduleKeys();

  const sweeper = scheduleInfo.sweeperSchedule;
  const isAuto = sweeper?.autoEnabled ?? scheduleInfo.autoEnabled ?? true;
  if (!isAuto) return false;

  const schedules = sweeper?.schedules || scheduleInfo.rawSchedule?.schedules || [
    { repeat: "DAILY", timeOfDay: "18:00", enabled: true },
  ];

  let ran = false;
  for (const s of schedules) {
    if (!s.enabled) continue;

    if (s.repeat === "DAILY") {
      const targetTime = s.timeOfDay || "18:00";
      const key = `${todayStr}_D_${targetTime}`;
      // Fire once the wall clock reaches the target; if the daemon was asleep, still fires on wake.
      if (currentHM >= targetTime && !doneScheduleKeys.has(key)) {
        doneScheduleKeys.add(key);
        console.log(`\n[*] [Lich Trinh Server] Kich hoat quet vet luc ${targetTime}...`);
        isSweepingActive = true;
        isBackgroundSweep = true;
        abortCurrentSweep = false;
        try { await performFullSweep(); } finally { isSweepingActive = false; isBackgroundSweep = false; }
        ran = true;
      }
    } else if (s.repeat === "HOURLY") {
      const h = Math.max(1, Number(s.everyCount) || 1);
      if (now.getHours() % h === 0) {
        const key = `${todayStr}_H${now.getHours()}_E${h}`;
        if (!doneScheduleKeys.has(key)) {
          doneScheduleKeys.add(key);
          console.log(`\n[*] [Lich Trinh Server] Kich hoat quet vet moi ${h} gio...`);
          isSweepingActive = true;
          isBackgroundSweep = true;
          abortCurrentSweep = false;
          try { await performFullSweep(); } finally { isSweepingActive = false; isBackgroundSweep = false; }
          ran = true;
        }
      }
    } else if (s.repeat === "CUSTOM" && s.intervalMinutes) {
      const m = Number(s.intervalMinutes) || 60;
      const totalMin = now.getHours() * 60 + now.getMinutes();
      const slot = Math.floor(totalMin / m);
      const key = `${todayStr}_M${slot}_E${m}`;
      if (!doneScheduleKeys.has(key)) {
        doneScheduleKeys.add(key);
        console.log(`\n[*] [Lich Trinh Tuy Bien Server] Kich hoat quet vet moi ${m} phut...`);
        isSweepingActive = true;
        isBackgroundSweep = true;
        abortCurrentSweep = false;
        try { await performFullSweep(); } finally { isSweepingActive = false; isBackgroundSweep = false; }
        ran = true;
      }
    }
  }
  return ran;
}

async function runDaemon() {
  console.log("\n========================================================");
  console.log("   TIKTOKFLOW CLIENT AGENT - DAEMON CHAY NGAM           ");
  console.log("========================================================");
  console.log(`Server URL       : ${config.serverUrl}`);
  console.log(`Nhan vien        : ${config.memberEmail}`);
  console.log(`Che do           : Tu dong chay ngam theo lich Setting tren Server`);
  console.log("--------------------------------------------------------\n");

  let activeSchedule = await fetchServerSchedule();
  if (activeSchedule) {
    console.log(`[*] Lich quet tu Server: ${activeSchedule.scheduleSummary || "Hang ngay luc 18:00"}`);
  }
  const initialHandled = await checkAndRunSchedule(activeSchedule);

  // On startup: synchronize profile inventory only (lightweight, zero browsers launched).
  // Do NOT launch a full 15-profile scraping sweep at Windows startup,
  // which monopolizes the agent for 5-10 minutes and blocks all manual sync jobs!
  if (!initialHandled) {
    console.log("[*] [Khoi Dong Cung Windows] Dong bo danh sach Profile len Server (khong mo trinh duyet)...");
    (async () => {
      try {
        await syncProfilesInventoryOnly();
      } catch (err) {
        console.warn("[!] Dong bo danh sach ban dau gap loi:", err.message);
      }
    })();
  }

  // Non-overlapping poll loop.
  while (true) {
    try {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const refreshed = await fetchServerSchedule();
      if (refreshed) activeSchedule = refreshed;
      await checkAndRunSchedule(activeSchedule);
    } catch (err) {
      console.warn("[!] Loi vong lap kiem tra:", err?.message || err);
    }
  }
}

// ==========================================
// MAIN ENTRY
// ==========================================
const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = !!argvPath && (
  process.platform === "win32"
    ? scriptPath.toLowerCase() === argvPath.toLowerCase()
    : scriptPath === argvPath
);

if (isMain) {
  (async () => {
    try {
      computeMachineFingerprint();
      console.log(`[*] Machine fingerprint: ${cachedMachineId.slice(0, 12)}…${machineFpDegraded ? " (degraded)" : ""}`);
    } catch (err) {
      console.warn("[!] Fingerprint loi:", err.message);
    }

    const locked = await acquireAgentLock();
    if (!locked) process.exit(1);

    try {
      if (isDaemon) {
        await runDaemon();
      } else {
        await performFullSweep();
        releaseAgentLock();
      }
    } catch (err) {
      console.error(isDaemon ? "[LOI] Loi Daemon:" : "[LOI] Loi nghiem trong:", err);
      await emergencyCleanup();
      process.exit(1);
    }
  })();
}
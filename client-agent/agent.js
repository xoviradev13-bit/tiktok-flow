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
export const M10N_MAX_CONCURRENT_PROGRAMS = 2; // Bounded parallelism per profile
export const M10N_PAGE_PACING_MS = 150;        // Inter-page delay to prevent rate-limiting

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
const RESOLVE_OVERALL_TIMEOUT_MS = 15000;

let lockServer = null;
let lockHeld = false;
let cachedMachineId = "";
let cachedMachineName = "";
let cachedOsUsername = "";
/** Cap concurrent resolves so hundreds of open profiles don't serialize or stampede disk/CDP. */
const MAX_CONCURRENT_RESOLVES = 16;
let resolveActive = 0;
const resolveWaitQueue = [];
let attestRateHits = [];
/** Shared open-profile snapshot across concurrent resolve calls. */
let openProfilesSnapshot = {
  at: 0,
  storagePath: null,
  openProfiles: [],
  apiOnline: false,
  gpm: null,
  scanAllDirsOnly: false,
};

// ==========================================
// 0.1 PER-PROFILE MUTEX & SESSION COOKIE CACHE
// ==========================================
const SESSIONS_DIR = path.join(AGENT_LOCK_DIR, "sessions");
try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch { }

const activeProfileCookies = new Map(); // profileId -> { at: number, cookies: array }
const profileLocks = new Map(); // profileId -> Promise chain

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
  return next;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours max TTL for cached sessions

export function saveProfileSession(profileId, cookies) {
  if (!profileId || !Array.isArray(cookies) || !cookies.length) return;
  const hasAuth = cookies.some(
    (c) => c.name === "sessionid" || c.name === "sessionid_ss" || c.name === "sid_tt"
  );
  if (!hasAuth) return;
  const normId = String(profileId).toLowerCase();
  activeProfileCookies.set(normId, { at: Date.now(), cookies });
  try {
    const file = path.join(SESSIONS_DIR, `${normId}.json`);
    fs.writeFileSync(file, JSON.stringify({ at: Date.now(), cookies }), "utf8");
  } catch { }
}

export function loadProfileSession(profileId) {
  if (!profileId) return null;
  const normId = String(profileId).toLowerCase();
  const mem = activeProfileCookies.get(normId);
  if (mem && (Date.now() - mem.at < SESSION_TTL_MS)) {
    return mem.cookies;
  }
  try {
    const file = path.join(SESSIONS_DIR, `${normId}.json`);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data && Array.isArray(data.cookies) && (Date.now() - (data.at || 0) < SESSION_TTL_MS)) {
        activeProfileCookies.set(normId, { at: data.at || Date.now(), cookies: data.cookies });
        return data.cookies;
      }
    }
  } catch { }
  return null;
}

export function clearProfileSession(profileId) {
  if (!profileId) return;
  const normId = String(profileId).toLowerCase();
  activeProfileCookies.delete(normId);
  try {
    const file = path.join(SESSIONS_DIR, `${normId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch { }
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
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
  if (NAME_TO_COUNTRY_CODE[trimmed]) {
    return NAME_TO_COUNTRY_CODE[trimmed];
  }
  const code = extractCountryIso(raw, fromStore);
  if (code && CODE_TO_COUNTRY_CODE[code]) {
    return CODE_TO_COUNTRY_CODE[code];
  }
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
  if (cachedMachineId) {
    return {
      machineId: cachedMachineId,
      machineName: cachedMachineName,
      osUsername: cachedOsUsername,
    };
  }
  try {
    if (fs.existsSync(MACHINE_FP_CACHE)) {
      const cached = JSON.parse(fs.readFileSync(MACHINE_FP_CACHE, "utf8"));
      if (
        cached.machineId &&
        cached.at &&
        Date.now() - Number(cached.at) < MACHINE_FP_TTL_MS
      ) {
        cachedMachineId = cached.machineId;
        cachedMachineName = cached.machineName || os.hostname();
        cachedOsUsername = cached.osUsername || os.userInfo().username || "";
        return {
          machineId: cachedMachineId,
          machineName: cachedMachineName,
          osUsername: cachedOsUsername,
        };
      }
    }
  } catch {
    /* ignore */
  }

  let machineGuid = "";
  let boardUuid = "";
  try {
    machineGuid = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"',
      { encoding: "utf8", timeout: 15000 }
    ).trim();
  } catch {
    machineGuid = "";
  }
  try {
    boardUuid = execSync(
      'powershell -NoProfile -Command "(Get-ItemProperty -Path \'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\' -Name MachineGuid).MachineGuid"',
      { encoding: "utf8", timeout: 15000 }
    ).trim();
  } catch {
    boardUuid = "";
  }
  const raw = `${machineGuid}|${boardUuid}|${os.hostname()}`;
  cachedMachineId = crypto.createHash("sha256").update(raw).digest("hex");
  cachedMachineName = os.hostname();
  cachedOsUsername = os.userInfo().username || "";
  try {
    fs.mkdirSync(PROGRAM_DATA_DIR, { recursive: true });
    fs.writeFileSync(
      MACHINE_FP_CACHE,
      JSON.stringify({
        machineId: cachedMachineId,
        machineName: cachedMachineName,
        osUsername: cachedOsUsername,
        at: Date.now(),
      }),
      "utf8"
    );
  } catch {
    /* ignore */
  }
  return {
    machineId: cachedMachineId,
    machineName: cachedMachineName,
    osUsername: cachedOsUsername,
  };
}

function signAttest({ nonce, challengeTs }) {
  const fp = computeMachineFingerprint();
  const ts = Number(challengeTs);
  if (!nonce || !Number.isFinite(ts)) {
    throw new Error("missing_nonce_or_ts");
  }
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
    const res = await fetch(`${config.serverUrl}/api/extension/challenge`);
    const json = await res.json().catch(() => ({}));
    if (res.ok && Number.isFinite(Number(json.challengeTs))) {
      return Number(json.challengeTs);
    }
  } catch {
    /* ignore */
  }
  if (process.env.NODE_ENV !== "production") return Date.now();
  throw new Error("challenge_unavailable");
}

async function buildAttestFields() {
  const challengeTs = await fetchChallengeTs();
  const nonce = crypto.randomBytes(16).toString("hex");
  return signAttest({ nonce, challengeTs });
}

function signResolveAttest({
  sessionHash,
  gpmProfileId,
  reason,
  nonce,
  challengeTs,
}) {
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
    try {
      lockServer.close();
    } catch {
      /* ignore */
    }
    lockServer = null;
  }
  if (lockHeld) {
    try {
      if (fs.existsSync(AGENT_LOCK_FILE)) {
        const raw = JSON.parse(fs.readFileSync(AGENT_LOCK_FILE, "utf-8"));
        if (raw.pid === process.pid) fs.unlinkSync(AGENT_LOCK_FILE);
      }
    } catch {
      /* ignore */
    }
    lockHeld = false;
  }
}

/** Exclusive bind on 127.0.0.1:39741 — second Agent exits. Port free ⇒ stale lock ignored. */
function acquireAgentLock() {
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
        res.writeHead(204, {
          ...headers,
          "Access-Control-Allow-Origin": origin || "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }


      // Web App / Browser Direct GPM Start Profile Trigger
      if (req.method === "POST" && (urlPath === "/start-profile" || urlPath === "/profiles/start")) {
        const configuredServer = String(config.serverUrl || "").replace(/\/+$/, "").toLowerCase();
        const incomingOrigin = origin.replace(/\/+$/, "").toLowerCase();
        const isAllowedOrigin =
          !incomingOrigin ||
          incomingOrigin === configuredServer ||
          incomingOrigin === "http://localhost:3000" ||
          incomingOrigin === "http://127.0.0.1:3000" ||
          isExtensionOrigin(origin);

        if (!isAllowedOrigin) {
          res.writeHead(403, headers);
          res.end(JSON.stringify({ ok: false, error: "origin_forbidden" }));
          return;
        }

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
          const targetPort = (explicitPort && Number.isFinite(explicitPort) && explicitPort > 0) ? explicitPort : (gpmApi.port || 9495);
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
            } catch { }
          }

          res.writeHead(200, {
            ...headers,
            "Access-Control-Allow-Origin": origin || "*",
          });
          res.end(JSON.stringify({
            ok: !!startedData,
            success: !!startedData,
            data: startedData?.data || startedData,
            port: targetPort,
            profileId,
          }));
          return;
        } catch (err) {
          res.writeHead(500, headers);
          res.end(JSON.stringify({ ok: false, error: err.message }));
          return;
        }
      }

      // Web App / Browser Direct GPM Stop Profile Trigger
      if (req.method === "POST" && (urlPath === "/stop-profile" || urlPath === "/profiles/stop")) {
        try {
          const body = await readBody(req);
          const profileId = body.gpmProfileId || body.profileId;
          const explicitPort = Number(body.port);
          let gpmApi = await discoverGpmApiBase().catch(() => ({ online: false, base: null, port: null }));
          const targetPort = (explicitPort && Number.isFinite(explicitPort) && explicitPort > 0) ? explicitPort : (gpmApi.port || 9495);
          let stopped = false;
          for (const ver of ["v1", "v3"]) {
            try {
              const stopRes = await fetch(`http://127.0.0.1:${targetPort}/api/${ver}/profiles/stop/${profileId}`, {
                signal: AbortSignal.timeout(4000),
              });
              if (stopRes.ok) {
                stopped = true;
                break;
              }
            } catch { }
          }
          res.writeHead(200, {
            ...headers,
            "Access-Control-Allow-Origin": origin || "*",
          });
          res.end(JSON.stringify({ ok: stopped, success: stopped, port: targetPort }));
          return;
        } catch (err) {
          res.writeHead(500, headers);
          res.end(JSON.stringify({ ok: false, error: err.message }));
          return;
        }
      }

      // Health only
      if (
        (req.method === "GET" || req.method === "HEAD") &&
        (urlPath === "/" || urlPath === "")
      ) {
        res.writeHead(200, headers);
        res.end(
          JSON.stringify({
            ok: true,
            role: "tiktokflow-agent",
            pid: process.pid,
            hostname: os.hostname(),
          })
        );
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

          // Machine-wide auth broker: any GPM profile can pull the workstation token.
          // Pairing zip is only needed once (to seed Agent config), not per browser profile.
          if (urlPath === "/bootstrap-extension") {
            if (config.tokenRevoked || !config.personalToken) {
              res.writeHead(401, headers);
              res.end(
                JSON.stringify({
                  ok: false,
                  error:
                    "Client Agent chua co Personal Token. Chay setup-agent.bat (phim 3) hoac cai zip pairing mot lan.",
                  reason: "agent_no_token",
                })
              );
              return;
            }
            res.writeHead(200, headers);
            res.end(
              JSON.stringify({
                ok: true,
                personalToken: config.personalToken,
                serverUrl: config.serverUrl || "",
                memberEmail: config.memberEmail || "",
                memberName: config.memberName || "",
              })
            );
            return;
          }

          // /resolve-browser — serialize + timeouts
          const run = async () => {
            const sessionHash =
              typeof body.sessionHash === "string" ? body.sessionHash.trim() : "";
            const username =
              typeof body.username === "string" ? body.username.trim() : "";
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
              storageBeacon:
                typeof body.storageBeacon === "string"
                  ? body.storageBeacon.trim()
                  : "",
              cookies: Array.isArray(body.cookies) ? body.cookies : null,
            });
          };

          const result = await withResolveSlot(run);
          res.writeHead(200, headers);
          res.end(JSON.stringify(result));
          return;
        } catch (err) {
          res.writeHead(500, headers);
          res.end(
            JSON.stringify({
              ok: false,
              error: err?.message || "internal_error",
            })
          );
          return;
        }
      }

      // Live Cookie Sync Endpoint from Companion Extension
      if (
        req.method === "POST" &&
        (urlPath === "/sync-cookies" || urlPath === "/profiles/sync-cookies")
      ) {
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
          res.writeHead(500, headers);
          res.end(JSON.stringify({ ok: false, error: err.message }));
          return;
        }
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
const CONFIG_FILE = path.join(process.cwd(), "config.json");

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

// Normalize serverUrl
config.serverUrl = (config.serverUrl || "http://localhost:3000").replace(/\/+$/, "");

let persistConfigTimer = null;
function persistConfig(immediate = false) {
  if (immediate) {
    persistConfig.flush();
    return;
  }
  if (persistConfigTimer) clearTimeout(persistConfigTimer);
  persistConfigTimer = setTimeout(() => {
    persistConfigTimer = null;
    persistConfig.flush();
  }, 300);
}

persistConfig.flush = function () {
  if (persistConfigTimer) {
    clearTimeout(persistConfigTimer);
    persistConfigTimer = null;
  }
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    try {
      fs.chmodSync(CONFIG_FILE, 0o600);
    } catch {
      /* Windows may ignore mode; best-effort */
    }
  } catch (err) {
    console.warn("[!] Khong the ghi config.json:", err.message);
  }
};

/**
 * Clear local token after server revoke so the agent cannot keep replaying a dead secret.
 */
function markTokenRevoked(reason, httpStatus) {
  const message =
    reason ||
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
  persistConfig(true); // immediate synchronous flush on token revoke

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
      body: JSON.stringify({
        pairingCode: config.pairingCode,
        ...attest,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.personalToken) {
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
    console.warn("[!] Pairing redeem loi:", err.message);
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
    return true; // offline: don't clear token
  }
}
// 🛡️ User Protection: Hạ độ ưu tiên tiến trình xuống BELOW_NORMAL
// Đảm bảo Windows luôn nhường 100% CPU/I/O cho các ứng dụng người dùng đang mở (Word, Chrome, Game,...)
try {
  if (os.constants?.priority?.PRIORITY_BELOW_NORMAL) {
    os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
  }
} catch { }

// 🚀 Adaptive Concurrency (Vừa nhanh tối đa vừa an toàn tuyệt đối cho người dùng):
// Tự động đo cả số nhân CPU và dung lượng RAM còn trống của máy trạm:
const cpuCount = os.cpus()?.length || 4;
const freeMemGb = os.freemem() / (1024 * 1024 * 1024);

let autoConcurrency = 3;
if (freeMemGb < 1.2) {
  // Machine heavily constrained (<1.2GB RAM free): single worker to avoid thrashing/OOM
  autoConcurrency = 1;
} else if (freeMemGb < 2.5 || cpuCount < 4) {
  // Moderate load or dual-core (<2.5GB RAM free): 2 workers
  autoConcurrency = 2;
} else if (cpuCount >= 12 && freeMemGb >= 6.0) {
  // High-spec workstation (12+ vCPUs, >=6GB RAM free): 5 concurrent workers
  autoConcurrency = 5;
} else if (cpuCount >= 8 && freeMemGb >= 4.0) {
  // Modern standard desktop: 4 concurrent workers
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

// High-Performance & Low-Resource Launch Arguments (Minimal RAM & 0% GPU overhead)
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

// Folders skipped during copy to guarantee instant snapshots (saves ~2GB per profile)
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

// ==========================================
// 2. LIFECYCLE & ZOMBIE KILLER (PROCESS SAFETY)
// ==========================================
const activeTempDirs = new Set();
const activeContexts = new Set();

/**
 * Ironclad cleanup function: Strictly validates that the path is inside os.tmpdir()
 * or .gpm_temp and has our agent prefix before deleting. NEVER touches user files.
 */
function cleanupTempDir(tempDir) {
  if (!tempDir || typeof tempDir !== "string") return;
  try {
    const resolvedTarget = path.resolve(tempDir);
    const resolvedTmp = path.resolve(os.tmpdir());
    const baseName = path.basename(resolvedTarget);

    const isInsideOsTmp = resolvedTarget.startsWith(resolvedTmp) && resolvedTarget !== resolvedTmp;
    const isInsideGpmTemp = resolvedTarget.includes(".gpm_temp");

    // SAFETY CHECK 1: Target must strictly reside within os.tmpdir() or .gpm_temp
    if (!isInsideOsTmp && !isInsideGpmTemp) {
      console.warn("[!] [Bao Ve File] Chan hanh dong xoa ngoai thu muc tam:", resolvedTarget);
      return;
    }

    // SAFETY CHECK 2: Directory name must start with our agent signature prefix
    if (!baseName.startsWith("gpm-agent-") && !baseName.startsWith("agent-")) {
      console.warn("[!] [Bao Ve File] Chan hanh dong xoa thu muc khong phai do Agent tao:", resolvedTarget);
      return;
    }

    if (fs.existsSync(resolvedTarget)) {
      fs.rmSync(resolvedTarget, { recursive: true, force: true });
    }
    activeTempDirs.delete(resolvedTarget);
  } catch (err) {
    // Silent fail on temp cleanup
  }
}

/** Sweeps old leftover agent snapshot directories from .gpm_temp on startup to free disk space */
function sweepStaleTempDirs(storageRoot) {
  if (!storageRoot) return;
  try {
    const tempRoot = path.join(storageRoot, ".gpm_temp");
    if (fs.existsSync(tempRoot)) {
      const entries = fs.readdirSync(tempRoot, { withFileTypes: true });
      let cleaned = 0;
      for (const ent of entries) {
        if (ent.isDirectory() && (ent.name.startsWith("agent-") || ent.name.startsWith("gpm-agent-"))) {
          const fullPath = path.join(tempRoot, ent.name);
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            cleaned++;
          } catch { }
        }
      }
      if (cleaned > 0) {
        console.log(`[*] Da don dep ${cleaned} thu muc snapshot tam cu trong .gpm_temp`);
      }
    }
  } catch { }
}

// Ensure all spawned Chrome instances and temp folders are cleanly destroyed on exit or Ctrl+C
async function emergencyCleanup() {
  persistConfig.flush();
  for (const ctx of activeContexts) {
    try { await ctx.close(); } catch { }
  }
  for (const dir of activeTempDirs) {
    cleanupTempDir(dir);
  }
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
  console.error("\n[LOI] Loi tien trinh khong xac dinh:", err.message);
  await emergencyCleanup();
  process.exit(1);
});

// ==========================================
// 3. READ-ONLY GPM STORAGE & CHROME DISCOVERY
// ==========================================

export function getGpmStoragePath() {
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
        // READ-ONLY inspection
        const content = fs.readFileSync(sPath, "utf-8");
        const parsed = JSON.parse(content);
        const resolvedPath = parsed.local_storage_path || parsed.profile_path || parsed.storage_path;
        if (resolvedPath && fs.existsSync(resolvedPath)) {
          return resolvedPath;
        }
      } catch { }
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
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    } catch { }
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

/** Common GPMLogin local API ports (same set as Extension / server). */
const GPM_PORT_CANDIDATES = [9495, 9496, 19995, 19996, 19994, 8848];
const GPM_API_VERSIONS = ["v1", "v3"];

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
    } catch { }
  }
  return null;
}

/**
 * Probe local GPMLogin HTTP API and return the live base URL + port.
 * Client Agent primarily uses disk profiles; this is for health/logging.
 */
let lastGoodGpmBase = null;

export async function discoverGpmApiBase() {
  const configuredPort = readGpmConfiguredApiPort();
  // Prefer last-known-good, then common live ports, then setting.dat port last.
  // setting.dat often lags (e.g. 19996) while GPM actually serves on 9495 —
  // probing the dead port first burns resolve budget and surfaces as gpm_offline.
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
    // Prefer v1 — v3 on some builds returns a non-list health string for /profiles.
    for (const ver of ["v1", "v3"]) {
      bases.push(`http://127.0.0.1:${port}/api/${ver}`);
    }
  }

  for (const base of bases) {
    const isDeadConfigured =
      configuredPort &&
      base.includes(`:${configuredPort}/`) &&
      !GPM_PORT_CANDIDATES.includes(configuredPort);
    const probeMs = isDeadConfigured ? 600 : 1200;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), probeMs);
    try {
      const resp = await fetch(`${base}/profiles?page=1&per_page=1&page_size=1`, {
        signal: controller.signal,
      });
      if (!resp || !resp.ok) continue;
      const json = await resp.json().catch(() => null);
      const rows = normalizeGpmProfileRows(json);
      if (!rows) continue; // reject health-string / empty-shape responses
      const portMatch = base.match(/:(\d+)\//);
      lastGoodGpmBase = base;
      return {
        online: true,
        base,
        port: portMatch ? Number(portMatch[1]) : null,
      };
    } catch {
      /* next */
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    online: false,
    base: null,
    port: lastGoodGpmBase
      ? Number((String(lastGoodGpmBase).match(/:(\d+)\//) || [])[1]) || 9495
      : configuredPort || 9495,
  };
}

/** Accept only real profile list payloads (not v3 health strings). */
function normalizeGpmProfileRows(json) {
  if (!json || typeof json !== "object") return null;
  const data = json.data;
  let rows = null;
  if (Array.isArray(data)) rows = data;
  else if (data && typeof data === "object" && Array.isArray(data.data)) rows = data.data;
  if (!rows || !rows.length) {
    // empty list is still a valid shape
    if (data && typeof data === "object" && Array.isArray(data.data) && data.data.length === 0) {
      return [];
    }
    if (Array.isArray(data) && data.length === 0) return [];
    return null;
  }
  if (!rows[0] || typeof rows[0] !== "object" || !rows[0].id) return null;
  return rows;
}

/** Robust pagination loop supporting thousands of profiles without boundary drops */
export async function fetchAllGpmProfiles(base) {
  if (!base) return [];
  const all = [];
  const seenIds = new Set();
  let page = 1;
  const maxPages = 100; // up to 10,000 accounts
  while (page <= maxPages) {
    try {
      const resp = await fetch(
        `${base}/profiles?page=${page}&per_page=100&page_size=100`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!resp.ok) break;
      const json = await resp.json().catch(() => ({}));
      const rows = normalizeGpmProfileRows(json) || [];
      if (!rows.length) break;
      let newCount = 0;
      for (const r of rows) {
        const id = String(r.id || "");
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          all.push(r);
          newCount++;
        }
      }
      if (newCount === 0) break;
      const total = Number(json?.data?.total || json?.total);
      const lastPage = Number(json?.data?.last_page || json?.last_page);
      if (lastPage && page >= lastPage) break;
      if (total && all.length >= total) break;
      page++;
    } catch {
      break;
    }
  }
  return all;
}

function profileLooksRunning(p) {
  if (!p || typeof p !== "object") return false;
  const status = String(p.status || p.state || p.run_status || "").toLowerCase();
  if (["running", "open", "started", "active", "1", "true"].includes(status)) {
    return true;
  }
  if (p.is_running === true || p.running === true || p.isRunning === true) {
    return true;
  }
  if (p.is_running === 1 || p.running === 1) return true;
  return false;
}

function hasProfileOpenLock(storageRoot, profileId) {
  try {
    const dir = path.join(storageRoot, String(profileId));
    return (
      fs.existsSync(path.join(dir, "SingletonLock")) ||
      fs.existsSync(path.join(dir, "SingletonSocket")) ||
      fs.existsSync(path.join(dir, "lockfile")) ||
      fs.existsSync(path.join(dir, "DevToolsActivePort"))
    );
  } catch {
    return false;
  }
}

/** True when Chromium SingletonLock points at a still-alive PID (works with GPM app closed). */
function isProfileBrowserAlive(storageRoot, profileId) {
  const dir = path.join(storageRoot, String(profileId));
  const lockPath = path.join(dir, "SingletonLock");
  try {
    let target = "";
    try {
      target = fs.readlinkSync(lockPath);
    } catch {
      try {
        target = fs.readFileSync(lockPath, "utf8");
      } catch {
        target = "";
      }
    }
    const m = String(target || "").match(/-(\d+)\s*$/);
    if (m) {
      const pid = Number(m[1]);
      if (Number.isFinite(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      }
    }
  } catch {
    /* fall through */
  }
  // DevToolsActivePort is only present while the browser is running.
  if (readDevToolsActivePort(storageRoot, profileId)) return true;
  return false;
}

/** Newest Local Extension Settings *.log mtime — expensive on locked LevelDB; prefer cheapOpenMtime. */
function extensionSettingsLogMtime(storageRoot, profileId) {
  const root = path.join(
    storageRoot,
    String(profileId),
    "Default",
    "Local Extension Settings"
  );
  let newest = 0;
  try {
    if (!fs.existsSync(root)) return 0;
    for (const extDir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!extDir.isDirectory()) continue;
      const dir = path.join(root, extDir.name);
      let files = [];
      try {
        files = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".log")) continue;
        try {
          const mt = fs.statSync(path.join(dir, f)).mtimeMs;
          if (mt > newest) newest = mt;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return newest;
}

/** Cheap ranking key — avoid walking locked LevelDB during resolve. */
function cheapOpenMtime(storageRoot, profileId) {
  const dir = path.join(storageRoot, String(profileId));
  for (const rel of ["DevToolsActivePort", "SingletonLock", "lockfile"]) {
    try {
      return fs.statSync(path.join(dir, rel)).mtimeMs || 0;
    } catch {
      /* next */
    }
  }
  return 0;
}

function rankProfilesForBeaconScan(storageRoot, profiles) {
  return [...profiles].sort((a, b) => {
    const mb = cheapOpenMtime(storageRoot, b.id);
    const ma = cheapOpenMtime(storageRoot, a.id);
    return mb - ma;
  });
}

/** Parse open GPM profile ids from Chromium --user-data-dir=...\{uuid}. */
let processOpenCache = { at: 0, root: "", ids: new Set() };
let processScanInFlight = null;

async function listOpenProfileIdsFromProcesses(storageRoot) {
  const rootKey = String(storageRoot || "");
  if (
    Date.now() - processOpenCache.at < 2500 &&
    processOpenCache.root === rootKey &&
    processOpenCache.ids.size
  ) {
    return processOpenCache.ids;
  }

  if (processScanInFlight) {
    return processScanInFlight;
  }

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
        if (rootNorm && lower.startsWith(rootNorm)) {
          open.add(id);
          continue;
        }
        // Also accept UUID dirs that look like GPM storage even if root mismatch
        if (/tiktok\s*automation|gpmlogin|gpm.?login/i.test(lower)) {
          open.add(id);
        }
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
          timeout: 5000,
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
        });
        for (const line of String(stdout || "").split(/\r?\n/)) ingestLine(line);
        if (open.size) break;
      } catch {
        /* try next */
      }
    }

    processOpenCache = { at: Date.now(), root: rootKey, ids: open };
    return open;
  })().finally(() => {
    processScanInFlight = null;
  });

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
      const first = String(fs.readFileSync(file, "utf8") || "")
        .split(/\r?\n/)[0]
        ?.trim();
      const port = Number(first);
      if (Number.isFinite(port) && port > 0) return port;
    }
    return null;
  } catch {
    return null;
  }
}

/** All GPM profile UUID folders on disk (for beacon scan when process detect fails). */
function listAllGpmProfileDirs(storageRoot) {
  if (!storageRoot) return [];
  try {
    return fs
      .readdirSync(storageRoot, { withFileTypes: true })
      .filter((ent) => ent.isDirectory() && /^[0-9a-f-]{36}$/i.test(ent.name))
      .map((ent) => ({
        id: ent.name,
        name: readGpmProfileNameFromDisk(storageRoot, ent.name) || `Profile ${ent.name}`,
        _diskOnly: true,
      }));
  } catch {
    return [];
  }
}

/** Open profiles from process cmdline + live Chromium locks (no GPM HTTP API). */
async function listOpenProfilesFromDisk(storageRoot) {
  const ids = new Set();
  if (!storageRoot) return [];
  const procIds = await listOpenProfileIdsFromProcesses(storageRoot);
  for (const id of procIds) ids.add(id);
  let lockAlive = 0;
  let lockStale = 0;
  try {
    for (const ent of fs.readdirSync(storageRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (!/^[0-9a-f-]{36}$/i.test(ent.name)) continue;
      if (isProfileBrowserAlive(storageRoot, ent.name)) {
        ids.add(ent.name);
        lockAlive += 1;
      } else if (hasProfileOpenLock(storageRoot, ent.name)) {
        lockStale += 1;
      }
    }
  } catch {
    /* ignore */
  }
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
    try {
      json = Buffer.from(raw, "base64").toString("utf8");
    } catch {
      /* already plain */
    }
    const parsed = JSON.parse(json);
    const name = parsed?.name || parsed?.raw_name || null;
    const rawGid =
      parsed?.group_id ??
      parsed?.groupId ??
      parsed?.Group?.id ??
      null;
    const groupId = rawGid !== null && rawGid !== undefined ? String(rawGid) : null;
    const groupName =
      parsed?.group_name ||
      parsed?.groupName ||
      parsed?.Group?.name ||
      null;
    return { name, groupName: groupName || null, groupId };
  } catch {
    return { name: null, groupName: null, groupId: null };
  }
}

function readGpmProfileNameFromDisk(storageRoot, profileId) {
  return readGpmProfileMetaFromDisk(storageRoot, profileId).name;
}

/** Cache GPM groups list while resolving many browsers. */
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

  // Common user directory fallback when running as SYSTEM
  const userProfile = process.env.USERPROFILE || "";
  if (userProfile && !userProfile.includes("systemprofile")) {
    paths.push(path.join(userProfile, "AppData", "Roaming", "TikTokFlow", "gpm-groups-cache.json"));
  }
  return [...new Set(paths)];
}

function gpmGroupsCachePath() {
  const list = gpmGroupsCachePaths();
  for (const p of list) {
    if (fs.existsSync(p)) return p;
  }
  return list[0];
}

function loadGpmGroupsDiskCache() {
  try {
    const candidates = gpmGroupsCachePaths();
    const byId = new Map();
    let loaded = false;
    let foundPath = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = JSON.parse(fs.readFileSync(p, "utf8"));
          const entries = raw?.byId && typeof raw.byId === "object" ? raw.byId : {};
          for (const [k, v] of Object.entries(entries)) {
            byId.set(String(k), String(v));
          }
          gpmGroupsCache = {
            at: Number(raw.at) || Date.now(),
            byId,
            base: raw.base || "disk",
          };
          loaded = true;
          foundPath = p;
          break;
        } catch {
          /* try next candidate */
        }
      }
    }
    if (!loaded) {
      gpmGroupsCache = { at: Date.now(), byId: new Map(), base: null };
    }
    return gpmGroupsCache.byId.size > 0;
  } catch {
    gpmGroupsCache = {
      at: Date.now(),
      byId: new Map(),
      base: null,
    };
    return gpmGroupsCache.byId.size > 0;
  }
}

function saveGpmGroupsDiskCache() {
  try {
    const byId = {};
    for (const [k, v] of gpmGroupsCache.byId.entries()) byId[k] = v;
    const content = JSON.stringify(
      { at: Date.now(), base: gpmGroupsCache.base, byId },
      null,
      2
    );
    for (const p of gpmGroupsCachePaths()) {
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content, "utf8");
      } catch {
        /* best-effort */
      }
    }
  } catch {
    /* ignore */
  }
}

// Seed from last successful Groups API pull (survives GPM app closed).
loadGpmGroupsDiskCache();

async function ensureGpmGroupsCache(gpmBase) {
  // Prefer live API whenever we have a base. Only reuse memory cache if it was
  // filled from that same live base within the last 60s (never skip live for
  // disk/builtin — that caused "GPM open but group names still missing").
  if (
    gpmBase &&
    Date.now() - gpmGroupsCache.at < 60_000 &&
    gpmGroupsCache.byId.size &&
    gpmGroupsCache.base === gpmBase
  ) {
    return true;
  }
  if (!gpmBase) {
    if (Date.now() - gpmGroupsCache.at < 60_000 && gpmGroupsCache.byId.size) {
      return true;
    }
    return loadGpmGroupsDiskCache() || gpmGroupsCache.byId.size > 0;
  }
  try {
    const resp = await fetch(`${gpmBase}/groups?page=1&page_size=200&per_page=200`, {
      signal: AbortSignal.timeout(4000),
    });
    const json = await resp.json().catch(() => ({}));
    const rows = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.data?.data)
        ? json.data.data
        : [];
    const byId = new Map(gpmGroupsCache.byId);
    for (const g of rows) {
      if (g?.id != null && g?.name) byId.set(String(g.id), String(g.name));
    }
    if (byId.size) {
      gpmGroupsCache = { at: Date.now(), byId, base: gpmBase };
      saveGpmGroupsDiskCache();
      return true;
    }
  } catch (err) {
  }
  return loadGpmGroupsDiskCache() || gpmGroupsCache.byId.size > 0;
}

async function lookupGpmGroupName(gpmBase, groupId) {
  const id = String(groupId || "").trim();
  if (!id) return null;
  await ensureGpmGroupsCache(gpmBase || null);
  if (gpmGroupsCache.byId.has(id)) return gpmGroupsCache.byId.get(id);
  // Human-readable id already
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

  // Disk/builtin cache works without live GPM API.
  if (!gpmGroupName && groupId) {
    gpmGroupName = await lookupGpmGroupName(gpmBase || null, groupId);
  }

  if (!gpmGroupName && gpmBase) {
    // Look up profile row for group_id when API is up
    try {
      const resp = await fetch(`${gpmBase}/profiles/${payload.gpmProfileId}`, {
        signal: AbortSignal.timeout(3000),
      });
      const json = await resp.json().catch(() => ({}));
      const row = json?.data || json;
      const gid = row?.group_id || groupId;
      if (row?.group_name) gpmGroupName = row.group_name;
      else if (row?.Group?.name) gpmGroupName = row.Group.name;
      else gpmGroupName = await lookupGpmGroupName(gpmBase, gid);
    } catch {
      /* ignore */
    }
  }


  return { ...payload, gpmProfileName, gpmGroupName: gpmGroupName || undefined };
}

/** Match extension chrome.storage beacon inside Local Extension Settings leveldb. */
async function profileContainsStorageBeaconAsync(storageRoot, profileId, beacon, opts = {}) {
  if (!beacon || beacon.length < 12) return false;
  const logOnly = opts.logOnly === true;
  const root = path.join(
    storageRoot,
    String(profileId),
    "Default",
    "Local Extension Settings"
  );
  if (!fs.existsSync(root)) return false;
  try {
    const extDirs = await fs.promises.readdir(root, { withFileTypes: true });
    for (const extDir of extDirs) {
      if (!extDir.isDirectory()) continue;
      const dir = path.join(root, extDir.name);
      let files = [];
      try {
        files = await fs.promises.readdir(dir);
      } catch {
        continue;
      }
      // Prefer newest .log first (Chrome LevelDB CURRENT write). Skip huge .ldb unless needed.
      const ranked = files
        .filter((f) =>
          logOnly ? f.endsWith(".log") : f.endsWith(".log") || f.endsWith(".ldb")
        )
        .map((f) => {
          const full = path.join(dir, f);
          let mtime = 0;
          try {
            mtime = fs.statSync(full).mtimeMs;
          } catch {
            /* ignore */
          }
          return { f, full, mtime, isLog: f.endsWith(".log") };
        })
        .sort((a, b) => {
          if (a.isLog !== b.isLog) return a.isLog ? -1 : 1;
          return b.mtime - a.mtime;
        });
      // Only the newest log (and at most one ldb fallback) — beacon is unique and fresh.
      const limited = logOnly ? ranked.slice(0, 2) : ranked.slice(0, 4);
      for (const { full } of limited) {
        let text = null;
        try {
          const st = await fs.promises.stat(full);
          const maxTail = Number(opts.maxTail) > 0 ? opts.maxTail : (st.size <= 10 * 1024 * 1024 ? st.size : 4 * 1024 * 1024);
          const handle = await fs.promises.open(full, "r");
          try {
            const start = Math.max(0, st.size - maxTail);
            const len = st.size - start;
            const buf = Buffer.alloc(len);
            await handle.read(buf, 0, len, start);
            text = buf.toString("latin1");
          } finally {
            await handle.close();
          }
        } catch {
          text = null;
        }
        if (text && text.includes(beacon)) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/** Serialize disk beacon scans — concurrent resolves thrashing LevelDB caused 30–70s hits. */
let beaconScanTail = Promise.resolve();
function withBeaconScanLock(fn) {
  const run = beaconScanTail.then(fn, fn);
  beaconScanTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function findOpenProfileByStorageBeacon(storageRoot, openProfiles, beacon) {
  if (!beacon || !storageRoot || !openProfiles?.length) return [];
  return withBeaconScanLock(async () => {
    // Serialization invariant: LevelDB disk reads must NOT execute concurrently across workers
    const ranked = rankProfilesForBeaconScan(storageRoot, openProfiles);
    for (let attempt = 0; attempt < 2; attempt++) {
      const logOnly = attempt === 0;
      for (const p of ranked) {
        let ok = false;
        try {
          ok = await profileContainsStorageBeaconAsync(storageRoot, p.id, beacon, {
            logOnly,
          });
        } catch {
          ok = false;
        }
        if (ok) {
          return [
            {
              id: String(p.id),
              name:
                p.name ||
                readGpmProfileNameFromDisk(storageRoot, p.id) ||
                `Profile ${p.id}`,
            },
          ];
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

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(label || "timeout")),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

/**
 * Resolve which open GPM profile holds a TikTok session hash.
 * Works with GPM app closed: browsers stay open with DevToolsActivePort /
 * --user-data-dir, so we CDP those directly when the HTTP API is offline.
 */
async function resolveBrowserBySessionHash({
  sessionHash,
  username,
  nonce,
  challengeTs,
  storageBeacon,
  cookies,
}) {
  const started = Date.now();
  const finish = async (payload) => {
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
      console.log(`[Agent:resolveBrowser] Profile ${base.gpmProfileId} meta from disk:`, meta);
      const gpmProfileName = base.gpmProfileName || meta.name || null;
      let gpmGroupName = base.gpmGroupName || meta.groupName || null;

      // Sync path first: memory/disk/builtin cache (no network). Group must not depend on
      // live GPM API — otherwise phase-2 reports land with id/name but groupName null.
      if (!gpmGroupName && meta.groupId) {
        if (!gpmGroupsCache.byId.size) loadGpmGroupsDiskCache();
        const gid = String(meta.groupId);
        if (gpmGroupsCache.byId.has(gid)) {
          gpmGroupName = gpmGroupsCache.byId.get(gid);
          console.log(`[Agent:resolveBrowser] Matched groupId ${gid} -> "${gpmGroupName}" in groups cache`);
        } else {
          console.log(`[Agent:resolveBrowser] groupId ${gid} not found in groups cache (${gpmGroupsCache.byId.size} entries)`);
        }
      }

      // Optional live refresh when still missing and API may be up (capped).
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
              console.log("[Agent:resolveBrowser] GPM API is offline; cannot query group name via HTTP");
            }
          } catch {
            gpmApiOfflineUntil = Date.now() + 20_000;
          }
        }
        if (apiBase || gpmGroupsCache.byId.size) {
          gpmGroupName = await Promise.race([
            lookupGpmGroupName(apiBase, meta.groupId),
            new Promise((resolve) => setTimeout(() => resolve(null), 800)),
          ]);
        }
      }

      console.log(`[Agent:resolveBrowser] Final outcome for ${base.gpmProfileId}:`, {
        gpmProfileName,
        gpmGroupName,
        gpmGroupId: meta.groupId,
      });

      return {
        ...base,
        gpmProfileName,
        gpmGroupName: gpmGroupName || undefined,
        gpmGroupId: meta.groupId || undefined,
      };
    } catch (err) {
      return { ...payload, ...attest };
    }
  };

  const storagePath = getGpmStoragePath();

  // Beacon is unique per resolve — scan open profile dirs (locks/PID) even when GPM app is closed.
  // Process cmdline often returns 0 when Agent runs as a service; locks + DevToolsActivePort still work.
  if (storageBeacon && storagePath) {
    let candidates = await listOpenProfilesFromDisk(storagePath);
    const usedAllDirs = !candidates.length;
    if (usedAllDirs) {
      candidates = listAllGpmProfileDirs(storagePath);
    }
    if (candidates.length) {
      const beaconHits = await findOpenProfileByStorageBeacon(
        storagePath,
        candidates,
        storageBeacon
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
      if (beaconHits.length > 1) {
        return finish({ ok: false, reason: "ambiguous" });
      }
    }
  }

  const SNAPSHOT_TTL_MS = 2500;
  let gpm = openProfilesSnapshot.gpm;
  let profiles = [];
  let apiOnline = openProfilesSnapshot.apiOnline;
  let openProfiles = [];
  /** When true, openProfiles is a full dir list — beacon/handle only, never CDP-all. */
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
          { signal: AbortSignal.timeout(5000) }
        );
        const json = await resp.json().catch(() => ({}));
        const rows = normalizeGpmProfileRows(json);
        if (rows) profiles = rows;
        else apiOnline = false;
      } catch {
        apiOnline = false;
      }
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

    if (!openProfiles.length) {
      openProfiles = await listOpenProfilesFromDisk(storagePath);
    }

    // API list exists but nothing looks "open" — still allow beacon against API ids.
    if (!openProfiles.length && profiles.length && storageBeacon) {
      openProfiles = profiles
        .filter((p) => p?.id)
        .map((p) => ({
          id: String(p.id),
          name: p.name || p.raw_name || `Profile ${p.id}`,
        }));
      scanAllDirsOnly = true; // treat as non-CDP set
    }

    if (!openProfiles.length && storagePath && storageBeacon) {
      openProfiles = listAllGpmProfileDirs(storagePath);
      scanAllDirsOnly = true;
    }

    openProfilesSnapshot = {
      at: Date.now(),
      storagePath,
      openProfiles: scanAllDirsOnly ? [] : openProfiles,
      scanAllDirsOnly: false,
      apiOnline,
      gpm,
    };
  }


  if (!openProfiles.length) {
    return finish({
      ok: false,
      reason: apiOnline ? "no_match" : "gpm_offline",
    });
  }

  // Extension storage beacon (works without remote-debugging-port).
  if (storageBeacon && storagePath) {
    const beaconHits = await findOpenProfileByStorageBeacon(
      storagePath,
      openProfiles,
      storageBeacon
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
    if (beaconHits.length > 1) {
      return finish({ ok: false, reason: "ambiguous" });
    }
  }

  // Do not CDP-walk every stale profile folder when process detect failed.
  if (scanAllDirsOnly) {
    const want = String(username || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
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
        } catch {
          /* skip */
        }
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
      if (byHandle.length > 1) {
        return finish({ ok: false, reason: "ambiguous" });
      }
    }
    return finish({ ok: false, reason: "no_match" });
  }

  async function resolveDebugEndpoint(p) {
    const known = extractDebugPortFromProfile(p);
    if (known) return { port: known, profileId: String(p.id), wsUrl: null };

    const diskPort =
      storagePath && readDevToolsActivePort(storagePath, p.id);
    if (diskPort) return { port: diskPort, profileId: String(p.id), wsUrl: null };

    // Only call GPM start when the app/API is actually online.
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
      const wsUrl =
        typeof data?.websocket_debugging_url === "string"
          ? data.websocket_debugging_url
          : null;
      const profileId = String(data?.profile_id || p.id);
      if ((!port || port <= 0) && !wsUrl) return null;
      return { port, profileId, wsUrl };
    } catch {
      return null;
    }
  }

  async function readSessionHashFromEndpoint({ port, wsUrl }) {
    const endpoint = wsUrl || `http://127.0.0.1:${port}`;
    const browser = await chromium.connectOverCDP(endpoint, {
      timeout: RESOLVE_PROFILE_TIMEOUT_MS,
    });
    try {
      const contexts = browser.contexts();
      // Never browser.newContext() — that opens a new window/tab in the live profile.
      if (!contexts.length) return null;
      const cookies = await contexts[0].cookies("https://www.tiktok.com");
      const sessionCookie = cookies.find((c) =>
        ["sessionid", "sessionid_ss", "sid_tt"].includes(c.name)
      );
      if (!sessionCookie?.value) return null;
      return hashSessionCookieValue(sessionCookie.value);
    } finally {
      try {
        browser.close();
      } catch {
        /* ignore */
      }
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
          return {
            id: ep.profileId,
            name: p.name || p.raw_name || `Profile ${ep.profileId}`,
          };
        })(),
        RESOLVE_PROFILE_TIMEOUT_MS,
        "profile_timeout"
      );
      if (hit) matches.push(hit);
    } catch {
      // skip hung profile
    }
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
  if (matches.length > 1) {
    return finish({ ok: false, reason: "ambiguous" });
  }

  // CDP often unavailable: GPM opens browsers without --remote-debugging-port and
  // profiles/start returns ProfileInUse. Fall back to TikTok handle inside OPEN
  // profile folders only (never closed/stale disk UUIDs).
  const want = String(username || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
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
      } catch {
        /* skip */
      }
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
    if (byHandle.length > 1) {
      return finish({ ok: false, reason: "ambiguous" });
    }
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
  return true;
}

/**
 * Score candidate handles from History/LevelDB.
 * Never return the first /@ History URL — that is often a visited public profile.
 * Returns null when the winner is ambiguous (common on multi-visit profiles).
 */
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
  for (const m of blob.matchAll(/(?:tiktokstudio|creator-center|Creator_Center)[\s\S]{0,160}?@([a-zA-Z0-9._]{2,24})(?![a-zA-Z0-9._])/gi)) {
    bump(m[1], 25);
  }
  for (const m of blob.matchAll(/refer_title":"\/@([a-zA-Z0-9._]{2,24})"/g)) bump(m[1], 1);
  for (const m of blob.matchAll(/\(@([a-zA-Z0-9._]{2,24})\)/g)) bump(m[1], 3);
  for (const m of blob.matchAll(/https:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._]{2,24})(?![a-zA-Z0-9._])/g)) {
    bump(m[1], 1);
  }

  let best = null;
  let second = 0;
  for (const val of scores.values()) {
    if (!best || val.score > best.score) {
      if (best) second = Math.max(second, best.score);
      best = val;
    } else if (val.score > second) {
      second = val.score;
    }
  }
  if (!best || best.score < 2) return null;

  // UniqId / uniqueId / screen_name level — always trust
  if (best.score >= 60) return best.casing;

  // History-only: require a clear margin so visited public profiles don't win
  if (best.score - second >= 3 && best.score >= 5) return best.casing;

  return null;
}

export async function readBestEffortAsync(src, maxBytes = 8 * 1024 * 1024) {
  try {
    const buf = await fs.promises.readFile(src);
    return buf.toString("latin1", 0, Math.min(buf.length, maxBytes));
  } catch {
    /* locked while browser open */
  }
  const tmp = path.join(
    os.tmpdir(),
    `ttf-rd-${crypto.randomBytes(6).toString("hex")}`
  );
  try {
    await fs.promises.copyFile(src, tmp);
    const buf = await fs.promises.readFile(tmp);
    return buf.toString("latin1", 0, Math.min(buf.length, maxBytes));
  } catch {
    return null;
  } finally {
    try {
      await fs.promises.unlink(tmp);
    } catch {
      /* ignore */
    }
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
      } catch {
        /* ignore */
      }
    }

    for (const rel of ["Preferences", "Secure Preferences", "Network/Cookies", "Cookies"]) {
      const p = path.join(defaultDir, rel);
      if (!fs.existsSync(p)) continue;
      const t = await readBestEffortAsync(p);
      if (t) chunks.push(t);
    }

    if (!chunks.length) return null;
    return scoreLoggedInHandleFromArtifacts(chunks.join("\n"));
  } catch {
    /* ignore */
  }
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
      if (!res.ok && /cookies/i.test(relPath)) {
        cookiesLocked = true;
      }
      return res.ok;
    };

    // Root files
    await copySafe("Local State");
    await copySafe("gpm_pi.dat");

    // Preferences & Network
    await copySafe("Default/Preferences");
    await copySafe("Default/Secure Preferences");
    await copySafe("Default/Network/Cookies");
    await copySafe("Default/Network/Cookies-journal");
    await copySafe("Default/Network/Cookies-wal");
    await copySafe("Default/Network/Network Persistent State");
    await copySafe("Default/Cookies");
    await copySafe("Default/Cookies-journal");
    await copySafe("Default/Cookies-wal");

    // Local Storage LevelDB files (skip LOCK)
    const levelDbDir = path.join(profileDir, "Default", "Local Storage", "leveldb");
    if (fs.existsSync(levelDbDir)) {
      try {
        const files = await fs.promises.readdir(levelDbDir);
        for (const f of files) {
          if (f === "LOCK" || f.endsWith(".lock")) continue;
          await copySafe(path.join("Default", "Local Storage", "leveldb", f));
        }
      } catch { }
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

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

// ==========================================
// 7. HIGH-PERFORMANCE & RELIABLE STUDIO EXTRACTOR
// ==========================================
async function scrapePageMetrics(page, context, profileDir, profileId, detectedHandle, methodLabel = "snapshot") {
  try {
    const t_start = Date.now();
    let t_nav = 0;
    let t_insights = 0;
    let t_m10n = 0;

    let userInfo = null;
    let followerCount = 0;
    let rawPostList = [];
    let interceptedRewardAnalytics = null;
    let interceptedPerPostRewards = [];
    let interceptedPerPostUrl = null;
    let interceptedPerPostHasMore = false;
    let interceptedVideoRewardAnalytics = null;
    let interceptedAllPrograms = null;
    let interceptedInsightsHistory = null;
    let homeRewards365 = null;
    let interceptedVideoCalls = [];

    // Intercept essential user, follower, insights, monetization, and video list APIs
    page.on("response", async (resp) => {
      const url = resp.url();
      try {
        if (url.includes("/tiktokstudio/api/web/user") && !url.includes("aid=")) {
          const j = await resp.json();
          if (j.userBaseInfo?.UserProfile?.UserBase) {
            userInfo = j.userBaseInfo.UserProfile.UserBase;
          }
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
            if (payload.has_more !== undefined) {
              interceptedPerPostHasMore = !!payload.has_more;
            }
            interceptedPerPostUrl = url;
          } catch { }
        } else if (url.includes("/m10n_center/reward_analytics")) {
          const j = await resp.json();
          const payload = j.data || j;
          if (payload.daily_estimated_income || payload.seven_d_income) {
            interceptedRewardAnalytics = payload;
          }
        }
        if (url.includes("video_reward_analytics")) {
          const j = await resp.json();
          const payload = j.data || j;
          if (payload.crp_analytics_data || payload.ttshop_analytics_data) {
            interceptedVideoRewardAnalytics = payload;
          }
        }
        if (url.includes("/m10n_center/all_programs")) {
          const j = await resp.json();
          const payload = j.data || j;
          if (payload.active_m10n_programs) {
            interceptedAllPrograms = payload.active_m10n_programs;
          }
        }
        if (url.includes("/aweme/v2/data/insight/")) {
          const j = await resp.json();
          if (j.vv_history || j.like_history) {
            interceptedInsightsHistory = j;
          }
        }
        if (url.includes("item_list") || url.includes("post_list") || url.includes("/content/manage") || url.includes("/content/list")) {
          const j = await resp.json();
          const list = j.itemList || j.items || j.item_list || j.data?.item_list || j.data?.itemList || [];
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

    // Navigate to TikTok Studio Content
    const t_nav_start = Date.now();
    await page.goto("https://www.tiktok.com/tiktokstudio/content", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    }).catch(() => { });
    t_nav = Date.now() - t_nav_start;

    // Reliable Login Detection
    const isLoginPage = /login|passport/i.test(page.url()) || (await page.title().catch(() => "")).includes("Log in");
    if (isLoginPage) {
      return { success: false, error: "Profile chua dang nhap TikTok hoac phien dang nhap da het han." };
    }

    // Extract TikTok Passport account info (authoritative ground-truth from TikTok server)
    let passportCountryRaw = null;
    try {
      passportCountryRaw = await page.evaluate(async () => {
        try {
          const res = await fetch("https://www.tiktok.com/passport/web/account/info/?app_id=1233", {
            credentials: "include",
          });
          if (!res.ok) return null;
          const json = await res.json();
          const d = json?.data;
          const val = d?.store_country || d?.country_code || d?.country || null;
          if (val && /^\d+$/.test(String(val))) return null;
          return val;
        } catch {
          return null;
        }
      }).catch(() => null);
    } catch { }

    // Extract TikTok store-country-code cookie & webapp context (identical to Extension)
    let cookieCountryRaw = null;
    try {
      const allCookies = await context.cookies(["https://www.tiktok.com", "https://tiktok.com"]);
      const storeCookie = allCookies.find((c) => c.name === "store-country-code");
      if (storeCookie?.value) {
        cookieCountryRaw = storeCookie.value;
      }
    } catch { }

    const pageCountryHints = await page.evaluate(() => {
      let region = null;
      let storeCountry = null;
      try {
        const m = document.cookie.match(/(?:^|; )store-country-code=([^;]*)/);
        if (m) storeCountry = decodeURIComponent(m[1]);
      } catch { }
      try {
        const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
        if (el?.textContent) {
          const parsed = JSON.parse(el.textContent);
          const scope = parsed["__DEFAULT_SCOPE__"] || {};
          const ctx = scope["webapp.app-context"] || {};
          region = ctx.appContext?.region || ctx.appContext?.priority_region || ctx.user?.region || null;
        }
      } catch { }
      return { region, storeCountry };
    }).catch(() => ({ region: null, storeCountry: null }));

    // Reliable Early-Exit: Wait until userInfo, creator context, and follower relation count arrive (max 2.5s)
    const startTime = Date.now();
    while (Date.now() - startTime < 2500) {
      const hasContext = await page.evaluate(() => {
        const el = document.getElementById("__Creator_Center_Context__");
        return !!(el && el.textContent.length > 50);
      }).catch(() => false);

      if (hasContext && userInfo && followerCount > 0) break;
      await page.waitForTimeout(200);
    }

    // Extract pre-rendered post_list from __Creator_Center_Context__ and accumulate
    const allVideosMap = new Map();
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

    // Incorporate any intercepted calls that already arrived
    for (const call of interceptedVideoCalls) {
      for (const item of call.items) {
        const key = item.item_id || item.id || item.desc || Math.random().toString();
        allVideosMap.set(key, item);
      }
    }

    // Scroll to load all remaining video batches if more exist
    let lastVideoCount = allVideosMap.size;
    let noNewVideoIterations = 0;
    const shouldScroll = initialHasMore || interceptedVideoCalls.some((c) => c.has_more) || allVideosMap.size === 0;

    if (shouldScroll) {
      for (let scrollIdx = 0; scrollIdx < 8; scrollIdx++) {
        const lastCall = [...interceptedVideoCalls].reverse().find((c) => c.has_more !== undefined);
        if (lastCall && lastCall.has_more === false) {
          break; // All videos loaded according to TikTok API
        }

        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const scrollables = document.querySelectorAll('div[class*="content"], div[class*="table"], div[class*="scroll"], div[class*="list"]');
          scrollables.forEach((el) => { el.scrollTop = el.scrollHeight; });
        }).catch(() => { });

        await page.waitForTimeout(1500);

        for (const call of interceptedVideoCalls) {
          for (const item of call.items) {
            const key = item.item_id || item.id || item.desc || Math.random().toString();
            allVideosMap.set(key, item);
          }
        }

        if (allVideosMap.size === lastVideoCount) {
          noNewVideoIterations++;
          if (noNewVideoIterations >= 2) break;
        } else {
          noNewVideoIterations = 0;
          lastVideoCount = allVideosMap.size;
        }
      }
    }

    rawPostList = Array.from(allVideosMap.values());

    // Fallback: Extract from DOM if script tag and API intercept were missing
    if (rawPostList.length === 0) {
      const domPosts = await page.evaluate(() => {
        const items = [];
        const rows = document.querySelectorAll('tr, [role="row"], [class*="video-item"]');
        rows.forEach((r) => {
          const titleEl = r.querySelector('[class*="title"], [class*="desc"], a[href*="/video/"]');
          const viewEl = r.querySelector('[class*="view"], td:nth-child(3)');
          const likeEl = r.querySelector('[class*="like"], td:nth-child(4)');
          const commentEl = r.querySelector('[class*="comment"], td:nth-child(5)');
          if (titleEl && viewEl) {
            items.push({
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
      if (!val) return 0;
      if (typeof val === "number") return val;
      const str = String(val).trim();
      if (/[m|tr|mio]$/i.test(str)) return Math.round(parseFloat(str.replace(",", ".")) * 1000000);
      if (/[k|n]$/i.test(str)) return Math.round(parseFloat(str.replace(",", ".")) * 1000);
      return parseInt(str.replace(/[^0-9]/g, ""), 10) || 0;
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

    let studioTotalVideos = 0;
    try {
      const tabCount = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        const m = text.match(/(?:Bài đăng|Posts?|Videos?)\s+(\d+)/i) || text.match(/(\d+)\s+(?:bài đăng|posts?|videos?)/i);
        return m ? parseInt(m[1], 10) : 0;
      }).catch(() => 0);
      if (tabCount > 0) studioTotalVideos = tabCount;
    } catch { }

    // Reliable Username: Studio API UniqId > Passport session > disk (never prefer visited public profiles)
    let sessionHandle = userInfo?.UniqId || null;
    if (!sessionHandle) {
      try {
        const passRes = await page.goto(
          "https://www.tiktok.com/passport/web/account/info/?app_id=1233",
          { waitUntil: "domcontentloaded", timeout: 10000 }
        ).catch(() => null);
        if (passRes) {
          const info = await page.evaluate(() => {
            try {
              return JSON.parse(document.body?.innerText || "{}");
            } catch {
              return null;
            }
          }).catch(() => null);
          sessionHandle = info?.data?.username || info?.data?.screen_name || null;
        }
        // Return to studio content context for monetization step if needed
        await page.goto("https://www.tiktok.com/tiktokstudio/content", {
          waitUntil: "domcontentloaded",
          timeout: 12000,
        }).catch(() => { });
      } catch { }
    }

    const finalHandle =
      sessionHandle ||
      detectedHandle ||
      null;

    if (detectedHandle && sessionHandle && detectedHandle.toLowerCase() !== String(sessionHandle).toLowerCase()) {
      console.warn(
        `   [!] Disk handle @${detectedHandle} != session @${sessionHandle} — using session identity (bo qua public profile visit)`
      );
    }

    if (!finalHandle) {
      return {
        success: false,
        error: "Khong xac minh duoc username dang nhap (Studio UniqId / passport). Bo qua de tranh gan nham public profile.",
      };
    }

    // Extract authoritative lifetime stats (totalLikes, public videoCount) from profile rehydration
    let publicStats = null;
    try {
      publicStats = await page.evaluate(async (handle) => {
        try {
          const res = await fetch(`https://www.tiktok.com/@${handle}`, { credentials: "include", signal: AbortSignal.timeout(6000) });
          if (!res.ok) return null;
          const html = await res.text();
          const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
          if (match) {
            const parsed = JSON.parse(match[1]);
            return parsed["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.stats || null;
          }
        } catch { }
        return null;
      }, finalHandle).catch(() => null);
    } catch { }

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

    const t_insights_start = Date.now();
    try {
      // Fast in-page evaluation: query insight endpoints directly matching Studio UI parameters
      const evaluateInsightMap = async () => {
        return await page.evaluate(async () => {
          const out = {};
          const ranges = [
            { key: "7", days: 8, end_days: 1 },
            { key: "28", days: 29, end_days: 1 },
            { key: "60", days: 61, end_days: 1 },
            { key: "365", days: 366, end_days: 1 },
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
              const url = "/aweme/v2/data/insight/?tz_offset=25200&type_requests=" + encodeURIComponent(JSON.stringify(typeRequests));
              const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
              out[r.key] = await res.json();
            } catch (e) {
              out[r.key] = {};
            }
          }
          return out;
        }).catch(() => ({}));
      };

      let rawInsightMap = await evaluateInsightMap();
      // If direct fetch didn't return data, fall back to navigating to /analytics
      if (!rawInsightMap || !rawInsightMap["7"] || rawInsightMap["7"].vv_history === undefined) {
        await page.goto("https://www.tiktok.com/tiktokstudio/analytics", {
          waitUntil: "domcontentloaded",
          timeout: 8000,
        }).catch(() => { });
        await page.waitForTimeout(1000);
        rawInsightMap = await evaluateInsightMap();
      }

      const sumMetricHistory = (arr) => {
        if (!arr || !Array.isArray(arr)) return 0;
        let s = 0;
        for (let i = 0; i < arr.length; i++) {
          s += Number(arr[i] && arr[i].value ? arr[i].value : 0);
        }
        return s;
      };

      const getVal = (d, metric) => sumMetricHistory((rawInsightMap[String(d)] || {})[metric]);

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
    } catch (anErr) {
      console.warn("   [!] Analytics fetch warning:", anErr.message);
    }
    t_insights = Date.now() - t_insights_start;

    const totalViews = Math.max(totalViewsCombined, views365d);

    // Step 3: Visit monetization tab to extract Active Programs (LIVE rewards, TikTok Shop, Creator Rewards)
    const t_m10n_start = Date.now();
    let totalRewardsUsd = null;
    let shopRewardsUsd = null;
    let shopProgramName = "TikTok Shop for Seller";
    let activePrograms = [];
    let dailyBreakdown = [];
    let revenue7d = null;
    let revenue28d = null;
    let revenue60d = null;
    let revenue365d = null;
    let rpm = null;
    let currency = "$";
    let tiktokShopProgram = null;
    let postRewards = [];
    let creatorRewardsMissing = false;
    let bannedReason = null;

    try {
      // Fast in-page query: check reward analytics API directly before navigating
      if (!interceptedRewardAnalytics) {
        try {
          const directM10n = await page.evaluate(async () => {
            try {
              const res = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics", {
                credentials: "include",
                signal: AbortSignal.timeout(4000),
              });
              if (res.ok) return await res.json();
            } catch { }
            return null;
          }).catch(() => null);
          if (directM10n && (directM10n.data || directM10n.seven_d_income || directM10n.daily_estimated_income)) {
            interceptedRewardAnalytics = directM10n.data || directM10n;
          }
        } catch { }
      }

      if (!interceptedRewardAnalytics) {
        await page.goto("https://www.tiktok.com/tiktokstudio/monetization", {
          waitUntil: "domcontentloaded",
          timeout: 8000,
        }).catch(() => { });

        // Wait up to 1.5s for interceptedRewardAnalytics to arrive
        const waitStart = Date.now();
        while (Date.now() - waitStart < 1500 && !interceptedRewardAnalytics) {
          await page.waitForTimeout(150);
        }
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
        currency = interceptedRewardAnalytics.selected_currency?.symbol || interceptedRewardAnalytics.selected_currency?.code || "$";
        revenue7d = parseMoney(interceptedRewardAnalytics.seven_d_income);
        revenue28d = parseMoney(interceptedRewardAnalytics.thirty_d_income);
        revenue60d = parseMoney(interceptedRewardAnalytics.sixty_d_income);
        totalRewardsUsd = revenue28d > 0 ? revenue28d : revenue7d;

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

        // Add any active programs from all_programs that haven't earned yet
        if (Array.isArray(interceptedAllPrograms)) {
          interceptedAllPrograms.forEach((ap) => {
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
      } else {
        // Resilient Fallback: DOM scraping if network response was not captured
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
            if (!title) {
              title = card.getAttribute("aria-label") || card.getAttribute("title") || lines[amountLineIdx + 1] || "";
            }
            title = title.replace(/\s+/g, " ").trim();
            if (!title || title.length > 70) return;

            const amount = parseAmount(lines[amountLineIdx]);
            if (amount === null) return;

            const lower = title.toLowerCase();
            if (lower === "total" || /^total$/i.test(title)) {
              if (tot === null) tot = amount;
            } else if (/tiktok\s*shop|shop\s*for/i.test(lower)) {
              if (shop === null) {
                shop = amount;
                shopName = title;
              }
            } else {
              if (!programsMap.has(title)) {
                programsMap.set(title, amount);
              }
            }
          });

          return {
            tot,
            shop,
            shopName,
            cur,
            activeProgs: Array.from(programsMap.entries()).map(([name, revenue]) => ({ name, revenue7d: 0, revenue30d: revenue, revenue60d: 0 })),
          };
        }).catch(() => ({ tot: null, shop: null, shopName: "TikTok Shop for Seller", cur: "$", activeProgs: [] }));

        totalRewardsUsd = rew.tot;
        shopRewardsUsd = rew.shop;
        shopProgramName = rew.shopName || shopProgramName;
        currency = rew.cur || "$";
        activePrograms = rew.activeProgs || [];
      }

      // Query Home tab for 365-day total revenue (insight_type: 126)
      try {
        const home365 = await page.evaluate(async () => {
          try {
            var typeReq = [{ insight_type: 126, data_date_range: 4 }];
            var url = "/tiktok/v1/analytics/insights/?type_requests=" + encodeURIComponent(JSON.stringify(typeReq)) + "&time_offset=25200&is_dark_mode=false";
            var resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
            var j = await resp.json();
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

      // Visit the first video item page to trigger TikTok Studio's internal router to load the per-post rewards side panel
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
        } catch { }
      }

      // Extract Post Rewards ("Phần thưởng mỗi bài đăng")
      postRewards = [];

      // List of all monetization programs to query in video_analytics_filter
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
        1: "Quà tặng video (Video Gifts)",
        2: "Tiền boa (Tips)",
        3: "Creator Next",
        4: "Quỹ nhà sáng tạo (Creator Fund)",
        5: "TikTok Creator Marketplace",
        7: "Quà tặng LIVE (Live Gifts)",
        8: "TikTok Shop",
        9: "Chương trình Creator Rewards",
        10: "Series",
        12: "Quảng bá âm nhạc (Work with Artists)",
        13: "Đăng ký LIVE (Live Subscription)",
        14: "TikTok Creative Challenge",
        16: "Branded Mission",
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
          const m = Math.floor(item.video_duration / 60);
          const s = Math.floor(item.video_duration % 60);
          durationStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        }

        let postDateStr = null;
        let publishTimeUnix = null;
        if (item.publish_date_unix_time) {
          publishTimeUnix = Number(item.publish_date_unix_time);
          const d = new Date(publishTimeUnix * 1000);
          if (!isNaN(d.getTime())) {
            postDateStr = d.toISOString().split("T")[0];
          }
        }

        const viewsCount = Number(item.views) || Number(item.total_views) || Number(item.quvv) || 0;
        let rpmStr = null;
        if (item.rpm_metadata?.rpm_integer) {
          const rVal = (Number(item.rpm_metadata.rpm_integer) / 100).toFixed(2);
          rpmStr = `${cur}${rVal}`;
        } else if (amt > 0 && Number(item.quvv) > 0) {
          rpmStr = `${cur}${((amt / Number(item.quvv)) * 1000).toFixed(2)}`;
        } else if (amt > 0 && viewsCount > 0) {
          rpmStr = `${cur}${((amt / viewsCount) * 1000).toFixed(2)}`;
        }

        // Map exact program details from item
        const rawPrograms = Array.isArray(item.video_analytics_programs) ? item.video_analytics_programs : [];
        const programDetails = rawPrograms.map((p) => {
          const progId = Number(p.m10n_program ?? p.program_id ?? p.id);
          const progName = (p.program_name && String(p.program_name).trim())
            ? String(p.program_name).trim()
            : (PROGRAM_ID_MAP[progId] || (progId ? `Program ${progId}` : "Chương trình Creator Rewards"));
          return {
            id: progId,
            name: progName,
            isPunished: !!p.is_punished,
          };
        });

        const queriedProgId = item._queried_program_id ? Number(item._queried_program_id) : null;
        let primaryProgramName = queriedProgId ? (PROGRAM_ID_MAP[queriedProgId] || `Program ${queriedProgId}`) : null;
        if (!primaryProgramName) {
          primaryProgramName = programDetails[0]?.name || "Chương trình Creator Rewards";
        }
        const isPunished = programDetails.some((p) => p.isPunished) || !!item.is_punished;

        return {
          id: item.video_id_str || String(item.video_id || ""),
          videoId: item.video_id_str || String(item.video_id || ""),
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
          views: Number(item.views) || Number(item.total_views) || Number(item.quvv) || 0,
          rpm: rpmStr,
        };
      };

      // Explicit All-Time and All-Programs filter guaranteed
      const paginationBaseUrl = interceptedPerPostUrl || (await page.evaluate(() => {
        const entries = performance.getEntriesByType("resource").map((e) => e.name);
        return entries.find((u) => u.includes("reward_analytics_per_post?"))
          || entries.find((u) => u.includes("/m10n_center/reward_analytics?"))
          || null;
      }).catch(() => null)) || "/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0";

      let allApiItems = [];
      if (paginationBaseUrl) {
        try {
          const evalResult = await page.evaluate(async ({ baseReqUrl, allPrograms, maxConcurrentPrograms, pagePacingMs }) => {
            const extra = [];
            let activeProgramIds = [];

            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

            // 1. Probe page 0 to discover all active programs for this account
            try {
              const probeUrl = new URL(baseReqUrl, window.location.origin);
              probeUrl.pathname = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post";
              probeUrl.searchParams.set("page", "0");
              probeUrl.searchParams.set("video_analytics_filter", JSON.stringify({
                video_analytics_display_time_range: 1, // 1 = VIDEO_ANALYTICS_DISPLAY_TIME_RANGE_ALL_TIME (lay tat ca video theo thoi gian)
                video_analytics_sort_by_type: 3,       // 3 = VIDEO_ANALYTICS_SORT_BY_TYPE_PUBLISH_DATE (moi nhat len dau)
                video_analytics_programs: allPrograms,
              }));
              const probeRes = await fetch(probeUrl.toString(), { credentials: "include" });
              if (probeRes.status === 429) {
                return { items: [], rateLimited: true, progId: "probe", page: 0 };
              }
              const probeJson = await probeRes.json();
              const probePayload = probeJson?.data || probeJson;
              if (Array.isArray(probePayload?.video_analytics_active_programs) && probePayload.video_analytics_active_programs.length > 0) {
                activeProgramIds = probePayload.video_analytics_active_programs;
              }
              const probeList = probePayload?.video_analytics_video_list || [];
              if (probeList.length > 0 && activeProgramIds.length <= 1) {
                const singleProgId = activeProgramIds[0] || 9;
                for (const item of probeList) {
                  item._queried_program_id = singleProgId;
                  extra.push(item);
                }
              }
            } catch { }

            async function fetchProgramPages(progId, startPage = 0, maxPages = 20) {
              const progItems = [];
              let p = startPage;
              let keepGoing = true;
              while (keepGoing && p < maxPages) {
                if (p > startPage && pagePacingMs > 0) {
                  await sleep(pagePacingMs);
                }
                try {
                  const u = new URL(baseReqUrl, window.location.origin);
                  u.pathname = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post";
                  u.searchParams.set("page", String(p));
                  u.searchParams.set("video_analytics_filter", JSON.stringify({
                    video_analytics_display_time_range: 1, // 1 = VIDEO_ANALYTICS_DISPLAY_TIME_RANGE_ALL_TIME
                    video_analytics_sort_by_type: 3,       // 3 = VIDEO_ANALYTICS_SORT_BY_TYPE_PUBLISH_DATE
                    video_analytics_programs: [progId],
                  }));
                  const r = await fetch(u.toString(), { credentials: "include" });
                  if (r.status === 429) {
                    return { progItems, rateLimited: true, page: p };
                  }
                  const j = await r.json();
                  const payload = j?.data || j;
                  const list = payload?.video_analytics_video_list || [];
                  for (const item of list) {
                    item._queried_program_id = progId;
                    progItems.push(item);
                  }
                  keepGoing = !!payload?.has_more;
                  if (!list.length) break;
                  p++;
                } catch {
                  break;
                }
              }
              return { progItems, rateLimited: false, page: p };
            }

            // 2. If multiple programs exist: run in batches of maxConcurrentPrograms
            if (activeProgramIds.length > 1) {
              for (let i = 0; i < activeProgramIds.length; i += maxConcurrentPrograms) {
                const batch = activeProgramIds.slice(i, i + maxConcurrentPrograms);
                const batchResults = await Promise.all(batch.map((progId) => fetchProgramPages(progId, 0, 20)));
                for (let bIdx = 0; bIdx < batchResults.length; bIdx++) {
                  const bRes = batchResults[bIdx];
                  if (bRes.progItems && bRes.progItems.length > 0) {
                    extra.push(...bRes.progItems);
                  }
                  if (bRes.rateLimited) {
                    return { items: extra, rateLimited: true, progId: batch[bIdx], page: bRes.page };
                  }
                }
              }
            } else {
              // Single program: continue paginating remaining pages from page 1
              const targetProgId = activeProgramIds[0] || 9;
              const res = await fetchProgramPages(targetProgId, 1, 25);
              if (res.progItems && res.progItems.length > 0) {
                extra.push(...res.progItems);
              }
              if (res.rateLimited) {
                return { items: extra, rateLimited: true, progId: targetProgId, page: res.page };
              }
            }
            return { items: extra, rateLimited: false };
          }, {
            baseReqUrl: paginationBaseUrl,
            allPrograms: ALL_M10N_PROGRAMS,
            maxConcurrentPrograms: Number(config.m10nMaxConcurrentPrograms) > 0 ? Number(config.m10nMaxConcurrentPrograms) : M10N_MAX_CONCURRENT_PROGRAMS,
            pagePacingMs: Number.isFinite(Number(config.m10nPagePacingMs)) ? Number(config.m10nPagePacingMs) : M10N_PAGE_PACING_MS,
          });

          if (evalResult) {
            allApiItems = evalResult.items || [];
            if (evalResult.rateLimited) {
              console.warn(
                `   [RATE-LIMIT] Tier A (program: ${evalResult.progId}, page: ${evalResult.page}) returned HTTP 429 on @${finalHandle || detectedHandle || profileId}`
              );
            }
          }
        } catch { }
      }

      // Priority 1: Map items from the separated per-program fetch
      if (Array.isArray(allApiItems) && allApiItems.length > 0) {
        const mapped = allApiItems.map(mapInternalVideoItem);
        const seenKeys = new Set();
        postRewards = [];
        for (const item of mapped) {
          const key = `${item.id || item.videoId}_${item.programId || item.programName || "9"}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            postRewards.push(item);
          }
        }
      } else if (Array.isArray(interceptedPerPostRewards) && interceptedPerPostRewards.length > 0) {
        // Fallback to directly intercepted responses
        const mapped = interceptedPerPostRewards.map(mapInternalVideoItem);
        const seenKeys = new Set();
        postRewards = [];
        for (const item of mapped) {
          const key = `${item.id || item.videoId}_${item.programId || item.programName || "9"}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            postRewards.push(item);
          }
        }
      }

      // Priority 2: In-session authenticated fetch to internal API if interception was missed
      if (!postRewards || postRewards.length === 0) {
        try {
          const directApiResult = await page.evaluate(async ({ allPrograms, pagePacingMs }) => {
            try {
              const perfEntries = performance.getEntriesByType("resource")
                .map((e) => e.name)
                .filter((u) => u.includes("reward_analytics_per_post"));
              const defaultFilter = encodeURIComponent(JSON.stringify({
                video_analytics_display_time_range: 1, // 1 = VIDEO_ANALYTICS_DISPLAY_TIME_RANGE_ALL_TIME
                video_analytics_sort_by_type: 3,       // 3 = VIDEO_ANALYTICS_SORT_BY_TYPE_PUBLISH_DATE
                video_analytics_programs: allPrograms,
              }));
              const baseUrl = perfEntries[0] || `/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0&video_analytics_filter=${defaultFilter}`;
              const allItems = [];
              let p = 0;
              let keepGoing = true;
              let rateLimited = false;
              let rateLimitedPage = 0;
              const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

              while (keepGoing && p < 8) {
                if (p > 0 && pagePacingMs > 0) {
                  await sleep(pagePacingMs);
                }
                try {
                  const u = new URL(baseUrl, window.location.origin);
                  u.searchParams.set("page", String(p));
                  u.searchParams.set("video_analytics_filter", JSON.stringify({
                    video_analytics_display_time_range: 1, // 1 = VIDEO_ANALYTICS_DISPLAY_TIME_RANGE_ALL_TIME
                    video_analytics_sort_by_type: 3,       // 3 = VIDEO_ANALYTICS_SORT_BY_TYPE_PUBLISH_DATE
                    video_analytics_programs: allPrograms,
                  }));
                  const res = await fetch(u.toString(), {
                    credentials: "include",
                    signal: AbortSignal.timeout(5000),
                  });
                  if (res.status === 429) {
                    rateLimited = true;
                    rateLimitedPage = p;
                    break;
                  }
                  const j = await res.json();
                  const payload = j?.data || j;
                  const list = payload?.video_analytics_video_list || [];
                  if (list.length > 0) allItems.push(...list);
                  keepGoing = !!payload?.has_more;
                  if (!list.length) break;
                  p++;
                } catch {
                  break;
                }
              }
              return { items: allItems, rateLimited, rateLimitedPage };
            } catch (e) {
              return { items: [], rateLimited: false, rateLimitedPage: 0 };
            }
          }, {
            allPrograms: ALL_M10N_PROGRAMS,
            pagePacingMs: Number.isFinite(Number(config.m10nPagePacingMs)) ? Number(config.m10nPagePacingMs) : M10N_PAGE_PACING_MS,
          });

          if (directApiResult?.rateLimited) {
            console.warn(
              `   [RATE-LIMIT] Tier B (page: ${directApiResult.rateLimitedPage}) returned HTTP 429 on @${finalHandle || detectedHandle || profileId}`
            );
          }

          if (Array.isArray(directApiResult?.items) && directApiResult.items.length > 0) {
            const mapped = directApiResult.items.map(mapInternalVideoItem);
            const seenIds = new Set();
            postRewards = [];
            for (const item of mapped) {
              const key = item.id || item.videoId || item.title;
              if (!seenIds.has(key)) {
                seenIds.add(key);
                postRewards.push(item);
              }
            }
          }
        } catch { }
      }

      // If overview was 0 but post rewards were found, accumulate total rewards
      if (totalRewardsUsd === null || totalRewardsUsd === 0) {
        const sumPostRewards = postRewards.reduce((sum, p) => sum + (Number(p.reward || p.rewards) || 0), 0);
        if (sumPostRewards > 0) {
          totalRewardsUsd = Number(sumPostRewards.toFixed(2));
        }
      }

      // Priority 3: Fallback to DOM scraper if API response was not returned
      if (!postRewards || postRewards.length === 0) {
        try {
          await page.evaluate(() => {
            window.scrollBy(0, 700);
          }).catch(() => { });
          await page.waitForTimeout(1000);

          postRewards = await page.evaluate(() => {
            const parseMoney = (str) => {
              if (!str) return { amount: 0, currency: "$" };
              let cur = "$";
              if (str.includes("₫")) cur = "₫";
              else if (str.includes("£")) cur = "£";
              else if (str.includes("€")) cur = "€";
              else if (str.includes("$")) cur = "$";
              const cleaned = str.replace(/[^0-9,.]/g, "").replace(/,/g, "");
              const amt = parseFloat(cleaned) || 0;
              return { amount: amt, currency: cur };
            };

            const results = [];
            const candidateCards = Array.from(
              document.querySelectorAll("div, article, li")
            ).filter((el) => {
              const text = el.innerText || "";
              const hasCur = /[$£€₫]/.test(text);
              const hasViewsOrDate = /(?:lượt xem|views?|\d{4}[/-]\d{2}|\d{2}[/-]\d{2}|\d{1,2}:\d{2})/i.test(text);
              const hasImg = !!el.querySelector("img, video, [style*='background-image']");
              return hasCur && hasViewsOrDate && hasImg && text.length < 500 && el.children.length >= 2;
            });

            const leafCards = candidateCards.filter(
              (card) => !candidateCards.some((other) => other !== card && card.contains(other))
            );

            for (const card of leafCards) {
              try {
                const text = card.innerText || "";
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
                let rpm = rpmMatch ? rpmMatch[1].trim() : null;

                let parsedViewsNum = 0;
                if (views) {
                  const cleanViews = String(views).trim().toLowerCase();
                  if (cleanViews.endsWith("k")) {
                    parsedViewsNum = parseFloat(cleanViews) * 1000;
                  } else if (cleanViews.endsWith("m")) {
                    parsedViewsNum = parseFloat(cleanViews) * 1000000;
                  } else {
                    parsedViewsNum = parseFloat(cleanViews.replace(/,/g, "")) || 0;
                  }
                }

                if (!rpm && moneyInfo.amount > 0 && parsedViewsNum > 0) {
                  const calculatedRpm = Math.round((moneyInfo.amount / parsedViewsNum) * 1000 * 100) / 100;
                  if (calculatedRpm > 0) {
                    rpm = `${moneyInfo.currency}${calculatedRpm.toFixed(2)}`;
                  }
                }

                const dateMatch = text.match(/\b(?:\d{4}[/-]\d{2}[/-]\d{2}|\d{2}[/-]\d{2}[/-]\d{4})(?:\s+\d{1,2}:\d{2})?\b/) || text.match(/\b\d{1,2}:\d{2}\s+\d{2}[/-]\d{2}[/-]\d{4}\b/);
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
                    line === programName ||
                    line === dateMatch?.[0]
                  ) {
                    continue;
                  }
                  if (line.length > title.length) {
                    title = line;
                  }
                }

                if (coverUrl || title || moneyInfo.amount > 0) {
                  let publishTimeUnix = null;
                  if (postDate) {
                    const parsedTs = new Date(postDate).getTime();
                    if (!isNaN(parsedTs)) publishTimeUnix = Math.floor(parsedTs / 1000);
                  }
                  results.push({
                    title: title || "Video",
                    coverUrl,
                    duration,
                    postDate,
                    publishDate: postDate,
                    publishTimeUnix,
                    programName,
                    reward: moneyInfo.amount,
                    currency: moneyInfo.currency,
                    views,
                    rpm,
                  });
                }
              } catch { }
            }

            return results;
          }).catch(() => []);
        } catch { }
      }

      // Check Creator Rewards Program presence
      creatorRewardsMissing = false;
      bannedReason = null;
      try {
        const pageText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
        const hasCreatorRewardsInProg = activePrograms.some((p) => /creator\s*reward|quỹ\s*nhà\s*sáng\s*tạo|sáng\s*tạo|beta/i.test(p.name));
        const hasCreatorRewardsInAll = Array.isArray(interceptedAllPrograms) && interceptedAllPrograms.some((p) => /creator\s*reward|quỹ\s*nhà\s*sáng\s*tạo|sáng\s*tạo|beta/i.test(p.name));
        const hasCreatorRewardsInText = /creator\s*rewards?|chương\s*trình\s*creator\s*rewards|quỹ\s*nhà\s*sáng\s*tạo/i.test(pageText);
        const hasCreatorRewards = hasCreatorRewardsInProg || hasCreatorRewardsInAll || hasCreatorRewardsInText;

        if (!hasCreatorRewards && (followerCount >= 10000 || (totalRewardsUsd && totalRewardsUsd > 0))) {
          creatorRewardsMissing = true;
          bannedReason = "Bị ngừng chương trình TikTok Beta (Creator Rewards Program)";
        }
      } catch { }
    } catch { }
    t_m10n = Date.now() - t_m10n_start;

    // Query lifetime total likes from public stats (301K), header, or 365d analytics
    let totalLikes = cleanNum(publicStats?.heartCount || publicStats?.heart || userInfo?.totalLikes || 0);
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
    } catch { }
    if (!totalLikes || totalLikes < likes365d) {
      totalLikes = likes365d;
    }

    const sumPostRewards = (postRewards || []).reduce((s, p) => s + (Number(p.rewards) || Number(p.reward) || 0), 0);
    const effectiveTotalRevenue = Number((totalRewardsUsd || revenue365d || sumPostRewards || 0).toFixed(2));
    if (totalViews > 0 && effectiveTotalRevenue > 0) {
      rpm = Number(((effectiveTotalRevenue / totalViews) * 1000).toFixed(3));
    }

    // Construct structured revenueBreakdown (no duplicate TikTok Shop in activePrograms)
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

    // Construct clean JSON summaries
    const sumRevenue = {
      revenue7d: revenue7d || 0,
      revenue28d: revenue28d || 0,
      revenue60d: revenue60d || 0,
      revenue365d: revenue365d || 0,
      totalRevenue: effectiveTotalRevenue,
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

    const storageRoot = path.dirname(profileDir);
    const meta = readGpmProfileMetaFromDisk(storageRoot, profileId);
    let gpmGroupName = meta.groupName || null;
    if (!gpmGroupName && meta.groupId) {
      gpmGroupName = await lookupGpmGroupName(lastGoodGpmBase || null, meta.groupId);
    }
    const detectedCountry = detectAccountCountry({
      passportCountryRaw,
      cookieCountryRaw,
      pageCountryHints,
      currency,
      profileName: meta.name,
      gpmGroupName,
    });

    // Cross-reference and enrich each video in videosList with its monetization program and rewards
    if (Array.isArray(videosList) && videosList.length > 0 && Array.isArray(postRewards) && postRewards.length > 0) {
      const rewardMap = new Map();
      for (const pr of postRewards) {
        if (pr.id) rewardMap.set(String(pr.id), pr);
        if (pr.videoId) rewardMap.set(String(pr.videoId), pr);
      }
      for (const v of videosList) {
        const match = rewardMap.get(String(v.id));
        if (match) {
          v.programName = match.programName;
          v.programs = match.programs;
          v.reward = match.reward;
          v.rewards = match.rewards;
          v.isPunished = match.isPunished;
          v.rpm = match.rpm;
          if (match.duration && !v.duration) v.duration = match.duration;
        }
      }
    }

    const gpmProfileName = meta.name || `Profile ${String(profileId).slice(0, 8)}`;

    const t_total = Date.now() - t_start;
    console.log(
      `   [PERF] Profile ${profileId} (@${finalHandle || "unknown"}): total=${t_total}ms (nav=${t_nav}ms, insights=${t_insights}ms, m10n=${t_m10n}ms, videos=${videosList.length})`
    );

    const realTotalVideos = studioTotalVideos || publicStats?.videoCount || videosList.length;
    const finalFollowerCount = Math.max(followerCount, publicStats?.followerCount || 0);

    if (!userInfo && !realTotalVideos && !finalFollowerCount && !totalRewardsUsd) {
      return {
        success: false,
        error: "unauthenticated_session_empty_data",
      };
    }

    return {
      success: true,
      data: {
        username: finalHandle,
        nickname: userInfo?.NickName || null,
        followersCount: finalFollowerCount,
        totalLikes,
        totalViews,
        videoCount: realTotalVideos,
        totalVideos: realTotalVideos,
        totalRevenue: totalRewardsUsd,
        currency,
        country: detectedCountry,
        rpm,
        videosList,
        postRewards: postRewards || [],
        creatorRewardsMissing: !!creatorRewardsMissing,
        bannedReason: bannedReason || null,
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

export async function extractProfileStudio(profileDir, profileId, chromePath, detectedHandle) {
  return withProfileLock(profileId, async () => {
    const storageRoot = path.dirname(profileDir);
    let lastError = null;

    // -------------------------------------------------------------------------
    // TIER 1: Direct CDP attach if profile browser is running with DevTools port
    // -------------------------------------------------------------------------
    const activePort = readDevToolsActivePort(storageRoot, profileId);
    if (activePort) {
      console.log(`   [CDP] Profile ${profileId.slice(0, 8)} has active port :${activePort}. Testing connection...`);
      let cdpBrowser = null;
      let cdpPage = null;
      try {
        cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${activePort}`, { timeout: 8000 });
        const contexts = cdpBrowser.contexts();
        if (contexts.length > 0) {
          const cdpContext = contexts[0];
          // SAFETY: Dedicated isolated new tab — never touch, navigate, or disrupt existing user tabs!
          cdpPage = await cdpContext.newPage();
          console.log(`   [CDP] Opened isolated probe tab. Extracting TikTok Studio metrics...`);
          const res = await scrapePageMetrics(cdpPage, cdpContext, profileDir, profileId, detectedHandle, "cdp");
          if (res.success) {
            console.log(`   [CDP] Tier 1 extraction succeeded for @${res.data.username}`);
            try {
              const liveCookies = await cdpContext.cookies(["https://www.tiktok.com", "https://tiktok.com"]);
              if (liveCookies?.length) saveProfileSession(profileId, liveCookies);
            } catch { }
            return res;
          } else {
            console.warn(`   [CDP] Tier 1 extraction returned unauthenticated/error: ${res.error}. Falling back...`);
            lastError = res.error;
          }
        }
      } catch (cdpErr) {
        console.warn(`   [CDP] Connection/attach failed on :${activePort}: ${cdpErr.message}. Falling back...`);
        lastError = cdpErr.message;
      } finally {
        if (cdpPage) {
          await cdpPage.close().catch(() => { });
        }
      }
    }

    // -------------------------------------------------------------------------
    // TIER 2: Cookie Bridge (Live extension cookies / local session cache)
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
          timeout: 15000,
        });
        bContext = await bBrowser.newContext({
          userAgent: USER_AGENT,
          viewport: { width: 1440, height: 900 },
        });
        activeContexts.add(bContext);

        const formatted = cachedCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain?.startsWith(".") ? c.domain : `.${c.domain}`,
          path: c.path || "/",
          expires: c.expirationDate || c.expires || (Math.floor(Date.now() / 1000) + 86400 * 30),
          httpOnly: !!c.httpOnly,
          secure: c.secure !== false,
          sameSite: c.sameSite === "no_restriction" ? "None" : (c.sameSite === "lax" ? "Lax" : "None"),
        }));
        await bContext.addCookies(formatted);

        const bPage = await bContext.newPage();
        const res = await scrapePageMetrics(bPage, bContext, profileDir, profileId, detectedHandle, "cookie_bridge");
        if (res.success && res.data && (res.data.videoCount > 0 || !detectedHandle)) {
          console.log(`   [COOKIE-BRIDGE] Tier 2 extraction succeeded for @${res.data.username} (${res.data.videoCount} videos)`);
          return res;
        } else {
          console.warn(`   [COOKIE-BRIDGE] Incomplete data from cookie session (videos: ${res.data?.videoCount || 0}). Falling back to Tier 3 Snapshot...`);
          clearProfileSession(profileId);
          lastError = res.error || "incomplete_cookie_bridge_data";
        }
      } catch (bridgeErr) {
        console.warn(`   [COOKIE-BRIDGE] Error during cookie bridge: ${bridgeErr.message}. Falling back...`);
        lastError = bridgeErr.message;
      } finally {
        if (bContext) {
          activeContexts.delete(bContext);
          await bContext.close().catch(() => { });
        }
        if (bBrowser) {
          await bBrowser.close().catch(() => { });
        }
      }
    }

    // -------------------------------------------------------------------------
    // TIER 3: Ultra-fast minimal profile snapshot
    // -------------------------------------------------------------------------
    console.log(`   [SNAPSHOT] Running Tier 3 minimal snapshot for ${profileId.slice(0, 8)}...`);
    const snapshotResult = await createMinimalProfileSnapshot(profileDir, profileId);
    if (!snapshotResult || !snapshotResult.tempDir) {
      return { success: false, error: snapshotResult?.error || "Khong the tao snapshot profile" };
    }

    const { tempDir, cookiesLocked } = snapshotResult;
    if (cookiesLocked) {
      console.warn(`   [SNAPSHOT] Network\\Cookies is locked by an active Chrome instance without CDP port. Profile is in use.`);
      cleanupTempDir(tempDir);
      return {
        success: false,
        error: "profile_in_use_cookies_locked",
      };
    }

    let snapContext = null;
    try {
      snapContext = await chromium.launchPersistentContext(tempDir, {
        headless: config.headless !== false,
        executablePath: chromePath,
        args: LAUNCH_ARGS,
        userAgent: USER_AGENT,
        viewport: { width: 1440, height: 900 },
        timeout: 15000,
      });
      activeContexts.add(snapContext);
      const snapPage = await snapContext.newPage();
      const res = await scrapePageMetrics(snapPage, snapContext, profileDir, profileId, detectedHandle, "snapshot");
      if (res.success) {
        console.log(`   [SNAPSHOT] Tier 3 extraction succeeded for @${res.data.username}`);
        try {
          const freshCookies = await snapContext.cookies(["https://www.tiktok.com", "https://tiktok.com"]);
          if (freshCookies?.length) saveProfileSession(profileId, freshCookies);
        } catch { }
        return res;
      }
      return res;
    } catch (snapErr) {
      return { success: false, error: snapErr.message || lastError || "Snapshot extraction failed" };
    } finally {
      if (snapContext) {
        activeContexts.delete(snapContext);
        await snapContext.close().catch(() => { });
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
    const authHeaders = {
      ...(config.personalToken ? { Authorization: `Bearer ${config.personalToken}` } : {}),
    };
    const res = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.cancelledJobIds) && data.cancelledJobIds.includes(jobId)) {
        return true;
      }
      if (data.cancelledJobId && data.cancelledJobId === jobId) {
        return true;
      }
    }
  } catch { }
  return false;
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
  console.log(`[+] Bo nho dem    : Khu tai Media (Tiet kiem 85% bang thong & RAM)`);
  if (targetProfileId || targetHandle) {
    console.log(`[+] Che do quet   : Chi dinh 1 Profile (${targetProfileId || ""} @${targetHandle || ""})`);
  }
  console.log("--------------------------------------------------------");

  const tokenOk = await verifyPersonalTokenAtStartup();
  if (!tokenOk && config.tokenRevoked) {
    console.error("[!] Dung quet — can nhap Personal Token moi truoc khi tiep tuc.");
    return;
  }
  // 1. Discover GPM storage and Chrome
  const storagePath = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const gpmApi = await discoverGpmApiBase();

  // Clean any old leftover snapshot folders in .gpm_temp to free disk space
  sweepStaleTempDirs(storagePath);

  console.log(`[*] Thu muc Profiles (Read-Only): ${storagePath}`);
  console.log(`[*] Trinh duyet Chrome: ${chromePath || "Playwright Chromium tich hop"}`);
  if (gpmApi.online) {
    console.log(`[*] GPMLogin API: Online · localhost:${gpmApi.port} (${gpmApi.base})`);
  } else {
    console.log(
      `[*] GPMLogin API: Offline (da do cong 9495/19995/19996…). Agent van quet o dia Profiles.`
    );
  }

  if (!fs.existsSync(storagePath)) {
    console.error(`[!] LOI: Khong tim thay thu muc profile GPMLogin tai:\n   ${storagePath}`);
    console.log("    Vui long kiem tra lai duong dan GPMLogin tren may tram.");
    return;
  }

  // 2. Discover profile folders — NEVER sync orphan disk UUIDs that are not in
  // the live GPM API (or currently-open browsers). Stale folders keep old TikTok
  // cookies/handles and caused wrong gpmProfileId links (e.g. 80d8f999…).
  const allEntries = fs.readdirSync(storagePath, { withFileTypes: true });
  const diskDirs = allEntries.filter(
    (e) =>
      e.isDirectory() &&
      !e.name.startsWith("_") &&
      /^[0-9a-f-]{36}$/i.test(e.name) &&
      fs.existsSync(path.join(storagePath, e.name, "Default"))
  );

  let allowedIds = null;
  if (gpmApi.online && gpmApi.base) {
    try {
      const rows = await fetchAllGpmProfiles(gpmApi.base);
      allowedIds = new Set(rows.map((r) => String(r.id)));
      console.log(`[*] GPM API danh sach: ${allowedIds.size} profile (loc o dia theo API, ho tro phan trang day du).`);
    } catch (err) {
      console.warn(`[*] Khong doc duoc GPM API list: ${err?.message || err}`);
    }
  }
  const openIds = await listOpenProfileIdsFromProcesses(storagePath);
  const profileDirs = diskDirs.filter((e) => {
    if (allowedIds && allowedIds.size) return allowedIds.has(e.name);
    // When API is offline, sync all valid profiles on disk
    return true;
  });

  console.log(
    `[*] Tim thay ${diskDirs.length} folder tren o dia; dong bo ${profileDirs.length} profile hop le` +
    (allowedIds ? " (theo GPM API)" : " (tu o dia)")
  );

  const profilesToSync = [];
  for (const p of profileDirs) {
    const fullDir = path.join(storagePath, p.name);
    const handle = await findTikTokHandleInProfileAsync(fullDir);
    const meta = readGpmProfileMetaFromDisk(storagePath, p.name);
    const profileName = meta.name || `Profile ${p.name.slice(0, 8)}`;
    let groupName = meta.groupName || null;
    if (!groupName && meta.groupId) {
      groupName = await lookupGpmGroupName(gpmApi.online ? gpmApi.base : null, meta.groupId);
    }
    if (handle) {
      console.log(`   [disk] ${p.name.slice(0, 8)}… (${profileName}, ${groupName || "no group"}) → @${handle}`);
    } else {
      console.log(`   [disk] ${p.name.slice(0, 8)}… (${profileName}, ${groupName || "no group"}) → (chua xac dinh — doi Studio UniqId)`);
    }
    profilesToSync.push({
      id: p.name,
      name: profileName,
      groupId: meta.groupId || null,
      groupName: groupName || null,
      // Only high-confidence disk handles (null is safer than a visited public profile)
      tiktokHandle: handle,
      fullDir,
    });
  }

  // Common secure headers — prefer short-lived access JWT
  const sessionAuth = await ensureAccessToken();
  const bearer = sessionAuth.bearer || config.personalToken;
  const authHeaders = {
    "Content-Type": "application/json",
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  };

  // 3. Sync Fleet Inventory to Server
  console.log("\n[>] Dang dong bo danh sach profile len may chu...");
  if (!bearer) {
    console.warn("   [!] CHUA CO PERSONAL TOKEN: Hay chay file setup-agent.bat (chon 3) de nhap Token tu trang Cai Dat tren web, hoac tai lai zip pairing.");
  }

  let authBlocked = !bearer && !!config.tokenRevoked;

  try {
    const res = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        gpmPort: gpmApi?.port || null,
        gpmOnline: !!gpmApi?.online,
        gpmBaseUrl: gpmApi?.base || null,
        // Identity from Authorization Bearer only — omit memberEmail to avoid stale mismatch 403s.
        profiles: profilesToSync.map((p) => ({
          id: p.id,
          name: p.name,
          group_id: p.groupId || undefined,
          group_name: p.groupName || undefined,
          // Required for server to link Extension-created accounts → GPM UUID
          tiktokHandle: p.tiktokHandle || null,
        })),
      }),
    });

    if (res.ok) {
      const syncResult = await res.json();
      console.log(`   [OK] Dong bo thanh cong danh sach: ${syncResult.totalScanned || profilesToSync.length} tai khoan ghi nhan.`);
    } else if (res.status === 401 || res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      markTokenRevoked(errData.error, res.status);
      authBlocked = true;
    } else {
      const err = await res.text();
      console.warn(`   [!] May chu phan hoi (${res.status}):`, err.slice(0, 150));
    }
  } catch (err) {
    console.warn("   [!] Khong the ket noi toi server de dong bo danh sach:", err.message);
  }

  if (authBlocked) {
    console.error("[!] Dung Deep Sweeper — Personal Token can duoc cap nhat truoc.");
    return;
  }

  // 4. Run Deep Sweeper on Profiles with TikTok
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
    // Deduplicate by known tiktokHandle so the same TikTok account is not scanned redundantly
    const seenHandles = new Set();
    for (const p of profilesToSync) {
      if (p.tiktokHandle) {
        const lower = p.tiktokHandle.toLowerCase();
        if (seenHandles.has(lower)) {
          console.log(`   [*] [Bo qua duplicate] Profile ${p.name} (${p.id.slice(0, 8)}) vi @${p.tiktokHandle} da nam trong danh sach quet.`);
          continue;
        }
        seenHandles.add(lower);
      }
      activeTikTokProfiles.push(p);
    }
  }

  console.log(`\n[*] Bat dau cao so lieu chuyen sau TikTok Studio (${activeTikTokProfiles.length} accounts)...`);
  console.log("    Qua trinh chay ngam doc lap qua Snapshot, khong sua/xoa du lieu tren o cung.\n");

  let successCount = 0;
  let failCount = 0;
  let jobCancelled = false;
  const reportedUsernames = new Set();

  await pMap(
    activeTikTokProfiles,
    async (p, idx) => {
      if (authBlocked || config.tokenRevoked) {
        failCount++;
        return;
      }

      if (jobId) {
        const cancelled = await isJobCancelled(jobId);
        if (cancelled) {
          jobCancelled = true;
          console.log(`\n[!] Job dong bo ${jobId} da duoc HUY boi nguoi dung tu Web UI. Dung tien trinh ngay lap tuc.`);
          return;
        }
      }
      if (jobCancelled) return;

      const label = p.tiktokHandle ? `@${p.tiktokHandle}` : `Profile ${p.id.slice(0, 8)}`;
      console.log(`[${idx + 1}/${activeTikTokProfiles.length}] [SCAN] Dang quet ${label}...`);

      const result = await Promise.race([
        extractProfileStudio(p.fullDir, p.id, chromePath, p.tiktokHandle),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Quet profile vuot qua 60 giay (timeout)")), 60000)
        ),
      ]).catch((err) => ({ success: false, error: err.message }));

      if (result.success && result.data) {
        const d = result.data;
        const normUser = (d.username || "").toLowerCase();
        if (normUser && reportedUsernames.has(normUser)) {
          console.log(`   [*] @${d.username} da duoc bao cao trong dot quet nay — bo qua trung lap.`);
          return;
        }
        if (normUser) reportedUsernames.add(normUser);

        successCount++;
        const activeProgStr = (d.revenueBreakdown?.activePrograms && d.revenueBreakdown.activePrograms.length > 0)
          ? d.revenueBreakdown.activePrograms.map((p) => `${p.name}: ${d.currency}${p.revenue !== null && p.revenue !== undefined ? p.revenue : 0}`).join(", ")
          : "Khong co";

        const dailyCount = Array.isArray(d.dailyRevenueBreakdown) ? d.dailyRevenueBreakdown.length : 0;
        const postRewardCount = Array.isArray(d.postRewards) ? d.postRewards.length : 0;
        console.log(
          `   [OK] @${d.username}: ${d.followersCount.toLocaleString()} followers | ` +
          `${d.totalViews.toLocaleString()} views | ` +
          `Total: ${d.currency}${d.totalRevenue !== null ? d.totalRevenue : 0} (7d: ${d.currency}${d.sumRevenue?.revenue7d || 0}, 28d: ${d.currency}${d.sumRevenue?.revenue28d || 0}, 365d: ${d.currency}${d.sumRevenue?.revenue365d || 0}) | ` +
          `Shop: ${d.currency}${d.revenueBreakdown?.tiktokShop?.revenue30d || 0} | ` +
          `Daily Points: ${dailyCount} days | ` +
          `Post Rewards: ${postRewardCount} videos | ` +
          (d.creatorRewardsMissing ? `[CANH BAO: BI NGUNG TIKTOK BETA] | ` : "") +
          `Active: [${activeProgStr}]`
        );

        const gpmProfileName = d.gpmProfileName || p.name || undefined;
        const gpmGroupName = d.gpmGroupName || p.groupName || undefined;

        // Send Studio Report to Server with Token (session UniqId + gpmProfileId)
        let reportOk = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const reportRes = await fetch(`${config.serverUrl}/api/extension/report`, {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({
                ...d,
                postRewards: d.postRewards,
                creatorRewardsMissing: d.creatorRewardsMissing,
                bannedReason: d.bannedReason,
                gpmProfileName,
                gpmGroupName,
                source: "agent",
                metricsSource: "agent",
                // Prefer Bearer session identity — avoid stale zip email mismatch
                memberEmail: undefined,
              }),
            });
            if (reportRes.status === 401 || reportRes.status === 403) {
              const errData = await reportRes.json().catch(() => ({}));
              markTokenRevoked(errData.error, reportRes.status);
              authBlocked = true;
              console.warn(`   [!] Bao cao bi tu choi (auth) — dung cac profile con lai.`);
              break;
            } else if (reportRes.status === 429 || reportRes.status >= 500) {
              const backoffMs = 1500 * (attempt + 1) + Math.floor(Math.random() * 1000);
              console.warn(`   [!] Server tra ve ${reportRes.status} khi bao cao @${d.username}. Thu lai sau ${backoffMs}ms... (lan ${attempt + 1}/3)`);
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            } else if (!reportRes.ok) {
              console.warn(`   [!] May chu tu choi bao cao @${d.username}: HTTP ${reportRes.status}`);
              break;
            } else {
              reportOk = true;
              break;
            }
          } catch (postErr) {
            if (attempt < 2) {
              const backoffMs = 1500 * (attempt + 1) + Math.floor(Math.random() * 1000);
              await new Promise((r) => setTimeout(r, backoffMs));
            } else {
              console.warn(`   [!] Khong the gui bao cao @${d.username} len server:`, postErr.message);
            }
          }
        }
      } else {
        failCount++;
        console.log(`   [!] ${label}: ${result.error || "Khong the lay so lieu"}`);
      }
    },
    config.concurrency || 1
  );

  console.log("\n========================================================");
  console.log("   [HOAN THANH] QUET SO LIEU TIKTOK STUDIO              ");
  console.log("========================================================");
  console.log(`[OK] Thanh cong: ${successCount} accounts`);
  console.log(`[!]  Bo qua / loi: ${failCount} accounts`);
  console.log(`[*]  Thoi gian hoan tat: ${new Date().toLocaleTimeString("en-GB")}`);
  console.log("--------------------------------------------------------\n");
  return { successCount, failCount, profilesCount: profilesToSync.length };
}

// ==========================================
// 9. DAEMON MODE (RUN WITH WINDOWS STARTUP & FOLLOW SETTING SCHEDULE)
// ==========================================
async function fetchServerSchedule() {
  try {
    const portHeaders = {};
    try {
      const gpmApi = await discoverGpmApiBase().catch(() => ({ online: false, port: null }));
      if (gpmApi?.port) {
        portHeaders["x-gpm-port"] = String(gpmApi.port);
      }
      portHeaders["x-gpm-online"] = String(!!gpmApi?.online);
    } catch { }

    const authHeaders = {
      ...(config.personalToken
        ? { Authorization: `Bearer ${config.personalToken}` }
        : {}),
      ...portHeaders,
    };
    const res = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      headers: authHeaders,
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("[!] Khong the ket noi lay lich trinh tu Server:", e.message);
  }
  return null;
}

let lastSweepKey = "";
let lastHandledSignalAt = 0;
let isSweepingActive = false;

async function checkAndRunSchedule(scheduleInfo) {
  if (!scheduleInfo) return;
  if (isSweepingActive) {
    console.log("[*] Dang co tien trinh quet dang chay, bo qua yeu cau moi...");
    return;
  }

  // Check for remote sync job from web button (VPS trigger via SyncQueue)
  const incomingJob = scheduleInfo.syncJob || scheduleInfo.syncSignal;
  if (incomingJob?.requestedAt) {
    const sigAt = Number(incomingJob.requestedAt);
    const jobId = incomingJob.id || incomingJob.jobId;
    if (sigAt > lastHandledSignalAt && Date.now() - sigAt < 5 * 60 * 1000) {
      lastHandledSignalAt = sigAt;
      isSweepingActive = true;
      console.log(`\n[*] [SyncQueue] Nhan job dong bo tu Web/VPS (Job: ${jobId || "N/A"})! Bat dau quet ngay...`);

      const authHeaders = {
        "Content-Type": "application/json",
        ...(config.personalToken ? { Authorization: `Bearer ${config.personalToken}` } : {}),
      };

      // 1. Report job started (PROCESSING)
      if (jobId) {
        try {
          await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              action: "start_job",
              jobId,
              machineId: cachedMachineId || undefined,
              machineName: cachedMachineName || os.hostname(),
            }),
          });
        } catch (e) {
          console.warn("[!] Khong the bao cao bat dau job:", e.message);
        }
      }

      // 2. Perform sweep (passes targetProfileId / targetHandle if single account)
      try {
        const stats = await performFullSweep(incomingJob);
        // 3. Report job completed (COMPLETED with rich summary)
        if (jobId) {
          const summary = (stats?.successCount > 0)
            ? `Đã đồng bộ ${stats.profilesCount} profile (quét thành công ${stats.successCount} tài khoản)`
            : `Đã đồng bộ ${stats?.profilesCount || 0} profile GPMLogin`;
          await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              action: "complete_job",
              jobId,
              successCount: stats?.successCount || 0,
              failCount: stats?.failCount || 0,
              profilesCount: stats?.profilesCount || 0,
              resultSummary: summary,
            }),
          }).catch(() => { });
        }
      } catch (err) {
        if (jobId) {
          await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              action: "fail_job",
              jobId,
              errorMessage: err.message || "Loi quet tu Client Agent",
            }),
          }).catch(() => { });
        }
      } finally {
        isSweepingActive = false;
      }
      return;
    }
  }

  const now = new Date();
  const currentHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayStr = now.toDateString();

  const sweeper = scheduleInfo.sweeperSchedule;
  const isAuto = sweeper?.autoEnabled ?? scheduleInfo.autoEnabled ?? true;
  if (!isAuto) return;

  const schedules = sweeper?.schedules || scheduleInfo.rawSchedule?.schedules || [
    { repeat: "DAILY", timeOfDay: "18:00", enabled: true },
  ];

  for (const s of schedules) {
    if (!s.enabled) continue;

    if (s.repeat === "DAILY") {
      const targetTime = s.timeOfDay || "18:00";
      const key = `${todayStr}_${targetTime}`;
      if (currentHM === targetTime && lastSweepKey !== key) {
        lastSweepKey = key;
        console.log(`\n[*] [Lich Trinh Server Den Gio] Kich hoat quet vet luc ${targetTime}...`);
        isSweepingActive = true;
        try { await performFullSweep(); } finally { isSweepingActive = false; }
      }
    } else if (s.repeat === "HOURLY") {
      const h = s.everyCount || 1;
      const key = `${todayStr}_H${now.getHours()}`;
      if (now.getHours() % h === 0 && now.getMinutes() === 0 && lastSweepKey !== key) {
        lastSweepKey = key;
        console.log(`\n[*] [Lich Trinh Server Dinh Ky] Kich hoat quet vet moi ${h} gio...`);
        isSweepingActive = true;
        try { await performFullSweep(); } finally { isSweepingActive = false; }
      }
    } else if (s.repeat === "CUSTOM" && s.intervalMinutes) {
      const m = Number(s.intervalMinutes) || 60;
      const totalMin = now.getHours() * 60 + now.getMinutes();
      const key = `${todayStr}_M${Math.floor(totalMin / m)}`;
      if (totalMin % m === 0 && lastSweepKey !== key) {
        lastSweepKey = key;
        console.log(`\n[*] [Lich Trinh Tuy Bien Server] Kich hoat quet vet moi ${m} phut...`);
        isSweepingActive = true;
        try { await performFullSweep(); } finally { isSweepingActive = false; }
      }
    }
  }
}

async function runDaemon() {
  console.log("\n========================================================");
  console.log("   TIKTOKFLOW CLIENT AGENT - DAEMON CHAY NGAM           ");
  console.log("========================================================");
  console.log(`Server URL       : ${config.serverUrl}`);
  console.log(`Nhan vien        : ${config.memberEmail}`);
  console.log(`Che do           : Tu dong chay ngam theo lich Setting tren Server`);
  console.log("--------------------------------------------------------\n");

  // 1. Lay cau hinh lich & kiem tra ngay SyncQueue tu Server
  let activeSchedule = await fetchServerSchedule();
  if (activeSchedule) {
    console.log(`[*] Lich quet tu Server: ${activeSchedule.scheduleSummary || "Hang ngay luc 18:00"}`);
    // Xu ly ngay job dong bo dang cho (neu co)
    await checkAndRunSchedule(activeSchedule);
  }

  // 2. Neu chua chay job nao tu queue, quet khoi dong ban dau
  if (!activeSchedule?.syncJob) {
    console.log("[*] [Khoi Dong Cung Windows] Tien hanh quet ban dau...");
    try {
      await performFullSweep();
    } catch (err) {
      console.warn("[!] Quet ban dau gap loi:", err.message);
    }
  }

  // 3. Vong lap kiem tra dinh ky moi 10 giay (nhan tin hieu Sync tu Web/VPS tuc thi)
  setInterval(async () => {
    try {
      const refreshed = await fetchServerSchedule();
      if (refreshed) {
        activeSchedule = refreshed;
      }
      await checkAndRunSchedule(activeSchedule);
    } catch (err) {
      console.warn("[!] Loi kiem tra lich:", err.message);
    }
  }, 10000);
}

// Main entry (strictly guarded against unintended execution during imports)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  (async () => {
    try {
      computeMachineFingerprint();
      console.log(`[*] Machine fingerprint: ${cachedMachineId.slice(0, 12)}…`);
    } catch (err) {
      console.warn("[!] Fingerprint loi:", err.message);
    }

    const locked = await acquireAgentLock();
    if (!locked) {
      process.exit(1);
    }

    try {
      if (isDaemon) {
        await runDaemon();
      } else {
        await performFullSweep();
        // One-shot sweep: release lock so another Agent can run later
        releaseAgentLock();
      }
    } catch (err) {
      console.error(isDaemon ? "[LOI] Loi Daemon:" : "[LOI] Loi nghiem trong:", err);
      await emergencyCleanup();
      process.exit(1);
    }
  })();
}

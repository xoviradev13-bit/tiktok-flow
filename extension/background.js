// TikTokFlow Companion - Background Service Worker
// Coordinates TikTok login verification, GPM fleet sync, alarms, and badge indicators

const DEFAULT_SERVER_URL = "http://localhost:3000";
const GPM_PORT_CANDIDATES = [9495, 19995, 19996, 19994, 8848];
const GPM_API_VERSIONS = ["v1", "v3"];
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown between fleet syncs
/** Same port as Client Agent singleton lock in agent.js */
const AGENT_LOCK_PORT = 39741;
/** Dedupe concurrent identity reports for the same @handle in one profile. */
const _identityReportInFlight = new Map();
/** Last successful identity POST per @handle (throttle). */
const _lastIdentityOkAt = new Map();
const IDENTITY_KEEPALIVE_ALARM = "tiktokflow_identity_keepalive";
const GPM_LINK_ALARM = "tiktokflow_gpm_link";
const IDENTITY_RETRY_ALARM = "tiktokflow_identity_retry";
const TIKTOK_TAB_URLS = ["https://www.tiktok.com/*", "https://*.tiktok.com/*"];

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
  const timeoutId = setTimeout(() => controller.abort(), 1200);
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

let _challengeCache = { ts: 0, at: 0 };
/** Shared challenge clock — avoid hammering /api/extension/challenge (server ±120s window). */
async function fetchChallengeTs(serverUrl) {
  if (_challengeCache.ts && Date.now() - _challengeCache.at < 45_000) {
    return _challengeCache.ts;
  }
  const resp = await fetch(`${serverUrl}/api/extension/challenge`);
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !Number.isFinite(Number(json.challengeTs))) {
    throw new Error("challenge_unavailable");
  }
  _challengeCache = { ts: Number(json.challengeTs), at: Date.now() };
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
  const timeoutId = setTimeout(() => controller.abort(), 5000);
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
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    // Brief pause so chrome.storage flushes to Local Extension Settings before Agent reads disk.
    await new Promise((r) => setTimeout(r, 200));
    const resp = await fetch(`http://127.0.0.1:${AGENT_LOCK_PORT}/resolve-browser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionHash,
        username,
        nonce,
        challengeTs,
        storageBeacon,
      }),
      signal: controller.signal,
    });
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
    const timeoutId = setTimeout(() => controller.abort(), 1500);
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

  const tryBases = [];
  if (fresh && stored.gpmApiBase) tryBases.push(stored.gpmApiBase);
  // Prefer v1 first (https://api-docs.gpmloginapp.com/)
  for (const port of GPM_PORT_CANDIDATES) {
    tryBases.push(`http://127.0.0.1:${port}/api/v1`);
  }
  for (const port of GPM_PORT_CANDIDATES) {
    tryBases.push(`http://127.0.0.1:${port}/api/v3`);
  }

  const seen = new Set();
  for (const base of tryBases) {
    if (seen.has(base)) continue;
    seen.add(base);
    if (await probeValidBase(base)) {
      const portMatch = base.match(/:(\d+)\//);
      const port = portMatch ? Number(portMatch[1]) : null;
      await chrome.storage.local.set({
        gpmApiBase: base,
        gpmApiPort: port,
        gpmApiDiscoveredAt: Date.now(),
        gpmApiOnline: true,
      });
      return { online: true, base, port };
    }
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
 * server clearly rejects the personal token itself (else every GPM profile
 * loses auth and requires opening the popup).
 */
async function markTokenRevoked(reason, httpStatus) {
  const message = resolveAuthErrorMessage(reason, httpStatus);
  const wipePersonal =
    httpStatus === 401 &&
    /personal.?token|thu hồi|revoked|không hợp lệ|vo hieu/i.test(String(reason || ""));

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
    // Soft auth failure — keep personalToken so background can keep reporting.
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
async function ensureExtensionAuth() {
  const data = await chrome.storage.local.get(["personalToken", "tokenRevoked"]);
  if (data.personalToken && !data.tokenRevoked) return { ok: true };

  const fromAgent = await bootstrapAuthFromAgent();
  if (fromAgent.ok) return fromAgent;

  await redeemPairingIfNeeded();
  const again = await chrome.storage.local.get(["personalToken", "tokenRevoked"]);
  if (again.personalToken && !again.tokenRevoked) return { ok: true, source: "pair" };
  return { ok: false, reason: fromAgent.reason || "no_auth" };
}

async function exchangeSessionFromPersonalToken(serverUrl, personalToken) {
  let attest;
  try {
    attest = await requestAgentAttest(serverUrl);
  } catch (err) {
    return {
      ok: false,
      status: 403,
      error: err?.message || "Client Agent chưa chứng thực thiết bị.",
    };
  }
  const resp = await fetch(`${serverUrl}/api/extension/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${personalToken}`,
    },
    body: JSON.stringify({ ...attest }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: json.error };
  }
  const expiresIn = Number(json.expiresIn) || 900;
  await chrome.storage.local.set({
    refreshToken: json.refreshToken,
  });
  await setAccessSession(json.accessToken, Date.now() + expiresIn * 1000 - 30_000);
  return { ok: true };
}

async function refreshSession(serverUrl, refreshToken) {
  const resp = await fetch(`${serverUrl}/api/extension/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      error: json.error,
      reuseDetected: !!json.reuseDetected,
    };
  }
  const expiresIn = Number(json.expiresIn) || 900;
  await chrome.storage.local.set({
    refreshToken: json.refreshToken,
  });
  await setAccessSession(json.accessToken, Date.now() + expiresIn * 1000 - 30_000);
  return { ok: true };
}

/** Ensure a usable bearer. Prefer personalToken — JWT session exchange stampede
 * across hundreds of GPM profiles causes refresh-reuse killAll + Prisma P2028. */
async function ensureAccessToken() {
  await ensureExtensionAuth();
  const data = await chrome.storage.local.get([
    "serverUrl",
    "personalToken",
    "refreshToken",
    "tokenRevoked",
  ]);
  const access = await getAccessSession();

  if (data.tokenRevoked || !data.personalToken) {
    // Still try Agent bootstrap before giving up
    if (!data.personalToken && !data.tokenRevoked) {
      await ensureExtensionAuth();
      const again = await chrome.storage.local.get(["personalToken", "tokenRevoked"]);
      if (again.personalToken && !again.tokenRevoked) {
        return { ok: true, bearer: again.personalToken, legacy: true };
      }
    }
    return { ok: false, bearer: null, authRequired: true };
  }

  // Cached JWT still valid — use it (no network).
  if (access.accessToken && access.accessExpiresAt && Date.now() < access.accessExpiresAt) {
    return { ok: true, bearer: access.accessToken };
  }

  // Fleet-safe path: personalToken is accepted by report/sync APIs directly.
  return { ok: true, bearer: data.personalToken, legacy: true };
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

  if ((resp.status === 401 || resp.status === 403) && !retried) {
    // One refresh/re-exchange attempt
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
  const discovered = await discoverGpmApiBase(false);
  if (!discovered.online) {
    // One forced rediscovery before giving up
    const again = await discoverGpmApiBase(true);
    if (!again.online) return [];
  }

  const stored = await chrome.storage.local.get(["gpmApiBase"]);
  const base = stored.gpmApiBase;
  if (!base) return [];

  async function fetchGpmProfiles(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      return await fetch(url, { signal: controller.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let gpmResp = await fetchGpmProfiles(`${base}/profiles?page=1&per_page=300`);
  if (!gpmResp || !gpmResp.ok) {
    // Try alternate version on same port
    const alt = base.includes("/api/v1")
      ? base.replace("/api/v1", "/api/v3")
      : base.replace("/api/v3", "/api/v1");
    gpmResp = await fetchGpmProfiles(`${alt}/profiles?page=1&per_page=300`);
    if (gpmResp && gpmResp.ok) {
      await chrome.storage.local.set({ gpmApiBase: alt, gpmApiDiscoveredAt: Date.now() });
    }
  }
  if (!gpmResp || !gpmResp.ok) return [];

  const gpmData = await gpmResp.json();
  let rawProfiles = [];
  if (gpmData && gpmData.data) {
    if (Array.isArray(gpmData.data)) rawProfiles = gpmData.data;
    else if (Array.isArray(gpmData.data.data)) rawProfiles = gpmData.data.data;
  } else if (Array.isArray(gpmData)) {
    rawProfiles = gpmData;
  }
  return Array.isArray(rawProfiles) ? rawProfiles : [];
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
    const timeoutId = setTimeout(() => controller.abort(), 3000);
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
  if (explicit && !/^[0-9a-f-]{36}$/i.test(explicit)) return explicit;
  const gid = String(groupId || "").trim();
  if (!gid) return null;
  if (map && map.has(gid)) return map.get(gid);
  // Do not treat a raw numeric id (e.g. "0" or "1") or UUID as a group name
  if (!/^[0-9a-f-]{36}$/i.test(gid) && !/^\d+$/.test(gid)) return gid;
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

      if (resolvedGroup) {
        await chrome.storage.local.set({
          linkedGpmProfileId: sessionHit.id,
          linkedGpmProfileName: sessionHit.name || "",
          linkedGpmGroupName: resolvedGroup,
          linkedGpmUsername: clean,
        });
      }

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
    // Throttle successful re-reports — keepalive/FORCE was flooding the server.
    const lastOk = _lastIdentityOkAt.get(usernameEarly);
    if (lastOk && Date.now() - lastOk < 25_000 && payload?.isLoggedIn !== false) {
      return { ok: true, skipped: true };
    }
  }

  const work = (async () => {
    try {
      await ensureExtensionAuth();
      const config = await getConfig();
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
        const prevStored = await chrome.storage.local.get([
          "linkedGpmProfileId",
          "linkedGpmProfileName",
          "linkedGpmGroupName",
        ]);
        const effectiveId =
          gpmMatch?.id || prevStored.linkedGpmProfileId || undefined;
        const effectiveGroupName =
          gpmMatch?.groupName || prevStored.linkedGpmGroupName || undefined;
        const effectiveProfileName =
          gpmMatch?.name || prevStored.linkedGpmProfileName || undefined;

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

      // Phase 1: record account in DB immediately — do not wait on GPM resolve.
      let outcome = await postIdentity(null);
      if (!outcome.ok) {
        scheduleIdentityRetryAlarm(3000);
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

      const prevStore = await chrome.storage.local.get(["latestAccount"]);
      const prev = prevStore.latestAccount || {};
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

      // Phase 2 via alarm — MV3 kills SW after sendResponse; void async is unreliable.
      // Skip enqueue when this profile already has a fresh linked GPM (stops resolve/challenge storms).
      // But if the server row still has no GPM, force phase-2 (local cache can lie).
      const linked = await chrome.storage.local.get([
        "linkedGpmProfileId",
        "linkedGpmUsername",
        "linkedGpmResolveAttest",
      ]);
      const serverGpm =
        outcome.result?.account?.gpmProfileId ||
        outcome.linkedId ||
        null;
      const alreadyLinked =
        linked.linkedGpmProfileId &&
        String(linked.linkedGpmUsername || "").toLowerCase() === cleanUser &&
        Number.isFinite(Number(linked.linkedGpmResolveAttest?.ts)) &&
        Math.abs(Date.now() - Number(linked.linkedGpmResolveAttest.ts)) < 10 * 60_000 &&
        !!serverGpm;
      if (!alreadyLinked) {
        const pendingStore = await chrome.storage.local.get(["pendingGpmLinks"]);
        const pendingList = Array.isArray(pendingStore.pendingGpmLinks)
          ? pendingStore.pendingGpmLinks
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

      if (usernameEarly) _lastIdentityOkAt.set(usernameEarly, Date.now());
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
  _gpmLinkAlarmSoonest = when;
  try {
    chrome.alarms.create(GPM_LINK_ALARM, { when });
  } catch {
    /* ignore */
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
          const age = Date.now() - (item.enqueuedAt || 0);
          const attempts = (item.attempts || 0) + 1;
          // Retry with backoff up to 10 minutes, then drop
          if (age < 10 * 60_000 && attempts < 12) {
            remaining.push({ ...item, attempts, enqueuedAt: item.enqueuedAt || Date.now() });
          }
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
        if (authRequired || !resp || !resp.ok) {
          hadFailure = true;
          const attempts = (item.attempts || 0) + 1;
          if (Date.now() - (item.enqueuedAt || 0) < 10 * 60_000 && attempts < 12) {
            remaining.push({ ...item, attempts });
          }
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
      scheduleGpmLinkAlarm(hadFailure ? delay : 3000);
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
    const timeoutId = setTimeout(() => controller.abort(), 4000);
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
  checkTikTokCookie();
  syncGpmFleet(false);
  void pingTikTokIdentityTabs("onInstalled");
  void processPendingIdentityReports();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[TikTokFlow] Browser started.");
  await clearStaleEmailMismatchRevoke();
  await initFromConfigFile();
  await ensureExtensionAuth();
  setupSyncAlarm();
  setupIdentityKeepaliveAlarm();
  checkTikTokCookie();
  syncGpmFleet(false);
  void pingTikTokIdentityTabs("onStartup");
  void processPendingIdentityReports();
});

/** One-time recovery: old server returned email-mismatch 403 and marked token "revoked". */
async function clearStaleEmailMismatchRevoke() {
  const data = await chrome.storage.local.get([
    "tokenRevoked",
    "tokenRevokedReason",
    "personalToken",
  ]);
  const reason = String(data.tokenRevokedReason || "");
  if (
    data.tokenRevoked &&
    /không khớp|khong khop|personalToken/i.test(reason)
  ) {
    console.log("[TikTokFlow] Clearing stale email-mismatch re-auth flag.");
    await chrome.storage.local.set({
      tokenRevoked: false,
      tokenRevokedReason: "",
      tokenRevokedAt: null,
      authRequired: !data.personalToken,
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
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
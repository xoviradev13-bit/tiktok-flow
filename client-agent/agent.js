import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import crypto from "crypto";
import { execSync } from "child_process";
import { chromium } from "playwright-core";

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
let lastDirectSyncAt = 0;
/** Shared open-profile snapshot across concurrent resolve calls. */
let openProfilesSnapshot = {
  at: 0,
  storagePath: null,
  openProfiles: [],
  apiOnline: false,
  gpm: null,
  scanAllDirsOnly: false,
};

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

function isExtensionOrigin(origin) {
  return (
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://")
  );
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

      // Browser Web App Direct Trigger (e.g. user clicks Sync in Web Header)
      if (
        req.method === "POST" &&
        (urlPath === "/sync" || urlPath === "/trigger-sync")
      ) {
        // Strict Security Whitelisting: Only allow requests originating from our VPS serverUrl or local dev
        const configuredServer = String(config.serverUrl || "").replace(/\/+$/, "").toLowerCase();
        const incomingOrigin = origin.replace(/\/+$/, "").toLowerCase();
        const isAllowedOrigin =
          incomingOrigin &&
          (incomingOrigin === configuredServer ||
           incomingOrigin === "http://localhost:3000" ||
           incomingOrigin === "http://127.0.0.1:3000");

        if (!isAllowedOrigin) {
          res.writeHead(403, headers);
          res.end(JSON.stringify({ ok: false, error: "origin_forbidden" }));
          return;
        }

        // Anti-DoS Cooldown: Max 1 sweep per 45 seconds to prevent browser spamming
        const now = Date.now();
        if (now - lastDirectSyncAt < 45000) {
          res.writeHead(429, {
            ...headers,
            "Access-Control-Allow-Origin": origin,
          });
          res.end(
            JSON.stringify({
              ok: false,
              error: "Vui lòng đợi 45 giây giữa các lần đồng bộ thủ công.",
            })
          );
          return;
        }
        lastDirectSyncAt = now;

        headers["Access-Control-Allow-Origin"] = origin;
        headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
        headers["Access-Control-Allow-Headers"] = "Content-Type";
        res.writeHead(200, headers);
        res.end(
          JSON.stringify({
            ok: true,
            message: "Client Agent đã nhận lệnh và bắt đầu quét GPMLogin ngay lập tức",
          })
        );
        setTimeout(() => {
          performFullSweep().catch((err) =>
            console.warn("[!] Lỗi khi chạy quét từ web trigger:", err.message)
          );
        }, 100);
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
            } catch {}
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
            } catch {}
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

function persistConfig() {
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
}

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
  persistConfig();

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
if (freeMemGb < 1.8) {
  // Máy đang bận hoặc ít RAM (<1.8GB trống): Giữ ở 2 luồng cực nhẹ
  autoConcurrency = 2;
} else if (cpuCount >= 12 && freeMemGb >= 5.0) {
  // Máy khỏe, RAM dư nhiều: Đẩy lên 5 luồng cào siêu tốc
  autoConcurrency = 5;
} else if (cpuCount >= 8 && freeMemGb >= 3.0) {
  // Máy chuẩn văn phòng đời mới: 4 luồng mượt mà
  autoConcurrency = 4;
} else {
  autoConcurrency = 3;
}

if (!config.concurrency || config.concurrency === "auto") {
  config.concurrency = autoConcurrency;
} else {
  config.concurrency = Math.max(1, Math.min(Number(config.concurrency) || 3, 8));
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
 * and has our agent prefix before deleting. NEVER touches user files.
 */
function cleanupTempDir(tempDir) {
  if (!tempDir || typeof tempDir !== "string") return;
  try {
    const resolvedTarget = path.resolve(tempDir);
    const resolvedTmp = path.resolve(os.tmpdir());

    // SAFETY CHECK 1: Target must strictly reside within os.tmpdir()
    if (!resolvedTarget.startsWith(resolvedTmp) || resolvedTarget === resolvedTmp) {
      console.warn("[!] [Bao Ve File] Chan hanh dong xoa ngoai thu muc tam:", resolvedTarget);
      return;
    }

    // SAFETY CHECK 2: Directory name must start with our agent signature prefix
    const baseName = path.basename(resolvedTarget);
    if (!baseName.startsWith("gpm-agent-")) {
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

// Ensure all spawned Chrome instances and temp folders are cleanly destroyed on exit or Ctrl+C
async function emergencyCleanup() {
  for (const ctx of activeContexts) {
    try { await ctx.close(); } catch { }
  }
  for (const dir of activeTempDirs) {
    cleanupTempDir(dir);
  }
  releaseAgentLock();
}

process.on("exit", () => {
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
const GPM_PORT_CANDIDATES = [9495, 19995, 19996, 19994, 8848];
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
function listOpenProfileIdsFromProcesses(storageRoot) {
  const rootKey = String(storageRoot || "");
  if (
    Date.now() - processOpenCache.at < 2500 &&
    processOpenCache.root === rootKey &&
    processOpenCache.ids.size
  ) {
    return processOpenCache.ids;
  }
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
      const out = execSync(cmd, {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
      for (const line of String(out || "").split(/\r?\n/)) ingestLine(line);
      if (open.size) break;
    } catch {
      /* try next */
    }
  }


  processOpenCache = { at: Date.now(), root: rootKey, ids: open };
  return open;
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
function listOpenProfilesFromDisk(storageRoot) {
  const ids = new Set();
  if (!storageRoot) return [];
  for (const id of listOpenProfileIdsFromProcesses(storageRoot)) ids.add(id);
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

function readGpmProfileMetaFromDisk(storageRoot, profileId) {
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
    const groupId =
      parsed?.group_id ||
      parsed?.groupId ||
      parsed?.Group?.id ||
      null;
    const groupName =
      parsed?.group_name ||
      parsed?.groupName ||
      parsed?.Group?.name ||
      null;
    return { name, groupName: groupName || null, groupId: groupId ? String(groupId) : null };
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
function profileContainsStorageBeacon(storageRoot, profileId, beacon, opts = {}) {
  if (!beacon || beacon.length < 12) return false;
  const logOnly = opts.logOnly === true;
  const maxTail = Math.max(64 * 1024, Number(opts.maxTail) || 512 * 1024);
  const root = path.join(
    storageRoot,
    String(profileId),
    "Default",
    "Local Extension Settings"
  );
  if (!fs.existsSync(root)) return false;
  try {
    for (const extDir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!extDir.isDirectory()) continue;
      const dir = path.join(root, extDir.name);
      let files = [];
      try {
        files = fs.readdirSync(dir);
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
          const st = fs.statSync(full);
          const fd = fs.openSync(full, "r");
          try {
            const start = Math.max(0, st.size - maxTail);
            const len = st.size - start;
            const buf = Buffer.alloc(len);
            fs.readSync(fd, buf, 0, len, start);
            text = buf.toString("latin1");
          } finally {
            fs.closeSync(fd);
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
    const scanStarted = Date.now();
    let profilesScanned = 0;
    // Profile that just flushed chrome.storage has the newest .log — scan it first.
    const ranked = rankProfilesForBeaconScan(storageRoot, openProfiles);
    for (let attempt = 0; attempt < 2; attempt++) {
      const logOnly = attempt === 0;
      for (const p of ranked) {
        profilesScanned += 1;
        let ok = false;
        try {
          ok = profileContainsStorageBeacon(storageRoot, p.id, beacon, {
            logOnly,
            maxTail: logOnly ? 256 * 1024 : 1024 * 1024,
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
      const meta = storagePath
        ? readGpmProfileMetaFromDisk(storagePath, base.gpmProfileId)
        : { name: null, groupName: null, groupId: null };
      const gpmProfileName = base.gpmProfileName || meta.name || null;
      let gpmGroupName = base.gpmGroupName || meta.groupName || null;

      // Sync path first: memory/disk/builtin cache (no network). Group must not depend on
      // live GPM API — otherwise phase-2 reports land with id/name but groupName null.
      if (!gpmGroupName && meta.groupId) {
        if (!gpmGroupsCache.byId.size) loadGpmGroupsDiskCache();
        const gid = String(meta.groupId);
        if (gpmGroupsCache.byId.has(gid)) {
          gpmGroupName = gpmGroupsCache.byId.get(gid);
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


      return {
        ...base,
        gpmProfileName,
        gpmGroupName: gpmGroupName || undefined,
      };
    } catch (err) {
      return { ...payload, ...attest };
    }
  };

  const storagePath = getGpmStoragePath();

  // Beacon is unique per resolve — scan open profile dirs (locks/PID) even when GPM app is closed.
  // Process cmdline often returns 0 when Agent runs as a service; locks + DevToolsActivePort still work.
  if (storageBeacon && storagePath) {
    let candidates = listOpenProfilesFromDisk(storagePath);
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

    const processOpenIds = listOpenProfileIdsFromProcesses(storagePath);
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
      openProfiles = listOpenProfilesFromDisk(storagePath);
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
          const h = findTikTokHandleInProfile(path.join(storagePath, String(p.id)));
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
        const h = findTikTokHandleInProfile(path.join(storagePath, String(p.id)));
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

export function findTikTokHandleInProfile(profileDir) {
  try {
    const defaultDir = path.join(profileDir, "Default");
    if (!fs.existsSync(defaultDir)) return null;

    const readBestEffort = (src, maxBytes = 8 * 1024 * 1024) => {
      try {
        const buf = fs.readFileSync(src);
        return buf.toString("latin1", 0, Math.min(buf.length, maxBytes));
      } catch {
        /* locked while browser open */
      }
      const tmp = path.join(
        os.tmpdir(),
        `ttf-rd-${crypto.randomBytes(6).toString("hex")}`
      );
      try {
        fs.copyFileSync(src, tmp);
        const buf = fs.readFileSync(tmp);
        return buf.toString("latin1", 0, Math.min(buf.length, maxBytes));
      } catch {
        return null;
      } finally {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      }
    };

    const chunks = [];

    const historyPath = path.join(defaultDir, "History");
    if (fs.existsSync(historyPath)) {
      const t = readBestEffort(historyPath, 16 * 1024 * 1024);
      if (t) chunks.push(t);
    }

    const levelDbDir = path.join(defaultDir, "Local Storage", "leveldb");
    if (fs.existsSync(levelDbDir)) {
      try {
        for (const f of fs.readdirSync(levelDbDir)) {
          if (!f.endsWith(".log") && !f.endsWith(".ldb")) continue;
          const t = readBestEffort(path.join(levelDbDir, f));
          if (t) chunks.push(t);
        }
      } catch {
        /* ignore */
      }
    }

    for (const rel of ["Preferences", "Secure Preferences", "Network/Cookies", "Cookies"]) {
      const p = path.join(defaultDir, rel);
      if (!fs.existsSync(p)) continue;
      const t = readBestEffort(p);
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

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let entries = [];
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip file locks so GPMLogin is never disturbed
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
        // Safe Read-only copy into Temp
        fs.copyFileSync(srcPath, destPath);
      }
    } catch { }
  }
}

function snapshotProfileToTemp(profileDir, profileId) {
  if (!fs.existsSync(profileDir)) return null;
  let tempDir = null;
  try {
    const baseParent = path.dirname(profileDir);
    const tempRoot = fs.existsSync(baseParent) ? path.join(baseParent, ".gpm_temp") : os.tmpdir();
    fs.mkdirSync(tempRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(tempRoot, `agent-${String(profileId).slice(0, 8)}-`));
    activeTempDirs.add(path.resolve(tempDir));
    copyDirRecursive(profileDir, tempDir);
    return tempDir;
  } catch (err) {
    cleanupTempDir(tempDir);
    return null;
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
export async function extractProfileStudio(profileDir, profileId, chromePath, detectedHandle) {
  const tempDir = snapshotProfileToTemp(profileDir, profileId);
  if (!tempDir) {
    return { success: false, error: "Khong the tao snapshot profile" };
  }

  let context = null;
  try {
    context = await chromium.launchPersistentContext(tempDir, {
      headless: config.headless !== false,
      executablePath: chromePath,
      args: LAUNCH_ARGS,
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 900 },
    });

    activeContexts.add(context);
    const page = await context.newPage();

    let userInfo = null;
    let followerCount = 0;
    let rawPostList = [];
    let interceptedRewardAnalytics = null;
    let interceptedAllPrograms = null;
    let interceptedInsightsHistory = null;
    let homeRewards365 = null;

    // Intercept essential user, follower, insights, and monetization APIs
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
        if (url.includes("/m10n_center/reward_analytics")) {
          const j = await resp.json();
          const payload = j.data || j;
          if (payload.daily_estimated_income || payload.seven_d_income) {
            interceptedRewardAnalytics = payload;
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
      } catch { }
    });

    // Navigate to TikTok Studio Content
    await page.goto("https://www.tiktok.com/tiktokstudio/content", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    }).catch(() => { });

    // Reliable Login Detection
    const isLoginPage = /login|passport/i.test(page.url()) || (await page.title().catch(() => "")).includes("Log in");
    if (isLoginPage) {
      return { success: false, error: "Profile chua dang nhap TikTok hoac phien dang nhap da het han." };
    }

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

    // Extract pre-rendered post_list from __Creator_Center_Context__
    const scriptContent = await page.evaluate(() => {
      const el = document.getElementById("__Creator_Center_Context__");
      return el ? el.textContent : null;
    }).catch(() => null);

    if (scriptContent) {
      try {
        const s = scriptContent.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed.firstBatchQueryItems?.item_list)) {
          rawPostList = parsed.firstBatchQueryItems.item_list;
        } else if (Array.isArray(parsed.post_list)) {
          rawPostList = parsed.post_list;
        }
      } catch { }
    }

    // Fallback: Extract from DOM if script tag was missing
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

    const videosList = rawPostList.map((p) => ({
      title: p.desc || "No title",
      views: cleanNum(p.play_count),
      likes: cleanNum(p.like_count),
      comments: cleanNum(p.comment_count),
      shares: cleanNum(p.share_count),
      postTime: p.post_time || p.create_time ? new Date(parseInt(p.post_time || p.create_time, 10) * 1000).toISOString() : null,
      coverUrl: Array.isArray(p.cover_url) ? p.cover_url[0] : null,
    }));

    const totalViews = videosList.reduce((sum, v) => sum + v.views, 0);

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

    // Visit monetization tab to extract Active Programs (LIVE rewards, TikTok Shop, Creator Rewards)
    let totalRewardsUsd = null;
    let creatorRewardsUsd = null;
    let shopRewardsUsd = null;
    let shopProgramName = "TikTok Shop for Seller";
    let liveRewardsUsd = null;
    let activePrograms = [];
    let dailyBreakdown = [];
    let revenue7d = null;
    let revenue28d = null;
    let revenue60d = null;
    let revenue365d = null;
    let rpm = null;
    let currency = "$";

    try {
      await page.goto("https://www.tiktok.com/tiktokstudio/monetization", {
        waitUntil: "domcontentloaded",
        timeout: 12000,
      }).catch(() => { });

      // Wait up to 2.5s for interceptedRewardAnalytics to arrive
      const waitStart = Date.now();
      while (Date.now() - waitStart < 2500 && !interceptedRewardAnalytics) {
        await page.waitForTimeout(200);
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
          const effective = p28d > 0 ? p28d : p7d;

          if (p.m10n_program === 11 || /shop/i.test(name)) {
            shopRewardsUsd = effective;
            shopProgramName = name;
          } else {
            progsMap.set(name, {
              name,
              programId: p.m10n_program,
              revenue: effective,
              revenue7d: p7d,
              revenue28d: p28d,
              revenue60d: p60d,
            });
          }
        });

        // Add any active programs from all_programs that haven't earned yet
        if (Array.isArray(interceptedAllPrograms)) {
          interceptedAllPrograms.forEach((ap) => {
            if (ap && ap.name && !progsMap.has(ap.name) && !/shop/i.test(ap.name)) {
              progsMap.set(ap.name, {
                name: ap.name,
                programId: ap.m10n_project,
                revenue: 0,
                revenue7d: 0,
                revenue28d: 0,
                revenue60d: 0,
              });
            }
          });
        }

        activePrograms = Array.from(progsMap.values());
        const liveProg = activePrograms.find((p) => /live/i.test(p.name));
        const creatorProg = activePrograms.find((p) => /creator|gaming|incentive|beta/i.test(p.name));
        liveRewardsUsd = liveProg ? liveProg.revenue : 0;
        creatorRewardsUsd = creatorProg ? creatorProg.revenue : 0;
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
            activeProgs: Array.from(programsMap.entries()).map(([name, revenue]) => ({ name, revenue })),
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
            var resp = await fetch(url);
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
      } catch {}

      if (totalRewardsUsd && totalViews > 0) {
        rpm = Number(((totalRewardsUsd / totalViews) * 1000).toFixed(3));
      }
    } catch { }

    const storageRoot = path.dirname(profileDir);
    const meta = readGpmProfileMetaFromDisk(storageRoot, profileId);
    let gpmGroupName = meta.groupName || null;
    if (!gpmGroupName && meta.groupId) {
      gpmGroupName = await lookupGpmGroupName(lastGoodGpmBase || null, meta.groupId);
    }
    const gpmProfileName = meta.name || `Profile ${String(profileId).slice(0, 8)}`;

    return {
      success: true,
      data: {
        username: finalHandle,
        nickname: userInfo?.NickName || null,
        followersCount: followerCount,
        totalViews,
        viewsToday: totalViews,
        videoCount: videosList.length,
        totalRevenue: totalRewardsUsd,
        revenue7d,
        revenue28d,
        revenue60d,
        revenue365d,
        dailyBreakdown,
        insightsHistory: interceptedInsightsHistory,
        tiktokShopRevenue: shopRewardsUsd,
        tiktokShopProgramName: shopProgramName,
        tiktokShopRewardsUsd: shopRewardsUsd,
        creatorRewardsRevenue: creatorRewardsUsd,
        creatorRewardsUsd,
        liveRewardsRevenue: liveRewardsUsd,
        activePrograms,
        activeProgramNames: activePrograms.map((p) => p.name),
        currency,
        rpm,
        videosList,
        isLoggedIn: true,
        gpmProfileId: profileId,
        gpmProfileName,
        gpmGroupName: gpmGroupName || undefined,
        memberEmail: config.memberEmail,
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (context) {
      activeContexts.delete(context);
      await context.close().catch(() => { });
    }
    cleanupTempDir(tempDir);
  }
}

// ==========================================
// 8. MAIN SECURE AGENT EXECUTION
// ==========================================
// ==========================================
// 8. MAIN SECURE AGENT EXECUTION
// ==========================================
const isDaemon = process.argv.includes("--daemon");

async function performFullSweep() {
  console.log("\n========================================================");
  console.log("   [TIKTOKFLOW] SECURE CLIENT AGENT (DEEP SWEEPER)      ");
  console.log("========================================================");
  console.log(`[+] Server URL    : ${config.serverUrl}`);
  console.log(`[+] Nhan vien     : ${config.memberEmail}`);
  console.log(`[+] Concurrency   : ${config.concurrency} luong ngam song song`);
  console.log(`[+] Che do        : ${config.headless ? "Headless Vo hinh (Bao mat 100%)" : "Hien thi cua so"}`);
  console.log(`[+] Bo nho dem    : Khu tai Media (Tiet kiem 85% bang thong & RAM)`);
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
      const resp = await fetch(
        `${gpmApi.base}/profiles?page=1&per_page=500&page_size=500`,
        { signal: AbortSignal.timeout(8000) }
      );
      const json = await resp.json().catch(() => ({}));
      const rows = normalizeGpmProfileRows(json) || [];
      allowedIds = new Set(rows.map((r) => String(r.id)));
      console.log(`[*] GPM API danh sach: ${allowedIds.size} profile (loc o dia theo API).`);
    } catch (err) {
      console.warn(`[*] Khong doc duoc GPM API list: ${err?.message || err}`);
    }
  }
  const openIds = listOpenProfileIdsFromProcesses(storagePath);
  const profileDirs = diskDirs.filter((e) => {
    if (allowedIds && allowedIds.size) return allowedIds.has(e.name);
    // API offline: only profiles with a live browser process
    return openIds.has(e.name);
  });


  console.log(
    `[*] Tim thay ${diskDirs.length} folder tren o dia; dong bo ${profileDirs.length} profile hop le` +
      (allowedIds ? " (theo GPM API)" : " (chi browser dang mo)")
  );

  const profilesToSync = [];
  for (const p of profileDirs) {
    const fullDir = path.join(storagePath, p.name);
    const handle = findTikTokHandleInProfile(fullDir);
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
      console.log(`   [OK] Dong bo thanh cong: ${syncResult.totalScanned || profilesToSync.length} tai khoan ghi nhan.`);
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
  // Prefer session-confirmed scans; disk handle is only a weak hint for ordering/logging
  const activeTikTokProfiles = profilesToSync.filter((p) => p.tiktokHandle || profilesToSync.length <= 15);
  console.log(`\n[*] Bat dau cao so lieu chuyen sau TikTok Studio (${activeTikTokProfiles.length} profiles)...`);
  console.log("    Qua trinh chay ngam doc lap qua Snapshot, khong sua/xoa du lieu tren o cung.\n");

  let successCount = 0;
  let failCount = 0;

  await pMap(
    activeTikTokProfiles,
    async (p, idx) => {
      if (authBlocked || config.tokenRevoked) {
        failCount++;
        return;
      }

      const label = p.tiktokHandle ? `@${p.tiktokHandle}` : `Profile ${p.id.slice(0, 8)}`;
      console.log(`[${idx + 1}/${activeTikTokProfiles.length}] [SCAN] Dang quet ${label}...`);

      const result = await extractProfileStudio(p.fullDir, p.id, chromePath, p.tiktokHandle);

      if (result.success && result.data) {
        successCount++;
        const d = result.data;
        const activeProgStr = (d.activePrograms && d.activePrograms.length > 0)
          ? d.activePrograms.map((p) => `${p.name}: ${d.currency}${p.revenue !== null && p.revenue !== undefined ? p.revenue : 0}`).join(", ")
          : "Khong co";

        const dailyCount = Array.isArray(d.dailyBreakdown) ? d.dailyBreakdown.length : 0;
        console.log(
          `   [OK] @${d.username}: ${d.followersCount.toLocaleString()} followers | ` +
          `${d.totalViews.toLocaleString()} views | ` +
          `Total: ${d.currency}${d.totalRevenue !== null ? d.totalRevenue : 0} (7d: ${d.currency}${d.revenue7d || 0}, 28d: ${d.currency}${d.revenue28d || 0}, 365d: ${d.currency}${d.revenue365d || 0}) | ` +
          `Shop: ${d.currency}${d.tiktokShopRevenue || 0} | ` +
          `Daily Points: ${dailyCount} days | ` +
          `Active: [${activeProgStr}]`
        );

        const gpmProfileName = d.gpmProfileName || p.name || undefined;
        const gpmGroupName = d.gpmGroupName || p.groupName || undefined;

        // Send Studio Report to Server with Token (session UniqId + gpmProfileId)
        try {
          const reportRes = await fetch(`${config.serverUrl}/api/extension/report`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              ...d,
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
          } else if (!reportRes.ok) {
            console.warn(`   [!] May chu tu choi bao cao @${d.username}: HTTP ${reportRes.status}`);
          }
        } catch (postErr) {
          console.warn(`   [!] Khong the gui bao cao @${d.username} len server:`, postErr.message);
        }
      } else {
        failCount++;
        console.log(`   [!] ${label}: ${result.error || "Khong the lay so lieu"}`);
      }
    },
    config.concurrency || 2
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
    } catch {}

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

async function checkAndRunSchedule(scheduleInfo) {
  if (!scheduleInfo) return;

  // Check for remote sync job from web button (VPS trigger via SyncQueue)
  const incomingJob = scheduleInfo.syncJob || scheduleInfo.syncSignal;
  if (incomingJob?.requestedAt) {
    const sigAt = Number(incomingJob.requestedAt);
    const jobId = incomingJob.id || incomingJob.jobId;
    if (sigAt > lastHandledSignalAt && Date.now() - sigAt < 5 * 60 * 1000) {
      lastHandledSignalAt = sigAt;
      console.log(`\n[*] [SyncQueue] Nhan job dong bo tu Web/VPS (Job: ${jobId || "N/A"})! Bat dau quet ngay...`);

      const authHeaders = {
        "Content-Type": "application/json",
        ...(config.personalToken ? { Authorization: `Bearer ${config.personalToken}` } : {}),
      };

      // 1. Report job started (PROCESSING)
      if (jobId) {
        fetch(`${config.serverUrl}/api/gpm/client-sync`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            action: "start_job",
            jobId,
            machineId: cachedMachineId || undefined,
            machineName: cachedMachineName || os.hostname(),
          }),
        }).catch(() => {});
      }

      // 2. Perform full sweep
      try {
        const stats = await performFullSweep();
        // 3. Report job completed (COMPLETED)
        if (jobId) {
          await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              action: "complete_job",
              jobId,
              successCount: stats?.successCount || 0,
              failCount: stats?.failCount || 0,
              profilesCount: stats?.profilesCount || 0,
              resultSummary: `Quet thanh cong ${stats?.successCount || 0}/${stats?.profilesCount || 0} tai khoan`,
            }),
          }).catch(() => {});
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
          }).catch(() => {});
        }
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
        await performFullSweep();
      }
    } else if (s.repeat === "HOURLY") {
      const h = s.everyCount || 1;
      const key = `${todayStr}_H${now.getHours()}`;
      if (now.getHours() % h === 0 && now.getMinutes() === 0 && lastSweepKey !== key) {
        lastSweepKey = key;
        console.log(`\n[*] [Lich Trinh Server Dinh Ky] Kich hoat quet vet moi ${h} gio...`);
        await performFullSweep();
      }
    } else if (s.repeat === "CUSTOM" && s.intervalMinutes) {
      const m = Number(s.intervalMinutes) || 60;
      const totalMin = now.getHours() * 60 + now.getMinutes();
      const key = `${todayStr}_M${Math.floor(totalMin / m)}`;
      if (totalMin % m === 0 && lastSweepKey !== key) {
        lastSweepKey = key;
        console.log(`\n[*] [Lich Trinh Tuy Bien Server] Kich hoat quet vet moi ${m} phut...`);
        await performFullSweep();
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

  // 1. Quet kiem ke va cao ban dau ngay khi mo may
  console.log("[*] [Khoi Dong Cung Windows] Tien hanh quet ban dau...");
  try {
    await performFullSweep();
  } catch (err) {
    console.warn("[!] Quet ban dau gap loi:", err.message);
  }

  // 2. Lay cau hinh lich tu Server
  let activeSchedule = await fetchServerSchedule();
  if (activeSchedule) {
    console.log(`[*] Lich quet tu Server: ${activeSchedule.scheduleSummary || "Hang ngay luc 18:00"}`);
  }

  // 3. Vong lap kiem tra dinh ky moi 15 giay (nhan tin hieu Sync tu Web/VPS tuc thi)
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
  }, 15000);
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

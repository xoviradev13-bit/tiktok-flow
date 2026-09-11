import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import { fileURLToPath } from "url";
import { chromium } from "playwright-core";

// ==========================================
// 0. MACHINE-WIDE SINGLETON (1 Agent / PC)
// ==========================================
const AGENT_LOCK_PORT = 39741;
const AGENT_LOCK_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "TikTokFlow");
const AGENT_LOCK_FILE = path.join(AGENT_LOCK_DIR, "agent.lock");

let lockServer = null;
let lockHeld = false;

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
    const server = http.createServer((req, res) => {
      const origin = String(req.headers.origin || "");
      const allowOrigin =
        origin.startsWith("chrome-extension://") ||
        origin.startsWith("moz-extension://") ||
        origin === "null"
          ? origin
          : "";
      const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      };
      if (allowOrigin) {
        headers["Access-Control-Allow-Origin"] = allowOrigin;
        headers["Vary"] = "Origin";
      }
      // Only status probe — no secrets
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          ...headers,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, headers);
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }
      res.writeHead(200, headers);
      res.end(
        JSON.stringify({
          ok: true,
          role: "tiktokflow-agent",
          pid: process.pid,
          hostname: os.hostname(),
        })
      );
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
    const res = await fetch(`${config.serverUrl}/api/extension/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: config.pairingCode }),
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
  const res = await fetch(`${config.serverUrl}/api/extension/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.personalToken}`,
    },
    body: JSON.stringify({}),
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
export async function discoverGpmApiBase() {
  const configuredPort = readGpmConfiguredApiPort();
  const ports = [...(configuredPort ? [configuredPort] : []), ...GPM_PORT_CANDIDATES];
  const seen = new Set();
  const bases = [];

  for (const port of ports) {
    if (seen.has(port)) continue;
    seen.add(port);
    for (const ver of GPM_API_VERSIONS) {
      bases.push(`http://127.0.0.1:${port}/api/${ver}`);
    }
  }

  for (const base of bases) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    try {
      const resp = await fetch(`${base}/profiles?page=1&per_page=1&page_size=1`, {
        signal: controller.signal,
      });
      if (resp && resp.ok) {
        const portMatch = base.match(/:(\d+)\//);
        return {
          online: true,
          base,
          port: portMatch ? Number(portMatch[1]) : null,
        };
      }
    } catch { } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    online: false,
    base: null,
    port: configuredPort || 9495,
  };
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

    const chunks = [];

    const historyPath = path.join(defaultDir, "History");
    if (fs.existsSync(historyPath)) {
      try {
        chunks.push(fs.readFileSync(historyPath).toString("latin1"));
      } catch { }
    }

    const levelDbDir = path.join(defaultDir, "Local Storage", "leveldb");
    if (fs.existsSync(levelDbDir)) {
      try {
        for (const f of fs.readdirSync(levelDbDir)) {
          if (!f.endsWith(".log") && !f.endsWith(".ldb")) continue;
          try {
            chunks.push(fs.readFileSync(path.join(levelDbDir, f)).toString("latin1"));
          } catch { }
        }
      } catch { }
    }

    for (const rel of ["Preferences", "Secure Preferences", "Network/Cookies"]) {
      const p = path.join(defaultDir, rel);
      if (!fs.existsSync(p)) continue;
      try {
        const buf = fs.readFileSync(p);
        chunks.push(buf.toString("latin1", 0, Math.min(buf.length, 8 * 1024 * 1024)));
      } catch { }
    }

    return scoreLoggedInHandleFromArtifacts(chunks.join("\n"));
  } catch { }
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `gpm-agent-${profileId}-`));
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
async function extractProfileStudio(profileDir, profileId, chromePath, detectedHandle) {
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

    // Intercept essential user & follower APIs
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
          if (titleEl && viewEl) {
            items.push({
              desc: titleEl.textContent.trim(),
              play_count: viewEl.textContent.trim(),
              like_count: likeEl ? likeEl.textContent.trim() : "0",
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

    // Visit monetization tab if channel has content/views
    let totalRewardsUsd = null;
    let creatorRewardsUsd = null;
    let shopRewardsUsd = null;
    let rpm = null;
    let currency = "$";

    if (totalViews > 0) {
      try {
        await page.goto("https://www.tiktok.com/tiktokstudio/monetization", {
          waitUntil: "domcontentloaded",
          timeout: 8000,
        }).catch(() => { });

        await Promise.race([
          page.waitForSelector('[role="listitem"], [class*="reward-item"], [class*="Card"]', { timeout: 1500 }).catch(() => { }),
          page.waitForTimeout(1000),
        ]);

        const rew = await page.evaluate(() => {
          const parseNum = (str) => {
            if (!str) return null;
            const n = parseFloat(str.replace(/[^0-9.]/g, ""));
            return isNaN(n) ? null : n;
          };
          const items = document.querySelectorAll('[role="listitem"], [class*="reward-item"], [class*="Card"]');
          let tot = null;
          let shop = null;
          let cur = "$";
          items.forEach((it) => {
            const txt = it.textContent || "";
            const val = it.querySelector('[class*="value"]') || it;
            if (val.textContent.includes("£")) cur = "£";
            if (val.textContent.includes("₫")) cur = "₫";
            if (val.textContent.includes("€")) cur = "€";
            if (/tổng|total/i.test(txt) && tot === null) tot = parseNum(val.textContent);
            if (/shop/i.test(txt) && shop === null) shop = parseNum(val.textContent);
          });
          return { tot, shop, cur };
        }).catch(() => ({ tot: null, shop: null, cur: "$" }));

        totalRewardsUsd = rew.tot;
        shopRewardsUsd = rew.shop;
        creatorRewardsUsd = rew.tot;
        currency = rew.cur;
        if (totalRewardsUsd && totalViews > 0) {
          rpm = Number(((totalRewardsUsd / totalViews) * 1000).toFixed(3));
        }
      } catch { }
    }

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
        creatorRewardsUsd,
        tiktokShopRewardsUsd: shopRewardsUsd,
        currency,
        rpm,
        videosList,
        isLoggedIn: true,
        gpmProfileId: profileId,
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

  // 2. Discover all profile folders (strictly profiles with Default dir)
  const allEntries = fs.readdirSync(storagePath, { withFileTypes: true });
  const profileDirs = allEntries.filter(
    (e) => e.isDirectory() && !e.name.startsWith("_") && fs.existsSync(path.join(storagePath, e.name, "Default"))
  );

  console.log(`[*] Tim thay ${profileDirs.length} profile GPM tren o dia.`);

  const profilesToSync = [];
  for (const p of profileDirs) {
    const fullDir = path.join(storagePath, p.name);
    const handle = findTikTokHandleInProfile(fullDir);
    if (handle) {
      console.log(`   [disk] ${p.name.slice(0, 8)}… → @${handle}`);
    } else {
      console.log(`   [disk] ${p.name.slice(0, 8)}… → (chua xac dinh — doi Studio UniqId)`);
    }
    profilesToSync.push({
      id: p.name,
      name: p.name,
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
        // Identity from Authorization Bearer only — omit memberEmail to avoid stale mismatch 403s.
        profiles: profilesToSync.map((p) => ({
          id: p.id,
          name: p.name,
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
        console.log(
          `   [OK] @${d.username}: ${d.followersCount.toLocaleString()} followers | ` +
          `${d.totalViews.toLocaleString()} views | Doanh thu: ${d.totalRevenue !== null ? `${d.currency}${d.totalRevenue}` : "Chua bat"}`
        );

        // Send Studio Report to Server with Token (session UniqId + gpmProfileId)
        try {
          const reportRes = await fetch(`${config.serverUrl}/api/extension/report`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              ...d,
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
}

// ==========================================
// 9. DAEMON MODE (RUN WITH WINDOWS STARTUP & FOLLOW SETTING SCHEDULE)
// ==========================================
async function fetchServerSchedule() {
  try {
    const authHeaders = {
      ...(config.personalToken
        ? { Authorization: `Bearer ${config.personalToken}` }
        : {}),
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

async function checkAndRunSchedule(scheduleInfo) {
  if (!scheduleInfo) return;
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

  // 3. Vong lap kiem tra dinh ky moi 60 giay
  setInterval(async () => {
    try {
      await checkAndRunSchedule(activeSchedule);
    } catch (err) {
      console.warn("[!] Loi kiem tra lich:", err.message);
    }
  }, 60000);

  // 4. Dinh ky 30 phut tu dong dong bo lai lich moi tu Server neu Admin co sua trong /settings
  setInterval(async () => {
    try {
      const refreshed = await fetchServerSchedule();
      if (refreshed) {
        activeSchedule = refreshed;
      }
    } catch { }
  }, 30 * 60 * 1000);
}

// Main entry (strictly guarded against unintended execution during imports)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  (async () => {
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

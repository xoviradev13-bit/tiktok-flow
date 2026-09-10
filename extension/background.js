// TikTokFlow Companion - Background Service Worker
// Coordinates TikTok login verification, GPM fleet sync, alarms, and badge indicators

const DEFAULT_SERVER_URL = "http://localhost:3000";
const GPM_PORT_CANDIDATES = [9495, 19995, 19996, 19994, 8848];
const GPM_API_VERSIONS = ["v1", "v3"];
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown between fleet syncs

/** Probe local GPMLogin API ports; cache the first that responds. */
async function discoverGpmApiBase(force = false) {
  const stored = await chrome.storage.local.get(["gpmApiBase", "gpmApiPort", "gpmApiDiscoveredAt"]);
  const fresh =
    !force &&
    stored.gpmApiBase &&
    stored.gpmApiDiscoveredAt &&
    Date.now() - stored.gpmApiDiscoveredAt < 10 * 60 * 1000;

  async function probe(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      return resp && resp.ok ? resp : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const tryBases = [];
  if (fresh && stored.gpmApiBase) tryBases.push(stored.gpmApiBase);
  for (const port of GPM_PORT_CANDIDATES) {
    for (const ver of GPM_API_VERSIONS) {
      tryBases.push(`http://127.0.0.1:${port}/api/${ver}`);
    }
  }

  const seen = new Set();
  for (const base of tryBases) {
    if (seen.has(base)) continue;
    seen.add(base);
    const resp = await probe(`${base}/profiles?page=1&per_page=1`);
    if (resp) {
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
 * Mark local token as revoked: clear secret, set UI flags, badge AUTH.
 * Prevents config.json from silently re-injecting a dead token on next startup.
 */
async function markTokenRevoked(reason, httpStatus) {
  const message = resolveAuthErrorMessage(reason, httpStatus);

  await chrome.storage.local.set({
    personalToken: "",
    accessToken: "",
    accessExpiresAt: 0,
    refreshToken: "",
    pairingCode: "",
    tokenRevoked: true,
    tokenRevokedReason: message,
    tokenRevokedAt: new Date().toISOString(),
    authRequired: true,
  });
  setBadge("AUTH", "#ef4444");
  console.warn("[TikTokFlow] Token revoked / auth required:", message);
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
async function redeemPairingIfNeeded() {
  const data = await chrome.storage.local.get([
    "serverUrl",
    "pairingCode",
    "personalToken",
    "tokenRevoked",
  ]);
  if (data.tokenRevoked || data.personalToken || !data.pairingCode) return;

  const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, "");
  try {
    const resp = await fetch(`${serverUrl}/api/extension/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: data.pairingCode }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.personalToken) {
      console.warn("[TikTokFlow] Pairing redeem failed:", json.error || resp.status);
      // Pairing failure is not the same as admin revoke — keep message actionable
      await chrome.storage.local.set({
        pairingCode: "",
        tokenRevoked: true,
        tokenRevokedReason:
          json.error ||
          "Mã kích hoạt hết hạn hoặc đã dùng. Tải lại zip mới từ Settings, hoặc dán Personal Token rồi bấm Lưu.",
        tokenRevokedAt: new Date().toISOString(),
        authRequired: true,
      });
      setBadge("AUTH", "#ef4444");
      return;
    }

    const expiresIn = Number(json.expiresIn) || 900;
    const updates = {
      personalToken: json.personalToken,
      accessToken: json.accessToken || "",
      accessExpiresAt: json.accessToken ? Date.now() + expiresIn * 1000 - 30_000 : 0,
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
    console.log("[TikTokFlow] Pairing redeemed successfully.");
  } catch (err) {
    console.warn("[TikTokFlow] Pairing redeem error:", err.message);
  }
}

async function exchangeSessionFromPersonalToken(serverUrl, personalToken) {
  const resp = await fetch(`${serverUrl}/api/extension/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${personalToken}`,
    },
    body: JSON.stringify({}),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: json.error };
  }
  const expiresIn = Number(json.expiresIn) || 900;
  await chrome.storage.local.set({
    accessToken: json.accessToken,
    accessExpiresAt: Date.now() + expiresIn * 1000 - 30_000,
    refreshToken: json.refreshToken,
  });
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
    accessToken: json.accessToken,
    accessExpiresAt: Date.now() + expiresIn * 1000 - 30_000,
    refreshToken: json.refreshToken,
  });
  return { ok: true };
}

/** Ensure a usable access JWT (exchange/refresh). Falls back to personalToken Bearer if session fails. */
async function ensureAccessToken() {
  await redeemPairingIfNeeded();
  const data = await chrome.storage.local.get([
    "serverUrl",
    "personalToken",
    "accessToken",
    "accessExpiresAt",
    "refreshToken",
    "tokenRevoked",
  ]);
  const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, "");

  if (data.tokenRevoked || !data.personalToken) {
    return { ok: false, bearer: null, authRequired: true };
  }

  if (data.accessToken && data.accessExpiresAt && Date.now() < data.accessExpiresAt) {
    return { ok: true, bearer: data.accessToken };
  }

  if (data.refreshToken) {
    const refreshed = await refreshSession(serverUrl, data.refreshToken);
    if (refreshed.ok) {
      const again = await chrome.storage.local.get(["accessToken"]);
      return { ok: true, bearer: again.accessToken };
    }
    if (refreshed.reuseDetected || refreshed.status === 401) {
      // Re-exchange if personalToken still present (detection ≠ lockout)
      const exchanged = await exchangeSessionFromPersonalToken(serverUrl, data.personalToken);
      if (exchanged.ok) {
        const again = await chrome.storage.local.get(["accessToken"]);
        return { ok: true, bearer: again.accessToken };
      }
      if (exchanged.status === 401 || exchanged.status === 403) {
        await markTokenRevoked(exchanged.error, exchanged.status);
        return { ok: false, bearer: null, authRequired: true };
      }
    }
  }

  const exchanged = await exchangeSessionFromPersonalToken(serverUrl, data.personalToken);
  if (exchanged.ok) {
    const again = await chrome.storage.local.get(["accessToken"]);
    return { ok: true, bearer: again.accessToken };
  }
  if (exchanged.status === 401 || exchanged.status === 403) {
    await markTokenRevoked(exchanged.error, exchanged.status);
    return { ok: false, bearer: null, authRequired: true };
  }

  // Last resort: legacy personalToken Bearer until sunset
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
    await chrome.storage.local.set({ accessExpiresAt: 0 });
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
  } catch (err) {}
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

/**
 * Resolve GPM profile for a TikTok username:
 * 1) cached binding for this username
 * 2) unique @handle match in GPM profile name/note
 */
async function resolveGpmProfileForUsername(username) {
  const clean = String(username || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  if (!clean) return null;

  const cached = await chrome.storage.local.get([
    "linkedGpmProfileId",
    "linkedGpmProfileName",
    "linkedGpmUsername",
  ]);
  if (
    cached.linkedGpmProfileId &&
    cached.linkedGpmUsername &&
    String(cached.linkedGpmUsername).toLowerCase() === clean
  ) {
    return {
      id: cached.linkedGpmProfileId,
      name: cached.linkedGpmProfileName || null,
      matchedVia: "cache",
    };
  }

  try {
    const rawProfiles = await fetchLocalGpmProfiles();
    const hits = [];
    for (const p of rawProfiles) {
      if (!p?.id) continue;
      const labelHandle = extractHandleFromLabel(p.name, p.raw_name, p.note);
      if (labelHandle && labelHandle === clean) {
        hits.push({
          id: p.id,
          name: p.name || `Profile ${p.id}`,
          matchedVia: "label",
        });
      }
    }
    const unique = new Map();
    for (const hit of hits) unique.set(hit.id, hit);
    if (unique.size === 1) return [...unique.values()][0];
  } catch (err) {
    console.warn("[TikTokFlow] GPM label match failed:", err?.message || err);
  }

  return null;
}

async function reportTikTokStatus(payload) {
  try {
    const config = await getConfig();
    if (!config.serverUrl) return;

    // Viewing someone else's public profile must never overwrite stored metrics / UI
    if (payload.isOtherProfilePage) {
      console.log(
        `[TikTokFlow] Skip metric report — viewing public @${payload.viewedProfile}, keeping logged-in @${payload.username}`
      );
      await chrome.storage.local.set({
        reportSyncStatus: "idle",
        reportSyncMessage: `Đang xem trang công khai @${payload.viewedProfile} — số liệu tài khoản của bạn không đổi.`,
        lastPageContext: {
          type: "other_profile",
          viewedProfile: payload.viewedProfile,
          at: new Date().toISOString(),
        },
      });
      return;
    }

    const username = payload.username || "";
    const gpmMatch = await resolveGpmProfileForUsername(username);

    const body = {
      username,
      nickname: payload.nickname || "",
      avatarUrl: payload.avatarUrl || "",
      followersCount: payload.followersCount || payload.totalFollowers || 0,
      followingCount: payload.followingCount || payload.totalFollowing || 0,
      totalLikes: payload.totalLikes || 0,
      videoCount: payload.totalVideos || payload.videoCount || 0,
      totalRevenue: payload.totalRevenue || 0,
      currency: payload.currency || "$",
      isLoggedIn: payload.isLoggedIn === true,
      memberEmail: config.userEmail || undefined,
      gpmProfileId: gpmMatch?.id || undefined,
      gpmProfileName: gpmMatch?.name || undefined,
      metricsSource: payload.metricsSource || (payload.isStudio ? "studio" : "page"),
      isStudio: !!payload.isStudio,
      isOwnProfilePage: !!payload.isOwnProfilePage,

      // 1. Views Breakdown
      viewsToday: payload.viewsToday || 0,
      views7d: payload.views7d || 0,
      views14d: payload.views14d || 0,
      views30d: payload.views30d || 0,
      totalViews: payload.totalViews || 0,

      // 2. Videos Breakdown
      videosToday: payload.videosToday || 0,
      videos7d: payload.videos7d || 0,
      videos14d: payload.videos14d || 0,
      videos30d: payload.videos30d || 0,
      totalVideos: payload.totalVideos || payload.videoCount || 0,

      // 3. Channel Info & Key Metrics
      totalFollowers: payload.totalFollowers || payload.followersCount || 0,
      totalFollowing: payload.totalFollowing || payload.followingCount || 0,
      profileViews: payload.profileViews || 0,
      commentsCount: payload.commentsCount || 0,
      sharesCount: payload.sharesCount || 0,

      // 4. Monetization & Economics Breakdown
      rpm: payload.rpm || 0,
      country: payload.country || "US",
      liveRewardsRevenue: payload.liveRewardsRevenue || 0,
      tiktokShopRevenue: payload.tiktokShopRevenue || 0,
      creatorRewardsRevenue: payload.creatorRewardsRevenue || 0,

      // 5. Per-Video & Top-Videos Data
      videosList: payload.videosList || [],
      topVideos: payload.topVideos || {},
    };

    if (!config.personalToken) {
      console.warn("[TikTokFlow] Skipping report — no personalToken configured");
      await chrome.storage.local.set({
        reportSyncStatus: "error",
        reportSyncMessage: "Chưa có Personal Token.",
      });
      return;
    }

    await chrome.storage.local.set({
      reportSyncStatus: "syncing",
      reportSyncMessage: `Đang đồng bộ @${body.username}…`,
      reportSyncAt: Date.now(),
    });

    console.log("[TikTokFlow] Reporting account status to server:", body.username, {
      isLoggedIn: body.isLoggedIn,
      gpmProfileId: body.gpmProfileId || null,
      gpmMatchedVia: gpmMatch?.matchedVia || null,
      metricsSource: body.metricsSource,
      revenue: body.totalRevenue,
      viewsToday: body.viewsToday,
      totalViews: body.totalViews,
      videosToday: body.videosToday,
      rpm: body.rpm,
    });

    const { resp, authRequired, error } = await authorizedFetch(
      `${config.serverUrl}/api/extension/report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (authRequired || !resp) {
      console.warn("[TikTokFlow] Report blocked — auth required:", error);
      await chrome.storage.local.set({
        reportSyncStatus: "error",
        reportSyncMessage: error || "Cần xác thực lại.",
      });
      return;
    }

    if (resp.status === 401 || resp.status === 403) {
      const errData = await resp.json().catch(() => ({}));
      await markTokenRevoked(errData.error, resp.status);
      await chrome.storage.local.set({
        reportSyncStatus: "error",
        reportSyncMessage: errData.error || "Token bị thu hồi.",
      });
      return;
    }

    if (resp.ok) {
      if (body.isLoggedIn) {
        setBadge("OK", "#10b981"); // Emerald green
      } else {
        setBadge("OFF", "#6b7280"); // Gray
      }

      const result = await resp.json().catch(() => ({}));
      const linkedId = result?.account?.gpmProfileId || body.gpmProfileId || null;
      const cleanUser = String(body.username || "")
        .replace(/^@/, "")
        .trim()
        .toLowerCase();

      const prevStore = await chrome.storage.local.get(["latestAccount"]);
      const prev = prevStore.latestAccount || {};
      const trustZeros = body.isStudio || body.isOwnProfilePage;
      const pickNum = (key, incoming) => {
        const next = Number(incoming);
        const old = Number(prev[key] || 0);
        if (!Number.isFinite(next)) return old;
        if (!trustZeros && next === 0 && old > 0) return old;
        return next;
      };

      const merged = {
        ...prev,
        ...body,
        username: body.username || prev.username,
        nickname: body.nickname || prev.nickname || "",
        avatarUrl: body.avatarUrl || prev.avatarUrl || "",
        followersCount: pickNum("followersCount", body.followersCount),
        videoCount: pickNum("videoCount", body.videoCount),
        totalVideos: pickNum("totalVideos", body.totalVideos),
        totalViews: pickNum("totalViews", body.totalViews),
        totalRevenue: pickNum("totalRevenue", body.totalRevenue),
        gpmProfileId: linkedId || prev.gpmProfileId || null,
        lastReportedAt: new Date().toISOString(),
        metricsSource: body.metricsSource,
      };

      const storageUpdate = {
        latestAccount: merged,
        reportSyncStatus: "ok",
        reportSyncMessage: body.isStudio
          ? `Đã đồng bộ từ TikTok Studio · @${cleanUser}`
          : `Đã đồng bộ · @${cleanUser}`,
        reportSyncAt: Date.now(),
        hasStudioData: !!(body.isStudio || prev.hasStudioData),
      };
      if (body.isStudio) {
        storageUpdate.hasStudioData = true;
        merged.hasStudioData = true;
        storageUpdate.latestAccount = merged;
      }

      if (linkedId && cleanUser) {
        storageUpdate.linkedGpmProfileId = linkedId;
        storageUpdate.linkedGpmProfileName =
          body.gpmProfileName || result?.account?.gpmMatchedVia || "";
        storageUpdate.linkedGpmUsername = cleanUser;
      }
      await chrome.storage.local.set(storageUpdate);
    } else {
      const errData = await resp.json().catch(() => ({}));
      await chrome.storage.local.set({
        reportSyncStatus: "error",
        reportSyncMessage: errData.error || `Lỗi HTTP ${resp.status}`,
      });
    }
  } catch (err) {
    console.warn("[TikTokFlow] Failed to report account status:", err.message);
    await chrome.storage.local.set({
      reportSyncStatus: "error",
      reportSyncMessage: err.message || "Lỗi đồng bộ",
    });
  }
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

    const payloadProfiles = rawProfiles.map((p) => {
      let handle = null;
      const combined = `${p.name || ""} ${p.raw_name || ""} ${p.note || ""}`;
      const m = combined.match(/@([a-zA-Z0-9_.-]{3,30})/);
      if (m) handle = m[1].toLowerCase();

      return {
        id: p.id,
        name: p.name || `Profile ${p.id}`,
        raw_name: p.raw_name,
        group_id: p.group_id || p.group_name || "GPM Fleet",
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

    if (!cookie || !cookie.value) {
      setBadge("OFF", "#6b7280");
      return false;
    }
    setBadge("OK", "#10b981");
    return true;
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
    const resp = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeoutId);

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

// Lifecycle Events
// Startup must stay sequential: initFromConfigFile reads tokenRevoked before any
// sync/report can write it. Do not Promise.all() these without re-checking that flag.
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[TikTokFlow] Extension installed.");
  await clearStaleEmailMismatchRevoke();
  await initFromConfigFile();
  await redeemPairingIfNeeded();
  setupSyncAlarm();
  checkTikTokCookie();
  syncGpmFleet(false);
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[TikTokFlow] Browser started.");
  await clearStaleEmailMismatchRevoke();
  await initFromConfigFile();
  await redeemPairingIfNeeded();
  setupSyncAlarm();
  checkTikTokCookie();
  syncGpmFleet(false);
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

chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.domain.includes("tiktok.com") && changeInfo.cookie.name === "sessionid") {
    if (changeInfo.removed) {
      setBadge("OFF", "#6b7280");
      getConfig().then((cfg) => {
        if (cfg.latestAccount?.username) {
          reportTikTokStatus({
            username: cfg.latestAccount.username,
            isLoggedIn: false,
          });
        }
      });
    } else {
      setBadge("OK", "#10b981");
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TIKTOK_STATUS_DETECTED") {
    reportTikTokStatus(message.data);
    sendResponse({ received: true });
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
    redeemPairingIfNeeded().then(() => {
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
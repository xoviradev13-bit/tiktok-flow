// TikTokFlow Companion - Background Service Worker
// Coordinates TikTok login verification, GPM fleet sync, alarms, and badge indicators

const DEFAULT_SERVER_URL = "http://localhost:3000";
const GPM_LOCAL_API = "http://127.0.0.1:9495/api/v3/profiles?page=1&per_page=300";
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown between fleet syncs

// 1. Initialize from bundled config.json (Zero-Typing Onboarding)
async function initFromConfigFile() {
  try {
    const url = chrome.runtime.getURL("config.json");
    const resp = await fetch(url);
    if (resp.ok) {
      const fileConfig = await resp.json();
      const updates = {};
      if (fileConfig.serverUrl) updates.serverUrl = fileConfig.serverUrl;
      if (fileConfig.personalToken) updates.personalToken = fileConfig.personalToken;
      if (fileConfig.memberName) updates.memberName = fileConfig.memberName;
      if (fileConfig.userEmail) updates.userEmail = fileConfig.userEmail;

      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
        console.log("[TikTokFlow] Machine-wide config loaded:", updates.memberName);
      }
    }
  } catch (err) {
    console.warn("[TikTokFlow] Could not read config.json:", err);
  }
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
async function reportTikTokStatus(payload) {
  try {
    const config = await getConfig();
    if (!config.serverUrl) return;

    const body = {
      username: payload.username || "",
      nickname: payload.nickname || "",
      avatarUrl: payload.avatarUrl || "",
      followersCount: payload.followersCount || payload.totalFollowers || 0,
      followingCount: payload.followingCount || payload.totalFollowing || 0,
      totalLikes: payload.totalLikes || 0,
      videoCount: payload.totalVideos || payload.videoCount || 0,
      totalRevenue: payload.totalRevenue || 0,
      currency: payload.currency || "$",
      isLoggedIn: payload.isLoggedIn === true,
      personalToken: config.personalToken || undefined,
      memberEmail: config.userEmail || undefined,

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

    console.log("[TikTokFlow] Reporting account status to server:", body.username, {
      isLoggedIn: body.isLoggedIn,
      revenue: body.totalRevenue,
      viewsToday: body.viewsToday,
      totalViews: body.totalViews,
      videosToday: body.videosToday,
      rpm: body.rpm,
    });

    const resp = await fetch(`${config.serverUrl}/api/extension/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      if (body.isLoggedIn) {
        setBadge("OK", "#10b981"); // Emerald green
      } else {
        setBadge("OFF", "#6b7280"); // Gray
      }

      await chrome.storage.local.set({
        latestAccount: {
          ...body,
          lastReportedAt: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn("[TikTokFlow] Failed to report account status:", err.message);
  }
}

// 5. Discover & Sync GPM Fleet via Local GPMLogin API (Supports v1 and v3)
async function syncGpmFleet(force = false) {
  try {
    const config = await getConfig();
    const now = Date.now();

    const stored = await chrome.storage.local.get(["serverIntervalMinutes"]);
    const currentIntervalMin = stored.serverIntervalMinutes || 30;
    const cooldownMs = Math.min(SYNC_COOLDOWN_MS, currentIntervalMin * 60 * 1000 * 0.8);

    if (!force && now - config.lastFleetSyncTime < cooldownMs) {
      console.log("[TikTokFlow] GPM Fleet sync in cooldown. Skipping.");
      return { skipped: true, reason: "Cooldown active" };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    // GPMLogin v5.0.8+ uses /api/v1/profiles, earlier versions use /api/v3/profiles
    let gpmResp = await fetch("http://127.0.0.1:9495/api/v1/profiles?page=1&per_page=300", {
      signal: controller.signal,
    }).catch(() => null);

    if (!gpmResp || !gpmResp.ok) {
      gpmResp = await fetch("http://127.0.0.1:9495/api/v3/profiles?page=1&per_page=300", {
        signal: controller.signal,
      }).catch(() => null);
    }
    clearTimeout(timeoutId);

    if (!gpmResp || !gpmResp.ok) {
      console.log("[TikTokFlow] Local GPMLogin API (localhost:9495) is offline.");
      return { skipped: true, reason: "GPMLogin offline" };
    }

    const gpmData = await gpmResp.json();
    let rawProfiles = [];
    if (gpmData && gpmData.data) {
      if (Array.isArray(gpmData.data)) {
        rawProfiles = gpmData.data;
      } else if (Array.isArray(gpmData.data.data)) {
        rawProfiles = gpmData.data.data;
      }
    } else if (Array.isArray(gpmData)) {
      rawProfiles = gpmData;
    }

    if (!Array.isArray(rawProfiles) || rawProfiles.length === 0) {
      return { success: true, count: 0 };
    }

    console.log(`[TikTokFlow] Found ${rawProfiles.length} GPM profiles on local machine. Syncing...`);

    const payloadProfiles = rawProfiles.map((p) => {
      let handle = null;
      const combined = `${p.name || ""} ${p.raw_name || ""}`;
      const m = combined.match(/@([a-zA-Z0-9_.-]{3,30})/);
      if (m) handle = m[1];

      return {
        id: p.id,
        name: p.name || `Profile ${p.id}`,
        raw_name: p.raw_name,
        group_id: p.group_id || p.group_name || "GPM Fleet",
        tiktokHandle: handle,
      };
    });

    const syncResp = await fetch(`${config.serverUrl}/api/gpm/client-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userEmail: config.userEmail || config.personalToken || "gpm_client",
        profiles: payloadProfiles,
      }),
    });

    if (syncResp.ok) {
      const syncResult = await syncResp.json();
      await chrome.storage.local.set({
        lastFleetSyncTime: now,
        gpmProfileCount: rawProfiles.length,
      });
      console.log("[TikTokFlow] GPM Fleet sync completed successfully:", syncResult);
      return { success: true, count: rawProfiles.length, result: syncResult };
    }
  } catch (err) {
    console.warn("[TikTokFlow] Error during GPM Fleet sync:", err.message);
    return { success: false, error: err.message };
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
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[TikTokFlow] Extension installed.");
  await initFromConfigFile();
  setupSyncAlarm();
  checkTikTokCookie();
  syncGpmFleet(false);
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[TikTokFlow] Browser started.");
  await initFromConfigFile();
  setupSyncAlarm();
  checkTikTokCookie();
  syncGpmFleet(false);
});

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

  if (message.type === "CHECK_COOKIES") {
    checkTikTokCookie().then((isLoggedIn) => {
      sendResponse({ isLoggedIn });
    });
    return true;
  }

  if (message.type === "REFRESH_SCHEDULE") {
    setupSyncAlarm().then(() => {
      chrome.storage.local.get(["serverIntervalMinutes", "serverAutoEnabled"], (data) => {
        sendResponse(data);
      });
    });
    return true;
  }
});

import { chromium } from "playwright";
import { gpmClient } from "../src/lib/gpm-api";

async function testLiveGpm() {
  const profileId = "80d8f999-e7f6-4f06-bb33-15896a70b332";
  console.log(`[1] Starting/connecting to GPM profile ${profileId} via GPM API...`);

  const t0 = Date.now();
  const startResult = await gpmClient.startProfile(profileId, { skipProxyCheck: true });
  console.log("  GPM start response:", {
    profile_id: startResult?.profile_id,
    remote_debugging_port: startResult?.remote_debugging_port,
    websocket_debugging_url: startResult?.websocket_debugging_url,
    process_id: startResult?.addition_info?.process_id,
    profile_name: startResult?.addition_info?.profile_name,
  });

  if (!startResult?.remote_debugging_port) {
    throw new Error("Failed to get remote debugging port from GPM API");
  }

  const endpoint = startResult.websocket_debugging_url || `http://127.0.0.1:${startResult.remote_debugging_port}`;
  console.log(`[2] Connecting Playwright via CDP endpoint: ${endpoint} ...`);

  const browser = await chromium.connectOverCDP(endpoint);
  const contexts = browser.contexts();
  const context = contexts[0] || (await browser.newContext());
  const pages = context.pages();

  console.log(`  Connected! Contexts: ${contexts.length}, Open pages: ${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    console.log(`    Tab ${i + 1}: ${pages[i].url()}`);
  }

  // Find or create Studio page
  let studioPage = pages.find(p => p.url().includes("tiktok.com"));
  if (!studioPage) {
    console.log("[3] Navigating to https://www.tiktok.com/tiktokstudio ...");
    studioPage = await context.newPage();
    await studioPage.goto("https://www.tiktok.com/tiktokstudio", { waitUntil: "domcontentloaded", timeout: 30000 });
  } else {
    console.log(`[3] Using existing TikTok tab: ${studioPage.url()}`);
  }

  console.log("[4] Checking session cookies and login state...");
  const cookies = await context.cookies("https://www.tiktok.com");
  const sessionCookie = cookies.find(c => c.name === "sessionid" || c.name === "sid_tt" || c.name === "sessionid_ss");
  console.log("  Session cookie present:", !!sessionCookie?.value, "Cookie name:", sessionCookie?.name);

  // Performance measurement
  const tExtractStart = Date.now();

  console.log("[5] Running extraction for all 4 metric groups...");
  const extracted = await studioPage.evaluate(async () => {
    function parseNum(str) {
      if (!str) return 0;
      const clean = String(str).trim();
      if (clean.endsWith("M") || clean.endsWith("m")) return Math.round(parseFloat(clean) * 1000000);
      if (clean.endsWith("K") || clean.endsWith("k")) return Math.round(parseFloat(clean) * 1000);
      if (clean.endsWith("B") || clean.endsWith("b")) return Math.round(parseFloat(clean) * 1000000000);
      return parseInt(clean.replace(/[^0-9]/g, ""), 10) || 0;
    }

    function parseMoney(str) {
      if (!str) return 0;
      const clean = String(str).trim().replace(/[^0-9.]/g, "");
      return parseFloat(clean) || 0;
    }

    function detectCurrency(text) {
      if (!text) return "$";
      if (text.includes("£")) return "£";
      if (text.includes("€")) return "€";
      if (text.includes("₫") || text.toLowerCase().includes("vnd")) return "₫";
      return "$";
    }

    function detectCountryFromCurrency(currency) {
      if (currency === "£") return "UK";
      if (currency === "€") return "DE";
      if (currency === "₫") return "VN";
      return "US";
    }

    // 1. Resolve Handle
    let handle = null;
    const pathMatch = window.location.pathname.match(/^\/@([a-zA-Z0-9_.-]+)/);
    if (pathMatch) handle = pathMatch[1];

    if (!handle) {
      const scriptTag = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
      if (scriptTag?.textContent) {
        try {
          const json = JSON.parse(scriptTag.textContent);
          const scope = json["__DEFAULT_SCOPE__"] || {};
          handle = scope["webapp.user-detail"]?.userInfo?.user?.uniqueId || scope["webapp.app-context"]?.user?.uniqueId;
        } catch (e) {}
      }
    }

    if (!handle) {
      const studioUserEl = document.querySelector('[data-e2e="user-avatar"], [class*="avatar"] img, [class*="userName"]');
      if (studioUserEl) {
        const parent = studioUserEl.closest("header, [class*='header'], [class*='nav']") || studioUserEl.parentElement;
        const text = parent?.innerText || "";
        const m = text.match(/@([a-zA-Z0-9_.-]{3,30})/);
        if (m) handle = m[1];
      }
    }

    if (!handle) {
      try {
        const res = await fetch("https://www.tiktok.com/passport/web/account/info/?app_id=1233", { credentials: "include" });
        if (res.ok) {
          const info = await res.json();
          handle = info.data?.username || info.data?.screen_name;
        }
      } catch (e) {}
    }

    // DOM Metric Matcher (multi-language EN + VI)
    function findDomMetric(labelVariants) {
      const all = Array.from(document.querySelectorAll("*"));
      const lowerVariants = labelVariants.map(v => v.toLowerCase());
      for (const el of all) {
        if (el.children.length === 0 && el.textContent) {
          const txt = el.textContent.trim().toLowerCase();
          if (lowerVariants.includes(txt)) {
            const parent = el.parentElement;
            if (parent) {
              const lines = parent.innerText.split("\n").map(l => l.trim()).filter(Boolean);
              const idx = lines.findIndex(l => lowerVariants.includes(l.toLowerCase()));
              if (idx !== -1) {
                if (lines[idx + 1] && /^[0-9.,KMBkmb$£€₫]/.test(lines[idx + 1])) return lines[idx + 1];
                if (lines[idx - 1] && /^[0-9.,KMBkmb$£€₫]/.test(lines[idx - 1])) return lines[idx - 1];
              }
            }
          }
        }
      }
      return "";
    }

    const revenueLabels = [
      "est. rewards", "estimated rewards", "ước tính phần thưởng",
      "phần thưởng ước tính", "ước tính doanh thu", "doanh thu ước tính",
      "thu nhập ước tính", "phần thưởng", "rewards"
    ];
    const viewsLabels = ["video views", "views", "lượt xem video", "lượt xem", "số lượt xem"];
    const followersLabels = ["followers", "follower", "net followers", "người theo dõi"];
    const likesLabels = ["likes", "lượt thích", "thích"];

    const rawRevenue = findDomMetric(revenueLabels);
    const rawViews = findDomMetric(viewsLabels);
    const rawFollowers = findDomMetric(followersLabels);
    const rawLikes = findDomMetric(likesLabels);

    const currency = detectCurrency(rawRevenue);
    const country = detectCountryFromCurrency(currency);

    const metrics = {
      username: handle || "unknown",
      nickname: "",
      followersCount: parseNum(rawFollowers),
      totalLikes: parseNum(rawLikes),
      totalRevenue: parseMoney(rawRevenue),
      totalViews: parseNum(rawViews),
      currency,
      country,
      viewsToday: 0,
      views7d: 0,
      views14d: 0,
      views30d: 0,
      videosToday: 0,
      videos7d: 0,
      videos14d: 0,
      videos30d: 0,
      totalVideos: 0,
      rpm: 0,
    };

    // Fast API overview calls
    try {
      const [r1, r7, r14, r30, rItems] = await Promise.all([
        fetch("/api/creator/overview/?type=fixed&pastDay=1", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/creator/overview/?type=fixed&pastDay=7", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/creator/overview/?type=fixed&pastDay=14", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/creator/overview/?type=fixed&pastDay=28", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/creator/item/list/?count=50", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      if (r1) metrics.viewsToday = r1.video_views || r1.views || r1.data?.video_views || 0;
      if (r7) metrics.views7d = r7.video_views || r7.views || r7.data?.video_views || 0;
      if (r14) metrics.views14d = r14.video_views || r14.views || r14.data?.video_views || 0;
      if (r30) metrics.views30d = r30.video_views || r30.views || r30.data?.video_views || 0;

      if (rItems) {
        const items = rItems.itemList || rItems.items || rItems.data?.itemList || [];
        if (Array.isArray(items)) {
          metrics.totalVideos = items.length;
          const nowSec = Math.floor(Date.now() / 1000);
          for (const item of items) {
            const age = nowSec - (item.createTime || item.create_time || 0);
            if (age <= 86400) metrics.videosToday++;
            if (age <= 7 * 86400) metrics.videos7d++;
            if (age <= 14 * 86400) metrics.videos14d++;
            if (age <= 30 * 86400) metrics.videos30d++;
          }
        }
      }
    } catch (e) {}

    if (metrics.totalViews > 0 && metrics.totalRevenue > 0) {
      metrics.rpm = Number((metrics.totalRevenue / (metrics.totalViews / 1000)).toFixed(3));
    }

    return {
      metrics,
      domFound: {
        rawRevenue,
        rawViews,
        rawFollowers,
        rawLikes,
      },
      pageUrl: window.location.href,
      pageTitle: document.title,
    };
  });

  const extractElapsedMs = Date.now() - tExtractStart;
  const totalElapsedMs = Date.now() - t0;

  console.log("\n=======================================================");
  console.log("             EXTRACTION RESULTS & PERFORMANCE           ");
  console.log("=======================================================");
  console.log(`Page URL:    ${extracted.pageUrl}`);
  console.log(`Page Title:  ${extracted.pageTitle}`);
  console.log(`Extract Time: ${extractElapsedMs}ms (Total roundtrip: ${totalElapsedMs}ms)`);
  console.log("DOM Card Matches:", extracted.domFound);
  console.log("\n[📌 4 METRIC GROUPS EXTRACTED]:");
  console.log("1. Views Breakdown:", {
    viewsToday: extracted.metrics.viewsToday,
    views7d: extracted.metrics.views7d,
    views14d: extracted.metrics.views14d,
    views30d: extracted.metrics.views30d,
    totalViews: extracted.metrics.totalViews,
  });
  console.log("2. Videos Breakdown:", {
    videosToday: extracted.metrics.videosToday,
    videos7d: extracted.metrics.videos7d,
    videos14d: extracted.metrics.videos14d,
    videos30d: extracted.metrics.videos30d,
    totalVideos: extracted.metrics.totalVideos,
  });
  console.log("3. Channel & Engagement:", {
    username: extracted.metrics.username,
    followers: extracted.metrics.followersCount,
    likes: extracted.metrics.totalLikes,
  });
  console.log("4. Monetization & Economics:", {
    totalRevenue: extracted.metrics.totalRevenue,
    rpm: extracted.metrics.rpm,
    currency: extracted.metrics.currency,
    country: extracted.metrics.country,
  });

  // Test Server Ingestion
  console.log("\n[6] Testing Server Ingestion at POST http://localhost:3000/api/extension/report ...");
  const payload = {
    ...extracted.metrics,
    isLoggedIn: true,
    gpmProfileId: profileId,
    gpmProfileName: "Profile 3359",
  };

  const reportRes = await fetch("http://localhost:3000/api/extension/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  console.log("  Report response status:", reportRes.status);
  const reportData = await reportRes.json();
  console.log("  Report response body:", JSON.stringify(reportData, null, 2));

  console.log("\n[✓] Disconnecting CDP (leaving real browser untouched)...");
  await browser.close();
}

testLiveGpm().catch(console.error);

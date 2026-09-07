import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";
import { getChromeExecutablePath, getGpmStoragePath } from "../src/lib/tiktok-extractor";

export function buildTikTokStudioCustomUrl(startDateStr: string = "2020-01-01", endDateStr?: string): string {
  const start = new Date(startDateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date();

  const formatUtc = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}/${m}/${day} 00:00:00`;
  };

  const payload = {
    type: "custom",
    dateRange: {
      start: start.getTime(),
      end: end.getTime(),
    },
    UTCDateRange: {
      from: formatUtc(start),
      to: formatUtc(end),
    },
  };

  return `https://www.tiktok.com/tiktokstudio?dateRange=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function testStudioExtractor() {
  const storagePath = getGpmStoragePath();
  const dirs = fs.readdirSync(storagePath).filter(d => {
    return fs.existsSync(path.join(storagePath, d, "Default"));
  });

  if (dirs.length === 0) {
    console.log("No GPM profile directories found to test.");
    return;
  }

  const profileId = dirs[0];
  const sourceProfile = path.join(storagePath, profileId);
  const tempProfile = path.join(os.tmpdir(), "gpm_test_studio_" + Date.now());

  console.log(`📂 Using profile ${profileId}, cloning to ${tempProfile}`);
  fs.mkdirSync(path.join(tempProfile, "Default"), { recursive: true });

  const filesToCopy = [
    "Local State",
    "Default/Preferences",
    "Default/Secure Preferences",
    "Default/Network",
    "Default/Local Storage",
    "Default/Sessions",
    "Default/Cookies",
  ];

  for (const item of filesToCopy) {
    const src = path.join(sourceProfile, item);
    const dst = path.join(tempProfile, item);
    try {
      if (fs.existsSync(src)) {
        fs.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
      }
    } catch (e: any) {}
  }

  const chromePath = getChromeExecutablePath();
  let context;
  try {
    context = await chromium.launchPersistentContext(tempProfile, {
      executablePath: chromePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--password-store=basic",
      ],
      viewport: { width: 1440, height: 900 },
    });

    const page = context.pages()[0] || (await context.newPage());

    // 0. Warm-up navigation to complete SSO handshake for TikTok Studio
    console.log("🔥 Warm-up: Navigating to https://www.tiktok.com/ ...");
    await page.goto("https://www.tiktok.com/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 1. Visit custom date URL (from 2020 to today)
    const customUrl = buildTikTokStudioCustomUrl("2020-01-01");
    console.log("🚀 Step 1: Navigating to Studio Dashboard (Lifetime):", customUrl);
    await page.goto(customUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
    await page.waitForTimeout(6000);

    const studioMetrics = await page.evaluate(`(() => {
      function parseNum(t) {
        if (!t) return 0;
        var clean = t.trim();
        if (clean.endsWith("M") || clean.endsWith("m")) return Math.round(parseFloat(clean) * 1000000);
        if (clean.endsWith("K") || clean.endsWith("k")) return Math.round(parseFloat(clean) * 1000);
        return parseInt(clean.replace(/[^0-9]/g, ""), 10) || 0;
      }

      function parseMoney(t) {
        if (!t) return 0;
        var clean = t.trim().replace(/[^0-9.]/g, "");
        return parseFloat(clean) || 0;
      }

      function findMetric(label) {
        var all = Array.from(document.querySelectorAll("*"));
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (el.children.length === 0 && el.textContent && el.textContent.trim().toLowerCase() === label.toLowerCase()) {
            var parent = el.parentElement;
            if (parent) {
              var lines = parent.innerText.split("\\n").map(function(l) { return l.trim(); }).filter(Boolean);
              var idx = lines.findIndex(function(l) { return l.toLowerCase() === label.toLowerCase(); });
              if (idx !== -1) {
                if (lines[idx + 1] && /^[0-9.,KMBkmb$£€₫]/.test(lines[idx + 1])) return lines[idx + 1];
                if (lines[idx - 1] && /^[0-9.,KMBkmb$£€₫]/.test(lines[idx - 1])) return lines[idx - 1];
              }
            }
          }
        }
        return "";
      }

      var bodyText = document.body ? document.body.innerText : "";
      var likesMatch = bodyText.match(/Likes\\s*([0-9.KMBkmb]+)/i) || bodyText.match(/([0-9.KMBkmb]+)\\s*Likes/i);
      var followersMatch = bodyText.match(/Followers\\s*([0-9.KMBkmb]+)/i) || bodyText.match(/([0-9.KMBkmb]+)\\s*Followers/i);
      var followingMatch = bodyText.match(/Following\\s*([0-9.KMBkmb]+)/i) || bodyText.match(/([0-9.KMBkmb]+)\\s*Following/i);

      var viewsRaw = findMetric("Video views");
      var rewardsRaw = findMetric("Est. rewards");
      var profileViewsRaw = findMetric("Profile views");

      var currency = "$";
      if (rewardsRaw.indexOf("£") !== -1) currency = "£";
      else if (rewardsRaw.indexOf("€") !== -1) currency = "€";
      else if (rewardsRaw.indexOf("₫") !== -1 || rewardsRaw.indexOf("VND") !== -1) currency = "₫";

      return {
        isLoggedIn: !/login|passport/i.test(location.href),
        url: location.href,
        likes: parseNum(likesMatch ? likesMatch[1] : ""),
        followers: parseNum(followersMatch ? followersMatch[1] : ""),
        following: parseNum(followingMatch ? followingMatch[1] : ""),
        totalViews: parseNum(viewsRaw),
        totalRewards: parseMoney(rewardsRaw),
        currency: currency,
        rawViewsText: viewsRaw,
        rawRewardsText: rewardsRaw,
        rawProfileViewsText: profileViewsRaw,
        bodySnippet: bodyText.substring(0, 400),
      };
    })()`);

    console.log("📊 Studio Dashboard Result (Lifetime):", JSON.stringify(studioMetrics, null, 2));

    // 2. Visit 7 days
    console.log("🚀 Step 2: Navigating to 7 Days metric...");
    await page.goto("https://www.tiktok.com/tiktokstudio?dateRange=%7B%22type%22%3A%22fixed%22%2C%22pastDay%22%3A7%7D", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(3000);
    const views7dRaw = await page.evaluate(`(() => {
      var all = Array.from(document.querySelectorAll("*"));
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.children.length === 0 && el.textContent && el.textContent.trim().toLowerCase() === "video views") {
          var parent = el.parentElement;
          if (parent) {
            var lines = parent.innerText.split("\\n").map(function(l) { return l.trim(); }).filter(Boolean);
            var idx = lines.findIndex(function(l) { return l.toLowerCase() === "video views"; });
            if (idx !== -1 && lines[idx + 1]) return lines[idx + 1];
            if (idx !== -1 && lines[idx - 1]) return lines[idx - 1];
          }
        }
      }
      return "";
    })()`);
    console.log("7 Days Views Raw:", views7dRaw);

    // 3. Visit 28 days
    console.log("🚀 Step 3: Navigating to 28/30 Days metric...");
    await page.goto("https://www.tiktok.com/tiktokstudio?dateRange=%7B%22type%22%3A%22fixed%22%2C%22pastDay%22%3A28%7D", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(3000);
    const views30dRaw = await page.evaluate(`(() => {
      var all = Array.from(document.querySelectorAll("*"));
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.children.length === 0 && el.textContent && el.textContent.trim().toLowerCase() === "video views") {
          var parent = el.parentElement;
          if (parent) {
            var lines = parent.innerText.split("\\n").map(function(l) { return l.trim(); }).filter(Boolean);
            var idx = lines.findIndex(function(l) { return l.toLowerCase() === "video views"; });
            if (idx !== -1 && lines[idx + 1]) return lines[idx + 1];
            if (idx !== -1 && lines[idx - 1]) return lines[idx - 1];
          }
        }
      }
      return "";
    })()`);
    console.log("30 Days Views Raw:", views30dRaw);

    // 4. Visit Content page
    console.log("🚀 Step 4: Navigating to Content page (/tiktokstudio/content)...");
    await page.goto("https://www.tiktok.com/tiktokstudio/content", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(4000);

    const contentData = await page.evaluate(`(() => {
      var rows = Array.from(document.querySelectorAll("tbody tr, [data-e2e='content-table-row'], [class*='TableRow']"));
      var allText = document.body ? document.body.innerText : "";
      return {
        totalRowsFound: rows.length,
        textSnippet: allText.substring(0, 500),
      };
    })()`);
    console.log("📁 Content Page Result:", JSON.stringify(contentData, null, 2));

  } catch (err: any) {
    console.error("Test error:", err.message);
  } finally {
    if (context) await context.close().catch(() => {});
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }
}

testStudioExtractor().catch(console.error);

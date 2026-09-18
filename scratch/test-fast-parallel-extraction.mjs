import { chromium } from "playwright-core";
import { getChromeExecutablePath, loadProfileSession } from "../client-agent/agent.js";

async function main() {
  const profileId = "30dabc91-9f51-49e9-9b6b-007d4c086b3b";
  const cookies = loadProfileSession(profileId);
  const chromePath = getChromeExecutablePath();

  console.log(`[TEST] Loaded ${cookies?.length} cookies. Testing optimized extraction...`);
  const t0 = performance.now();

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const formatted = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain?.startsWith(".") ? c.domain : `.${c.domain}`,
    path: c.path || "/",
    expires: c.expirationDate || c.expires || (Math.floor(Date.now() / 1000) + 86400 * 30),
    httpOnly: !!c.httpOnly,
    secure: c.secure !== false,
    sameSite: c.sameSite === "no_restriction" ? "None" : (c.sameSite === "lax" ? "Lax" : "None"),
  }));
  await context.addCookies(formatted);

  const page = await context.newPage();

  // Resource blocking: skip images, media, fonts
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") {
      return route.abort();
    }
    return route.continue();
  });

  const tNav0 = performance.now();
  await page.goto("https://www.tiktok.com/tiktokstudio/content", {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  const navDur = ((performance.now() - tNav0) / 1000).toFixed(2);
  console.log(`[1] Single Page Navigation took: ${navDur}s`);

  // Parallel In-Page Extraction: Fetch Passport, Analytics & Monetization concurrently!
  const tApi0 = performance.now();
  const [passport, analytics, monetization] = await Promise.all([
    // Passport info
    page.evaluate(async () => {
      try {
        const res = await fetch("https://www.tiktok.com/passport/web/account/info/?app_id=1233", { credentials: "include" });
        return await res.json();
      } catch (e) { return { error: e.message }; }
    }),
    // Analytics (7d, 28d, 60d, 365d)
    page.evaluate(async () => {
      const out = {};
      for (const days of [7, 28, 60, 365]) {
        try {
          const typeRequests = [
            { insigh_type: "vv_history", days: days, end_days: 0 },
            { insigh_type: "pv_history", days: days, end_days: 0 },
            { insigh_type: "like_history", days: days, end_days: 0 },
          ];
          const url = "/aweme/v2/data/insight/?tz_offset=25200&type_requests=" + encodeURIComponent(JSON.stringify(typeRequests));
          const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
          out[days] = await res.json();
        } catch { out[days] = null; }
      }
      return out;
    }),
    // Monetization
    page.evaluate(async () => {
      try {
        const url = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0&video_analytics_filter=" + encodeURIComponent(JSON.stringify({
          video_analytics_display_time_range: 1,
          video_analytics_sort_by_type: 3,
          video_analytics_programs: [9],
        }));
        const res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(4000) });
        return await res.json();
      } catch (e) { return { error: e.message }; }
    }),
  ]);

  const apiDur = ((performance.now() - tApi0) / 1000).toFixed(2);
  console.log(`[2] Concurrent In-Page APIs took: ${apiDur}s`);

  const totalDur = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`\n>>> TOTAL OPTIMIZED RUNTIME: ${totalDur}s <<<`);
  console.log(`Passport:`, passport?.data?.username || passport?.data?.screen_name);
  console.log(`Analytics 7d vv:`, analytics?.[7]?.vv_history !== undefined ? "OK" : "None");
  console.log(`Monetization Status:`, monetization?.status_code || monetization?.message || "OK");

  await browser.close();
}

main().catch(console.error);

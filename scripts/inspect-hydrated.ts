import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function inspectHydrated() {
  const chromePath = getChromeExecutablePath();
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  console.log("Navigating...");
  await page.goto("https://www.tiktok.com/@dat.nguyen6284", {
    waitUntil: "networkidle",
    timeout: 40000,
  });

  // Wait for Followers text to appear
  console.log("Waiting for Followers text...");
  await page.waitForFunction(() => {
    return document.body.innerText.includes("Followers") || document.body.innerText.includes("Following");
  }, { timeout: 15000 }).catch(e => console.log("Wait for followers:", e.message));

  const result = await page.evaluate(() => {
    const text = document.body.innerText;
    
    // Find followers, following, likes from body text
    // E.g. "0 Following  1 Followers  1 Likes" or similar
    const mFollowers = text.match(/([0-9.KMB]+)\s+Followers/i);
    const mFollowing = text.match(/([0-9.KMB]+)\s+Following/i);
    const mLikes = text.match(/([0-9.KMB]+)\s+Likes/i);

    // Look for video links
    const allLinks = Array.from(document.querySelectorAll("a")).map(a => a.href);
    const videoLinks = allLinks.filter(h => h.includes("/video/"));

    // Look for video elements or views
    const videoViews: string[] = [];
    document.querySelectorAll("*").forEach(el => {
      const t = el.textContent?.trim();
      // Match view patterns like "120 views", "1.5K", etc. on video cards
      if (el.tagName === "STRONG" || el.tagName === "SPAN") {
        const p = el.parentElement;
        if (p && p.tagName === "A" && p.getAttribute("href")?.includes("/video/")) {
          videoViews.push(`${p.getAttribute("href")}: ${t}`);
        }
      }
    });

    return {
      bodySnippet: text.substring(0, 1000),
      followersMatch: mFollowers ? mFollowers[1] : null,
      followingMatch: mFollowing ? mFollowing[1] : null,
      likesMatch: mLikes ? mLikes[1] : null,
      videoLinksCount: videoLinks.length,
      videoLinks,
      videoViews,
    };
  });

  console.log("Hydrated Result:", JSON.stringify(result, null, 2));
  await browser.close();
}

inspectHydrated().catch(console.error);

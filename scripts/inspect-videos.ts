import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function inspectVideos() {
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

  await page.goto("https://www.tiktok.com/@dat.nguyen6284", {
    waitUntil: "domcontentloaded",
    timeout: 25000,
  });

  await page.waitForTimeout(4000);

  const videoDetails = await page.evaluate(() => {
    // 1. Check all links that contain /video/
    const videoLinks = Array.from(document.querySelectorAll('a[href*="/video/"]')).map(a => ({
      href: (a as HTMLAnchorElement).href,
      text: a.textContent?.trim(),
      html: a.outerHTML.substring(0, 200),
    }));

    // 2. Check all elements with data-e2e
    const e2eElements = Array.from(document.querySelectorAll("[data-e2e]")).map(el => ({
      tag: el.tagName,
      e2e: el.getAttribute("data-e2e"),
      text: el.textContent?.trim()?.substring(0, 100),
    }));

    // 3. Check video post items or feeds
    const postItems = Array.from(document.querySelectorAll('[data-e2e="user-post-item"], div[class*="DivItemContainer"]')).map(p => ({
      text: p.textContent?.trim(),
      html: p.innerHTML.substring(0, 300),
    }));

    // 4. Look for numbers preceding 'Following', 'Followers', 'Likes'
    let following = 0;
    let followers = 0;
    let likes = 0;

    const allElements = Array.from(document.querySelectorAll("strong, span, div"));
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const txt = el.textContent?.trim();
      if (txt === "Following" || txt === "Đang theo dõi") {
        const prev = allElements[i - 1]?.textContent?.trim();
        if (prev && !isNaN(Number(prev))) following = Number(prev);
      }
      if (txt === "Followers" || txt === "Follower" || txt === "Người theo dõi") {
        const prev = allElements[i - 1]?.textContent?.trim();
        if (prev && !isNaN(Number(prev))) followers = Number(prev);
      }
      if (txt === "Likes" || txt === "Thích") {
        const prev = allElements[i - 1]?.textContent?.trim();
        if (prev && !isNaN(Number(prev))) likes = Number(prev);
      }
    }

    return {
      videoLinks,
      e2eCount: e2eElements.length,
      sampleE2E: e2eElements.slice(0, 20),
      postItems,
      following,
      followers,
      likes,
    };
  });

  console.log("Video inspection results:", JSON.stringify(videoDetails, null, 2));
  await browser.close();
}

inspectVideos().catch(console.error);

import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function inspectVideo() {
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

  const url = "https://www.tiktok.com/@dat.nguyen6284/video/7681871217019735303";
  console.log("Navigating to video:", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);

  const stats = await page.evaluate(() => {
    // Look for like, comment, bookmark, share counts
    const likeEl = document.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]');
    const commentEl = document.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]');
    const bookmarkEl = document.querySelector('[data-e2e="bookmark-count"]');
    const shareEl = document.querySelector('[data-e2e="share-count"]');

    return {
      like: likeEl?.textContent?.trim(),
      comment: commentEl?.textContent?.trim(),
      bookmark: bookmarkEl?.textContent?.trim(),
      share: shareEl?.textContent?.trim(),
      allButtons: Array.from(document.querySelectorAll("button")).map(b => b.getAttribute("data-e2e") + ": " + b.textContent?.trim()).filter(s => !s.startsWith("null")),
    };
  });

  console.log("Video stats:", JSON.stringify(stats, null, 2));
  await browser.close();
}

inspectVideo().catch(console.error);

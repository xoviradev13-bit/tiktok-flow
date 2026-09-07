import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function inspectCardHTML() {
  const sourceProfile = "D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332";
  const tempProfile = path.join(os.tmpdir(), "gpm_card_inspect_" + Date.now());
  fs.mkdirSync(path.join(tempProfile, "Default"), { recursive: true });

  const filesToCopy = [
    "Local State",
    "Default/Preferences",
    "Default/Secure Preferences",
    "Default/Network",
    "Default/Local Storage",
    "Default/Sessions",
  ];

  for (const item of filesToCopy) {
    const src = path.join(sourceProfile, item);
    const dst = path.join(tempProfile, item);
    try {
      if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
    } catch (e) {}
  }

  const chromePath = getChromeExecutablePath();
  const context = await chromium.launchPersistentContext(tempProfile, {
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    viewport: { width: 1440, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.tiktok.com/@dat.nguyen6284", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForTimeout(5000);

  // Hover over the video link
  const cardInfo = await page.evaluate(`(() => {
    var videoLink = document.querySelector('a[href*="/video/"]');
    if (!videoLink) return { error: "No video link found" };

    var parent = videoLink.parentElement;
    return {
      href: videoLink.href,
      html: parent ? parent.innerHTML : videoLink.outerHTML,
    };
  })()`);

  console.log("Card HTML:", JSON.stringify(cardInfo, null, 2));

  // Now click the video to open modal/player in SPA
  console.log("Clicking video link to open TikTok in-modal player...");
  await page.click('a[href*="/video/"]').catch(() => {});
  await page.waitForTimeout(4000);

  const modalMetrics = await page.evaluate(`(() => {
    // In TikTok SPA, clicking a video card opens the video player modal with like, comment, bookmark, share
    var likeEl = document.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]');
    var commentEl = document.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]');
    var commentItems = document.querySelectorAll('[data-e2e="comment-item"], [data-e2e="comment-level-1"]');

    return {
      modalLike: likeEl ? likeEl.textContent.trim() : null,
      modalComment: commentEl ? commentEl.textContent.trim() : null,
      commentListCount: commentItems.length,
      allText: document.body.innerText.substring(0, 1000),
    };
  })()`);

  console.log("Modal Metrics:", JSON.stringify(modalMetrics, null, 2));

  await context.close();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
}

inspectCardHTML();

import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function testVideoDirect() {
  const sourceProfile = "D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332";
  const tempProfile = path.join(os.tmpdir(), "gpm_video_direct_" + Date.now());
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
  
  // First go to profile
  await page.goto("https://www.tiktok.com/@dat.nguyen6284", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);

  // Then click the video link
  console.log("Looking for video link...");
  const videoFound = await page.waitForSelector('a[href*="/video/"]', { timeout: 15000 }).catch(() => null);

  if (videoFound) {
    console.log("Found video link! Clicking it...");
    await videoFound.click();
    await page.waitForTimeout(5000);

    const data = await page.evaluate(`(() => {
      var likeEl = document.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]');
      var commentEl = document.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]');
      
      // All strongs or buttons in video view
      var buttons = Array.from(document.querySelectorAll('button[data-e2e*="count"], button[data-e2e*="like"], button[data-e2e*="comment"]')).map(b => b.getAttribute('data-e2e') + ': ' + b.textContent.trim());

      var spans = Array.from(document.querySelectorAll('strong, span')).map(s => s.textContent.trim()).filter(t => t.length > 0 && t.length < 20);

      return {
        url: window.location.href,
        like: likeEl ? likeEl.textContent.trim() : null,
        comment: commentEl ? commentEl.textContent.trim() : null,
        buttons: buttons,
        spans: spans.slice(0, 30)
      };
    })()`);

    console.log("Video In-Context Data:", JSON.stringify(data, null, 2));
  } else {
    console.log("Video link not found within timeout");
  }

  await context.close();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
}

testVideoDirect();

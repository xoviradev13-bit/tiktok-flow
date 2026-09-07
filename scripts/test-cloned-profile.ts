import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function testClonedProfile() {
  const sourceProfile = "D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332";
  const tempProfile = path.join(os.tmpdir(), "gpm_profile_clone_" + Date.now());

  console.log("📂 Creating lightweight clone of profile in:", tempProfile);
  fs.mkdirSync(path.join(tempProfile, "Default"), { recursive: true });

  // Copy necessary session & cookie files
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
      if (fs.existsSync(src)) {
        fs.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
      }
    } catch (e: any) {
      console.log(`Copy note for ${item}: ${e.message}`);
    }
  }

  console.log("🚀 Launching Chrome with cloned profile...");
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
    console.log("Navigating to https://www.tiktok.com/@dat.nguyen6284 ...");
    await page.goto("https://www.tiktok.com/@dat.nguyen6284", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(5000);
    console.log("Page title:", await page.title());

    const data = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        title: document.title,
        textSnippet: text.substring(0, 500),
        hasCaptcha: text.includes("fit the puzzle") || text.includes("captcha"),
        videoLinks: Array.from(document.querySelectorAll('a[href*="/video/"]')).map(a => (a as HTMLAnchorElement).href),
        allCounts: Array.from(document.querySelectorAll("strong")).map(s => s.textContent?.trim()),
      };
    });

    console.log("Result with cloned profile:", JSON.stringify(data, null, 2));

    // Also check TikTok Studio
    console.log("\nChecking TikTok Studio URL...");
    await page.goto("https://www.tiktok.com/tiktokstudio/content", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    await page.waitForTimeout(4000);
    console.log("Studio URL:", page.url());
    console.log("Studio Title:", await page.title());
    const studioData = await page.evaluate(() => {
      return {
        url: window.location.href,
        textSnippet: document.body.innerText.substring(0, 800),
      };
    });
    console.log("Studio Content:", studioData);

  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    if (context) await context.close().catch(() => {});
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }
}

testClonedProfile();

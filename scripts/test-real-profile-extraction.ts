import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function runRealTest() {
  const profileId = "80d8f999-e7f6-4f06-bb33-15896a70b332";
  const sourceProfile = path.join("D:\\Tiktok automation", profileId);
  const tempProfile = path.join(os.tmpdir(), "gpm_real_test_" + Date.now());

  console.log(`[1] Copying profile files from ${sourceProfile} to ${tempProfile}...`);
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
    } catch (e: any) {
      console.warn(`Could not copy ${item}: ${e.message}`);
    }
  }

  const chromePath = getChromeExecutablePath();
  console.log(`[2] Launching Chrome via Playwright with executable: ${chromePath}`);

  const context = await chromium.launchPersistentContext(tempProfile, {
    executablePath: chromePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--password-store=basic",
      "--lang=vi",
    ],
    viewport: { width: 1440, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    // 1. Visit TikTok Home
    console.log("\n[3] Testing https://www.tiktok.com/ ...");
    const resp1 = await page.goto("https://www.tiktok.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    console.log("  URL after load:", page.url());

    // Check login cookies in context
    const cookies = await context.cookies("https://www.tiktok.com");
    const cookieNames = cookies.map(c => c.name);
    console.log("  TikTok cookies in context:", cookieNames.filter(c => ["sessionid", "sessionid_ss", "sid_tt", "uid_tt", "store-country-code"].includes(c)));

    const homeInfo = await page.evaluate(() => {
      const rehydration = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
      let rehydrationUser = null;
      if (rehydration && rehydration.textContent) {
        try {
          const json = JSON.parse(rehydration.textContent);
          const scope = json["__DEFAULT_SCOPE__"] || {};
          rehydrationUser = scope["webapp.app-context"]?.user || scope["webapp.user-detail"]?.userInfo;
        } catch (e) {}
      }

      const sigi = document.getElementById("SIGI_STATE");
      let sigiUser = null;
      if (sigi && sigi.textContent) {
        try {
          sigiUser = JSON.parse(sigi.textContent).LiveUser;
        } catch (e) {}
      }

      const profileLink = document.querySelector('a[data-e2e="profile-icon"]') || document.querySelector('header a[href*="/@"]');

      return {
        rehydrationFound: !!rehydration,
        rehydrationUser,
        sigiFound: !!sigi,
        sigiUser,
        profileLinkHref: profileLink ? profileLink.getAttribute("href") : null,
        title: document.title,
      };
    });

    console.log("  Home page detection:", JSON.stringify(homeInfo, null, 2));

    // 2. Visit TikTok Studio
    console.log("\n[4] Testing https://www.tiktok.com/tiktokstudio ...");
    await page.goto("https://www.tiktok.com/tiktokstudio", { waitUntil: "domcontentloaded", timeout: 35000 });
    await page.waitForTimeout(6000);
    console.log("  Studio URL after load:", page.url());

    const studioInfo = await page.evaluate(() => {
      const allText = document.body ? document.body.innerText : "";
      return {
        url: location.href,
        title: document.title,
        textSnippet: allText.substring(0, 600),
      };
    });

    console.log("  Studio page detection:", JSON.stringify(studioInfo, null, 2));

  } catch (err: any) {
    console.error("  Error during test:", err.message);
  } finally {
    await context.close().catch(() => {});
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }
}

runRealTest().catch(console.error);

import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function inspectCards() {
  const sourceProfile = "D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332";
  const tempProfile = path.join(os.tmpdir(), "gpm_inspect_cards_" + Date.now());
  fs.mkdirSync(path.join(tempProfile, "Default"), { recursive: true });

  const filesToCopy = [
    "Local State",
    "Default/Preferences",
    "Default/Secure Preferences",
    "Default/Local Storage",
  ];

  for (const item of filesToCopy) {
    const src = path.join(sourceProfile, item);
    const dst = path.join(tempProfile, item);
    try {
      if (fs.existsSync(src)) {
        fs.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
      }
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
  await page.waitForTimeout(4000);

  const cardData = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
    return links.map(a => {
      const parent = a.closest("div") || a;
      return {
        href: (a as HTMLAnchorElement).href,
        linkText: a.textContent?.trim(),
        parentText: parent.textContent?.trim(),
        outerHTML: a.outerHTML.substring(0, 300),
      };
    });
  });

  console.log("Cards on page:", JSON.stringify(cardData, null, 2));
  await context.close();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
}

inspectCards();

import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function inspectProfilePage() {
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

  console.log("Navigating to https://www.tiktok.com/@dat.nguyen6284 ...");
  await page.goto("https://www.tiktok.com/@dat.nguyen6284", {
    waitUntil: "networkidle",
    timeout: 30000,
  }).catch(e => console.log("goto finished/timeout:", e.message));

  console.log("Final URL:", page.url());
  console.log("Title:", await page.title());

  // Check HTML content
  const html = await page.content();
  console.log("HTML length:", html.length);

  // Check if captcha or verify
  if (html.includes("verify-bar") || html.includes("captcha") || html.includes("sec-cpt")) {
    console.log("⚠️ Captcha or security check detected!");
  }

  // Check rehydration data
  const rehydration = await page.evaluate(() => {
    const w = window as any;
    return {
      hasRehydration: !!w.__UNIVERSAL_DATA_FOR_REHYDRATION__,
      scopeKeys: Object.keys(w.__UNIVERSAL_DATA_FOR_REHYDRATION__?.["__DEFAULT_SCOPE__"] || {}),
      userModule: w.SIGI_STATE?.UserModule,
    };
  });
  console.log("Rehydration state:", JSON.stringify(rehydration, null, 2));

  // Check all text on page or headings
  const textSnippets = await page.evaluate(() => {
    const h1 = document.querySelector("h1")?.textContent;
    const h2 = document.querySelector("h2")?.textContent;
    const spans = Array.from(document.querySelectorAll("span, strong, p"))
      .map(s => s.textContent?.trim())
      .filter(t => t && t.length > 0 && t.length < 50);
    return { h1, h2, sampleTexts: spans.slice(0, 30) };
  });
  console.log("Page texts:", textSnippets);

  await browser.close();
}

inspectProfilePage().catch(console.error);

import { chromium } from "playwright-core";

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:52512");
  const context = browser.contexts()[0];
  const pages = context.pages();
  for (const page of pages) {
    console.log("Page URL:", page.url(), "Title:", await page.title());
  }
  const page = pages.find(p => p.url().includes("tiktok")) || pages[0];
  const entries = await page.evaluate(() => {
    return performance.getEntriesByType("resource").map(e => e.name).filter(u => u.includes("tiktok.com"));
  });
  console.log("Total tiktok resource entries:", entries.length);
  const matched = entries.filter(u => u.includes("monetization") || u.includes("analytics") || u.includes("reward"));
  console.log("Matched entries:", matched);
}

main().catch(console.error);

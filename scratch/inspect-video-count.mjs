import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function inspectContent() {
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const storageRoot = getGpmStoragePath();
  const profileDir = path.join(storageRoot, profileId);
  const chromePath = getChromeExecutablePath();

  const snap = await createMinimalProfileSnapshot(profileDir, profileId);
  const context = await chromium.launchPersistentContext(snap.tempDir, {
    headless: true,
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-gpu"],
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Check @ousnowfan public page
  console.log("Navigating to https://www.tiktok.com/@ousnowfan ...");
  await page.goto("https://www.tiktok.com/@ousnowfan", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const publicText = await page.evaluate(() => document.body?.innerText || "");
  console.log("Public profile page has 469:", publicText.includes("469"));
  const publicLines = publicText.split("\n").filter(l => l.trim()).slice(0, 40);
  console.log("Public profile top lines:", publicLines);

  // Check content page tabs
  console.log("Navigating to https://www.tiktok.com/tiktokstudio/content ...");
  await page.goto("https://www.tiktok.com/tiktokstudio/content", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const contentText = await page.evaluate(() => document.body?.innerText || "");
  console.log("Content page has 469:", contentText.includes("469"));
  const contentLines = contentText.split("\n").filter(l => l.trim()).slice(0, 40);
  console.log("Content page top lines:", contentLines);

  // Check tab elements specifically
  const tabs = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[role="tab"], button, [class*="tab"]'));
    return els.map(e => e.innerText?.trim()).filter(Boolean);
  });
  console.log("Tabs:", tabs);

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

inspectContent().catch(console.error);

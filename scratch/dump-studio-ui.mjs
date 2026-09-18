import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function dumpStudioUi() {
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

  console.log("Navigating to https://www.tiktok.com/tiktokstudio ...");
  await page.goto("https://www.tiktok.com/tiktokstudio", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(4000);

  const homeCards = await page.evaluate(() => {
    return document.body.innerText;
  });

  console.log("Navigating to https://www.tiktok.com/tiktokstudio/analytics ...");
  await page.goto("https://www.tiktok.com/tiktokstudio/analytics", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(4000);

  const analyticsCards = await page.evaluate(() => {
    return document.body.innerText;
  });

  fs.writeFileSync("scratch/studio_home_text.txt", homeCards, "utf-8");
  fs.writeFileSync("scratch/studio_analytics_text.txt", analyticsCards, "utf-8");

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
  console.log("Done dumping studio texts!");
}

dumpStudioUi().catch(console.error);

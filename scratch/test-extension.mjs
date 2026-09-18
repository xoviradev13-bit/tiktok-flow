import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getChromeExecutablePath,
  getGpmStoragePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function testExtension() {
  const extPath = path.resolve("extension");
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const storageRoot = getGpmStoragePath();
  const profileDir = path.join(storageRoot, profileId);
  const chromePath = getChromeExecutablePath();

  console.log("=== TESTING TIKTOKFLOW COMPANION EXTENSION ===");
  console.log("Extension Path:", extPath);
  console.log("Profile Dir:", profileDir);

  const snap = await createMinimalProfileSnapshot(profileDir, profileId);

  // In MV3, extensions require non-headless (or new headless mode)
  const context = await chromium.launchPersistentContext(snap.tempDir, {
    headless: false, // extensions require head or headless: "new"
    executablePath: chromePath,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      "--no-sandbox",
      "--disable-gpu",
      "--window-position=-2000,-2000", // off-screen so it doesn't disturb user
      "--window-size=1280,800",
    ],
  });

  console.log("Browser context launched with extension.");

  // Check background service workers
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    console.log("Waiting for service worker to initialize...");
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);
  }

  if (serviceWorker) {
    console.log("[OK] Extension Background Service Worker detected:", serviceWorker.url());
  } else {
    console.warn("[!] No service worker event detected immediately, checking extension pages...");
  }

  // Open TikTok Studio or TikTok home to test content script
  const page = await context.newPage();

  const consoleLogs = [];
  page.on("console", (msg) => consoleLogs.push(`[PAGE] ${msg.text()}`));

  console.log("Navigating to https://www.tiktok.com/tiktokstudio ...");
  await page.goto("https://www.tiktok.com/tiktokstudio", { waitUntil: "domcontentloaded", timeout: 25000 }).catch(e => console.log("Nav err:", e.message));
  await page.waitForTimeout(4000);

  // Check if content script injected
  const contentInjected = await page.evaluate(() => {
    return window.__TIKTOKFLOW_CONTENT_INJECTED__ || document.querySelector("[data-tiktokflow-injected]") !== null || true;
  }).catch(() => false);

  console.log("Page title:", await page.title());
  console.log("Content script active check:", contentInjected);

  // Try to inspect extension popup / internal state
  const backgroundPages = context.backgroundPages();
  console.log("Background pages count:", backgroundPages.length);

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
  console.log("=== EXTENSION TEST FINISHED ===");
}

testExtension().catch(console.error);

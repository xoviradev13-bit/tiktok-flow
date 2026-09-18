import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getChromeExecutablePath,
  getGpmStoragePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function testExtensionDeep() {
  const extPath = path.resolve("extension");
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const storageRoot = getGpmStoragePath();
  const profileDir = path.join(storageRoot, profileId);
  const chromePath = getChromeExecutablePath();

  const snap = await createMinimalProfileSnapshot(profileDir, profileId);

  const context = await chromium.launchPersistentContext(snap.tempDir, {
    headless: false,
    executablePath: chromePath,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      "--no-sandbox",
      "--disable-gpu",
      "--window-position=-2000,-2000",
      "--window-size=1280,800",
    ],
  });

  const swLogs = [];
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 8000 }).catch(() => null);
  }

  if (serviceWorker) {
    console.log("[OK] SW URL:", serviceWorker.url());
  }

  const page = await context.newPage();
  const pageLogs = [];
  page.on("console", (m) => pageLogs.push(m.text()));

  await page.goto("https://www.tiktok.com/tiktokstudio", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Read extension storage data
  let extStorage = null;
  if (serviceWorker) {
    extStorage = await serviceWorker.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => resolve(items));
      });
    }).catch(() => null);
  }

  console.log("=== EXTENSION STORAGE STATE ===");
  console.log(JSON.stringify(extStorage, null, 2));

  console.log("=== CONTENT SCRIPT LOGS ===");
  console.log(pageLogs.slice(0, 20));

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

testExtensionDeep().catch(console.error);

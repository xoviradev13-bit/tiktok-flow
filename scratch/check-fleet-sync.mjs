import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getChromeExecutablePath,
  getGpmStoragePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function checkFleetSyncFinish() {
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

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 8000 }).catch(() => null);
  }

  // Wait 10 seconds for syncGpmFleet to complete full cycle
  console.log("Waiting 10s for extension fleet sync cycle...");
  await new Promise(r => setTimeout(r, 10000));

  let extStorage = null;
  if (serviceWorker) {
    extStorage = await serviceWorker.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => resolve(items));
      });
    }).catch(() => null);
  }

  console.log("=== FINAL EXTENSION STORAGE ===");
  console.log(JSON.stringify(extStorage, null, 2));

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

checkFleetSyncFinish().catch(console.error);

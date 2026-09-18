import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function interceptStudioApis() {
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

  const capturedResponses = [];

  page.on("response", async (res) => {
    const url = res.url();
    const contentType = res.headers()["content-type"] || "";
    if (url.includes("/api/") || url.includes("/aweme/") || url.includes("/passport/") || contentType.includes("json")) {
      try {
        const text = await res.text();
        if (text && (text.startsWith("{") || text.startsWith("["))) {
          capturedResponses.push({
            url,
            status: res.status(),
            length: text.length,
            sample: text.slice(0, 300),
            full: text.length < 50000 ? JSON.parse(text) : "TOO_LARGE"
          });
        }
      } catch {}
    }
  });

  console.log("Navigating to https://www.tiktok.com/tiktokstudio ...");
  await page.goto("https://www.tiktok.com/tiktokstudio", { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(3000);

  console.log("Captured API responses:", capturedResponses.length);
  fs.writeFileSync("scratch/studio_home_apis.json", JSON.stringify(capturedResponses, null, 2), "utf-8");

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
  console.log("Done!");
}

interceptStudioApis().catch(console.error);

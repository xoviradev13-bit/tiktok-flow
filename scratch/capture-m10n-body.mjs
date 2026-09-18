import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function captureM10nBody() {
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

  let captured = null;
  page.on("response", async (resp) => {
    if (resp.url().includes("/m10n_center/reward_analytics?")) {
      try {
        captured = await resp.json();
      } catch {}
    }
  });

  await page.goto("https://www.tiktok.com/tiktokstudio/monetization", { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  fs.writeFileSync("scratch/real_reward_analytics_body.json", JSON.stringify(captured, null, 2), "utf8");
  console.log("Captured real reward analytics body:", !!captured);

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

captureM10nBody().catch(console.error);

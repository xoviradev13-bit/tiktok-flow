import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function inspect() {
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const storageRoot = getGpmStoragePath();
  const profileDir = path.join(storageRoot, profileId);
  const chromePath = getChromeExecutablePath();

  console.log("Creating snapshot for inspection...");
  const snap = await createMinimalProfileSnapshot(profileDir, profileId);
  if (!snap?.tempDir) throw new Error("Failed snapshot");

  const context = await chromium.launchPersistentContext(snap.tempDir, {
    headless: true,
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-gpu"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const intercepted = [];
  page.on("response", async (resp) => {
    const u = resp.url();
    if (u.includes("tiktok") && (u.includes("user") || u.includes("item") || u.includes("content") || u.includes("m10n") || u.includes("analytics") || u.includes("reward") || u.includes("insight"))) {
      try {
        const text = await resp.text();
        intercepted.push({ url: u, status: resp.status(), length: text.length, snippet: text.slice(0, 300) });
      } catch {}
    }
  });

  console.log("Navigating to https://www.tiktok.com/tiktokstudio ...");
  await page.goto("https://www.tiktok.com/tiktokstudio", { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Check Home page text and data
  const homeText = await page.evaluate(() => document.body?.innerText || "");
  console.log("Home text length:", homeText.length);

  // Check content page
  console.log("Navigating to https://www.tiktok.com/tiktokstudio/content ...");
  await page.goto("https://www.tiktok.com/tiktokstudio/content", { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const contentContext = await page.evaluate(() => {
    const el = document.getElementById("__Creator_Center_Context__");
    return el ? el.textContent : null;
  });

  // Check public / authenticated user detail API
  const userDetail = await page.evaluate(async () => {
    try {
      const r = await fetch("https://www.tiktok.com/api/user/detail/?uniqueId=ousnowfan&secUid=", { credentials: "include" });
      return await r.json();
    } catch (e) {
      return { error: e.message };
    }
  });

  // Check studio user API
  const studioUser = await page.evaluate(async () => {
    try {
      const r = await fetch("https://www.tiktok.com/tiktokstudio/api/web/user/?aid=1988", { credentials: "include" });
      return await r.json();
    } catch (e) {
      return { error: e.message };
    }
  });

  // Check monetization page
  console.log("Navigating to https://www.tiktok.com/tiktokstudio/monetization ...");
  await page.goto("https://www.tiktok.com/tiktokstudio/monetization", { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const m10nText = await page.evaluate(() => document.body?.innerText || "");

  const output = {
    homeTextSnippet: homeText.slice(0, 2000),
    m10nTextSnippet: m10nText.slice(0, 3000),
    userDetail,
    studioUser,
    contentContextSnippet: contentContext?.slice(0, 2000),
    interceptedUrls: intercepted.map(i => ({ url: i.url, status: i.status, length: i.length })),
  };

  fs.writeFileSync("scratch/studio_inspection_raw.json", JSON.stringify(output, null, 2), "utf8");
  console.log("Saved inspection to scratch/studio_inspection_raw.json");

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

inspect().catch(console.error);

import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function inspectHomeElements() {
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
  await page.waitForTimeout(3000);

  const homeData = await page.evaluate(() => {
    // 1. Look for user card stats in Home
    const text = document.body?.innerText || "";
    const likesMatch = text.match(/(?:Lượt thích|Likes?)\s*\n*\s*([\d,.]+[kKmM]?)/i) || text.match(/([\d,.]+[kKmM]?)\s*\n*\s*(?:Lượt thích|Likes?)/i);
    const followersMatch = text.match(/(?:Followers?)\s*\n*\s*([\d,.]+[kKmM]?)/i) || text.match(/([\d,.]+[kKmM]?)\s*\n*\s*(?:Followers?)/i);

    // 2. Check all script tags with JSON
    const scripts = Array.from(document.querySelectorAll("script")).map(s => s.textContent || "");
    const jsonScripts = scripts.filter(s => s.includes("301") || s.includes("469") || s.includes("heart") || s.includes("video_count"));

    // 3. Search for video count in text
    const videoCountMatch = text.match(/(\d+)\s*(?:video|bài đăng|posts?)/i) || text.match(/(?:video|bài đăng|posts?)\s*:?\s*(\d+)/i);

    return {
      likesText: likesMatch ? likesMatch[0] : null,
      likesValue: likesMatch ? (likesMatch[1] || likesMatch[2]) : null,
      followersValue: followersMatch ? (followersMatch[1] || followersMatch[2]) : null,
      videoCountMatch: videoCountMatch ? videoCountMatch[0] : null,
      jsonScriptsCount: jsonScripts.length,
      jsonSnippet: jsonScripts[0]?.slice(0, 1000),
    };
  });

  console.log("Home extracted data:", homeData);

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

inspectHomeElements().catch(console.error);

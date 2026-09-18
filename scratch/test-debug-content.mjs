import path from "path";
import fs from "fs";
import { getGpmStoragePath, getChromeExecutablePath } from "../client-agent/agent.js";
import { chromium } from "playwright-core";

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "lock" || entry.name.endsWith(".lock")) continue;
    if (["Cache", "Code Cache", "GPUCache", "DawnCache"].includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else try { fs.copyFileSync(s, d); } catch {}
  }
}

async function main() {
  const storagePath = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const profileDir = path.join(storagePath, profileId);

  const tempRoot = path.join(path.dirname(profileDir), ".gpm_temp");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "debug-ousnowfan-"));
  copyDirRecursive(profileDir, tempDir);

  const context = await chromium.launchPersistentContext(tempDir, {
    headless: true,
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-gpu"],
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const interceptedCalls = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (u.includes("user") || u.includes("item_list") || u.includes("post_list") || u.includes("reward")) {
      interceptedCalls.push(u);
    }
  });

  console.log("Navigating to https://www.tiktok.com/tiktokstudio/content...");
  await page.goto("https://www.tiktok.com/tiktokstudio/content", {
    waitUntil: "networkidle",
    timeout: 30000,
  }).catch((e) => console.log("goto catch:", e.message));

  console.log("Page URL:", page.url());
  console.log("Page Title:", await page.title());

  const contextEl = await page.evaluate(() => {
    const el = document.getElementById("__Creator_Center_Context__");
    return el ? el.textContent.length : 0;
  });
  console.log("__Creator_Center_Context__ length:", contextEl);

  const userBase = await page.evaluate(() => {
    return window.__DEFAULT_DATA__ || null;
  });
  console.log("__DEFAULT_DATA__ exists?", !!userBase);

  console.log("Intercepted matching URLs count:", interceptedCalls.length);
  for (const u of interceptedCalls.slice(0, 10)) {
    console.log(" -", u);
  }

  await context.close();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
}

main().catch(console.error);

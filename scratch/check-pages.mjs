import path from 'path';
import { getGpmStoragePath, getChromeExecutablePath } from '../client-agent/agent.js';
import { chromium } from 'playwright-core';
import fs from 'fs';

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
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "test-pages-"));
  copyDirRecursive(profileDir, tempDir);

  const context = await chromium.launchPersistentContext(tempDir, {
    headless: true,
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-gpu"],
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  let capturedBaseUrl = null;
  page.on("response", async (res) => {
    const u = res.url();
    if (u.includes("reward_analytics_per_post") && u.includes("video_analytics_filter")) {
      capturedBaseUrl = u;
    }
  });

  console.log("Navigating to item page...");
  await page.goto("https://www.tiktok.com/tiktokstudio/monetization/item/7672354204966456598/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).catch(() => {});

  // Wait for capturedBaseUrl
  const start = Date.now();
  while (Date.now() - start < 8000 && !capturedBaseUrl) {
    await page.waitForTimeout(300);
  }

  console.log("Captured base URL:", capturedBaseUrl);

  if (capturedBaseUrl) {
    for (let p = 0; p < 10; p++) {
      const pageResult = await page.evaluate(async ({ baseReqUrl, pageNum }) => {
        try {
          const u = new URL(baseReqUrl, window.location.origin);
          u.searchParams.set("page", String(pageNum));
          const r = await fetch(u.toString(), { credentials: "include" });
          const j = await r.json();
          const list = j?.data?.video_analytics_video_list || j?.video_analytics_video_list || [];
          return {
            page: pageNum,
            count: list.length,
            has_more: !!(j?.data?.has_more || j?.has_more),
            firstTitle: list[0]?.video_name,
            lastTitle: list[list.length - 1]?.video_name,
            totalRewardsInPage: list.reduce((s, v) => s + (parseFloat(v.est_rewards?.formatted_no_symbol) || 0), 0)
          };
        } catch (e) {
          return { page: pageNum, error: e.message };
        }
      }, { baseReqUrl: capturedBaseUrl, pageNum: p });

      console.log(`Page ${p}:`, pageResult);
      if (pageResult.count === 0 || !pageResult.has_more) {
        console.log(`Stop condition reached at page ${p}.`);
        break;
      }
    }
  }

  await context.close();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
}

main().catch(console.error);

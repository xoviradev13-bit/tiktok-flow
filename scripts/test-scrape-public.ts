import { chromium } from "playwright";

async function scrapeTikTok(username: string) {
  console.log(`🚀 Scraping https://www.tiktok.com/@${username}...`);
  const chromePath = "C:\\Users\\datng\\AppData\\Roaming\\GPMLoginGlobal\\Browsers\\ChromiumCore_v151\\chrome.exe";
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"]
  });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait a bit for client hydration
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log("Page Title:", title);

    const info = await page.evaluate(() => {
      // 1. Try __UNIVERSAL_DATA_FOR_REHYDRATION__
      const win = window as any;
      const rehydration = win.__UNIVERSAL_DATA_FOR_REHYDRATION__;
      const userDetail =
        rehydration?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;

      if (userDetail) {
        return {
          source: "rehydration",
          username: userDetail.user?.uniqueId,
          nickname: userDetail.user?.nickname,
          followerCount: userDetail.stats?.followerCount ?? 0,
          followingCount: userDetail.stats?.followingCount ?? 0,
          heartCount: userDetail.stats?.heartCount ?? 0,
          videoCount: userDetail.stats?.videoCount ?? 0,
        };
      }

      // 2. Try DOM selectors for profile stats
      const followingEl = document.querySelector('[data-e2e="following-count"]');
      const followersEl = document.querySelector('[data-e2e="followers-count"]');
      const likesEl = document.querySelector('[data-e2e="likes-count"]');
      const nicknameEl = document.querySelector('h1[data-e2e="user-title"]') || document.querySelector('[data-e2e="user-subtitle"]');
      const videoItems = document.querySelectorAll('[data-e2e="user-post-item"]');
      const videoList: Array<{ desc: string; playCount: string }> = [];
      videoItems.forEach((v) => {
        const desc = v.querySelector('[data-e2e="user-post-item-desc"]')?.textContent?.trim() || "";
        const playCount = v.querySelector('[data-e2e="video-views"]')?.textContent?.trim() || "0";
        videoList.push({ desc, playCount });
      });

      return {
        source: "dom",
        following: followingEl?.textContent?.trim() || "0",
        followers: followersEl?.textContent?.trim() || "0",
        likes: likesEl?.textContent?.trim() || "0",
        nickname: nicknameEl?.textContent?.trim() || "",
        videoCount: videoItems.length,
        videos: videoList,
      };
    });

    console.log("Scraped Info:", JSON.stringify(info, null, 2));
    return info;
  } catch (err: any) {
    console.error("Scrape error:", err.message);
  } finally {
    await browser.close();
  }
}

scrapeTikTok("dat.nguyen6284");

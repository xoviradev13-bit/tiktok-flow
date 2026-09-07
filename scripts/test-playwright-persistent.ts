import { chromium } from "playwright";

async function testPersistent() {
  const profilePath = "D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332";
  const chromePath = "C:\\Users\\datng\\AppData\\Roaming\\GPMLoginGlobal\\Browsers\\ChromiumCore_v151\\chrome.exe";

  console.log("🚀 Launching persistent context with GPMLogin profile...");
  console.log("User Data Dir:", profilePath);
  console.log("Chrome Binary:", chromePath);

  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: chromePath,
      headless: true, // run headless
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
      viewport: { width: 1280, height: 720 },
    });

    const page = context.pages()[0] || (await context.newPage());
    console.log("Navigating to https://www.tiktok.com...");
    await page.goto("https://www.tiktok.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log("Page loaded. Title:", await page.title());
    console.log("Current URL:", page.url());

    // Extract user information
    const data = await page.evaluate(() => {
      const win = window as any;
      const appContext =
        win.__UNIVERSAL_DATA_FOR_REHYDRATION__?.["__DEFAULT_SCOPE__"]?.[
          "webapp.app-context"
        ] || win.__INIT_PROPS__?.["/"]?.appContext;

      const user = appContext?.user;
      return {
        user,
        cookies: document.cookie,
        localStorageKeys: Object.keys(localStorage),
      };
    });

    console.log("Extracted Data:", JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    if (context) {
      await context.close().catch(() => {});
      console.log("Closed context.");
    }
  }
}

testPersistent();

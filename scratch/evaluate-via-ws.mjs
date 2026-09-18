async function sendCdp(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const listRes = await fetch("http://127.0.0.1:63119/json/list");
  const list = await listRes.json();
  const target = list.find((t) => t.type === "page" && t.url.includes("tiktokstudio"));
  if (!target) {
    console.error("No tiktokstudio page found:", list);
    process.exit(1);
  }

  console.log("Connecting to target WebSocket:", target.webSocketDebuggerUrl);
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  console.log("WebSocket connected! Evaluating in page context...");

  // 1. Check title & current URL
  const evalTitle = await sendCdp(ws, "Runtime.evaluate", {
    expression: "document.title + ' | ' + window.location.href",
  });
  console.log("Page info:", evalTitle.result?.value);

  // 2. Fetch all video items in the sidebar or list
  const evalSidebar = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      // Find links or item IDs on the page
      const links = Array.from(document.querySelectorAll('a[href*="/monetization/item/"]'))
        .map(a => a.href);
      return { links: Array.from(new Set(links)) };
    })()`,
    returnByValue: true,
  });
  console.log("Sidebar links:", evalSidebar.result?.value);

  // 3. Inspect global state or React router / stores
  const evalGlobals = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      const keys = Object.keys(window).filter(k => k.toLowerCase().includes('data') || k.toLowerCase().includes('tiktok') || k.toLowerCase().includes('context') || k.toLowerCase().includes('m10n') || k.toLowerCase().includes('redux') || k.toLowerCase().includes('store'));
      return { keys };
    })()`,
    returnByValue: true,
  });
  console.log("Globals on window:", evalGlobals.result?.value);

  // 4. In-page fetch with exact studio parameters!
  // Notice in TikTok Studio, fetch() automatically uses the window cookies and headers!
  console.log("\nCalling in-page fetch for /tiktok/v1/creator/m10n_center/video_reward_analytics?video_id=7672354204966456598...");
  const evalItemFetch = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(async () => {
      try {
        const res = await fetch("/tiktok/v1/creator/m10n_center/video_reward_analytics?video_id=7672354204966456598", {
          credentials: "include"
        });
        return { status: res.status, data: await res.json() };
      } catch (e) {
        return { error: e.message };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  console.log("\n=== ITEM 7672354204966456598 ANALYTICS RESPONSE ===");
  console.log(JSON.stringify(evalItemFetch.result?.value, null, 2));

  // 5. Calling reward_analytics_per_post
  console.log("\nCalling in-page fetch for /tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0...");
  const evalPerPost = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(async () => {
      try {
        const res = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0", {
          credentials: "include"
        });
        return { status: res.status, data: await res.json() };
      } catch (e) {
        return { error: e.message };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  console.log("\n=== REWARD ANALYTICS PER POST RESPONSE ===");
  console.log(JSON.stringify(evalPerPost.result?.value, null, 2));

  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

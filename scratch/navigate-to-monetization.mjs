import WebSocket from "ws";

async function main() {
  const listRes = await fetch("http://127.0.0.1:52512/json/list");
  const list = await listRes.json();
  const target = list.find((t) => t.type === "page" && t.url.includes("tiktok"));

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.once("open", r));

  const send = (method, params) => new Promise((resolve) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        ws.removeListener("message", handler);
        resolve(msg.result);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  console.log("Navigating to https://www.tiktok.com/tiktokstudio/monetization ...");
  await send("Page.navigate", { url: "https://www.tiktok.com/tiktokstudio/monetization" });

  console.log("Waiting 6 seconds for page to load & monetization APIs to fire...");
  await new Promise((r) => setTimeout(r, 6000));

  const res = await send("Runtime.evaluate", {
    expression: `(() => {
      const entries = performance.getEntriesByType('resource').map(e => e.name);
      return {
        url: window.location.href,
        title: document.title,
        rewardAnalyticsUrls: entries.filter(u => u.includes('reward_analytics')),
        allAnalyticsUrls: entries.filter(u => u.includes('/tiktok/v1/creator/m10n_center/'))
      };
    })()`,
    returnByValue: true
  });

  console.log("Captured URLs after navigating to /monetization:\n", JSON.stringify(res.result.value, null, 2));
  ws.close();
}

main().catch(console.error);

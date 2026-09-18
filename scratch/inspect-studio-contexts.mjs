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
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  const res = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      const studioCtx = window.__STUDIO_WEB_CONTEXT__;
      const creatorCtx = window.__Creator_Center_Context__;
      const serverData = window._SERVER_DATA;
      return {
        studioCtx,
        creatorCtx,
        serverData,
      };
    })()`,
    returnByValue: true,
  });

  console.log("Contexts:", JSON.stringify(res.result?.value, null, 2).slice(0, 3000));

  // Also let's check performance entries to see what exact network requests TikTok Studio made!
  const perfRes = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      const entries = performance.getEntriesByType('resource')
        .map(e => e.name)
        .filter(url => url.includes('m10n') || url.includes('reward') || url.includes('creator') || url.includes('monetization') || url.includes('analytics'));
      return { entries };
    })()`,
    returnByValue: true,
  });

  console.log("\nPerformance API resource requests:", JSON.stringify(perfRes.result?.value, null, 2));

  ws.close();
  process.exit(0);
}

main().catch(console.error);

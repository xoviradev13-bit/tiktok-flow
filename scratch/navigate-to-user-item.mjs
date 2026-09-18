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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

  // Enable Network monitoring over CDP!
  console.log("Enabling Network domain over CDP...");
  await sendCdp(ws, "Network.enable");

  const interceptedRequests = [];
  ws.addEventListener("message", async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Network.responseReceived") {
      const { response, requestId } = msg.params;
      const url = response.url;
      if (url.includes("m10n") || url.includes("reward") || url.includes("item")) {
        console.log(`[NETWORK EVENT] ${response.status} ${url.slice(0, 100)}...`);
        // Try to get body
        try {
          const bodyRes = await sendCdp(ws, "Network.getResponseBody", { requestId });
          interceptedRequests.push({ url, body: bodyRes.body });
        } catch (e) {}
      }
    }
  });

  const targetUrl = "https://www.tiktok.com/tiktokstudio/monetization/item/7629019889742777602/";
  console.log(`Navigating to ${targetUrl}...`);
  await sendCdp(ws, "Page.navigate", { url: targetUrl });

  console.log("Waiting 10s for page to load and network requests to fire...");
  await sleep(10000);

  // Check DOM text
  const domText = await sendCdp(ws, "Runtime.evaluate", {
    expression: "document.body.innerText",
    returnByValue: true,
  });

  console.log("\n--- DOM INNER TEXT AFTER NAVIGATION ---");
  console.log(domText.result?.value);

  console.log("\n--- INTERCEPTED NETWORK RESPONSES ---");
  console.log(`Captured: ${interceptedRequests.length}`);
  for (const item of interceptedRequests) {
    console.log("URL:", item.url);
    console.log("BODY:", item.body?.slice(0, 1000));
  }

  // Also check main monetization page: https://www.tiktok.com/tiktokstudio/monetization
  if (domText.result?.value?.includes("Đã xảy ra lỗi")) {
    console.log("\nItem still errored. Trying https://www.tiktok.com/tiktokstudio/monetization ...");
    await sendCdp(ws, "Page.navigate", { url: "https://www.tiktok.com/tiktokstudio/monetization" });
    await sleep(8000);
    const m10nDom = await sendCdp(ws, "Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });
    console.log("\n--- MONETIZATION PAGE DOM ---");
    console.log(m10nDom.result?.value);
  }

  ws.close();
  process.exit(0);
}

main().catch(console.error);

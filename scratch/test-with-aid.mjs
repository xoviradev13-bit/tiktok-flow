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

  const rt = Math.floor(Date.now() / 1000);
  const rn = rt - 31536000;
  
  // Try with aid=1988 & app_name
  const testUrl = `/tiktok/v1/creator/m10n_center/video_reward_analytics?video_id=7672354204966456598&start_date=${rn}&end_date=${rt}&aid=1988&app_name=tiktok_creator_center&device_platform=web_pc`;
  console.log("Testing:", testUrl);

  const fetchRes = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(async () => {
      try {
        const res = await fetch("${testUrl}", { credentials: "include" });
        return { status: res.status, json: await res.json() };
      } catch (e) {
        return { error: e.message };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  console.log("Response with aid=1988:", JSON.stringify(fetchRes.result?.value, null, 2));

  // Let's also check what the page DOM actually shows!
  // If the page is https://www.tiktok.com/tiktokstudio/monetization/item/7672354204966456598/
  // What text / numbers are on the screen?
  const domText = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      return document.body.innerText.slice(0, 2000);
    })()`,
    returnByValue: true,
  });
  console.log("\n--- DOM INNER TEXT ---");
  console.log(domText.result?.value);

  ws.close();
  process.exit(0);
}

main().catch(console.error);

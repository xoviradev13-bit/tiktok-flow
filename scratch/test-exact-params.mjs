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
      const webpackKeys = Object.keys(window).filter(k => k.includes('webpackChunk'));
      return { webpackKeys };
    })()`,
    returnByValue: true,
  });

  console.log("Webpack chunks:", res.result?.value);

  // Let's also check what video_reward_analytics needs!
  // Remember:
  // video_reward_analytics?video_id=7672354204966456598&start_date=...&end_date=...
  const rt = Math.floor(Date.now() / 1000);
  const rn = rt - 31536000;
  const testUrl = `/tiktok/v1/creator/m10n_center/video_reward_analytics?video_id=7672354204966456598&start_date=${rn}&end_date=${rt}`;
  console.log("\nTesting with start_date & end_date:", testUrl);

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

  console.log("\n=== TEST VIDEO REWARD ANALYTICS WITH DATES ===");
  console.log(JSON.stringify(fetchRes.result?.value, null, 2));

  // Now test reward_analytics_per_post with proper params!
  // ng = { page: 0, video_analytics_filter: { video_analytics_display_time_range: 1, video_analytics_sort_by_type: 3, video_analytics_programs: [1, 2, ...] } }
  const testPerPostUrl = `/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0&video_analytics_filter=${encodeURIComponent(JSON.stringify({
    video_analytics_display_time_range: 1,
    video_analytics_sort_by_type: 3,
    video_analytics_programs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  }))}`;

  console.log("\nTesting reward_analytics_per_post with filter:", testPerPostUrl);
  const perPostRes = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(async () => {
      try {
        const res = await fetch("${testPerPostUrl}", { credentials: "include" });
        return { status: res.status, json: await res.json() };
      } catch (e) {
        return { error: e.message };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  console.log("\n=== TEST REWARD ANALYTICS PER POST WITH FILTER ===");
  console.log(JSON.stringify(perPostRes.result?.value, null, 2));

  ws.close();
  process.exit(0);
}

main().catch(console.error);

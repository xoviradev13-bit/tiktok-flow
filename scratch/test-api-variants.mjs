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

  // First check: what query params does TikTok actually require for reward_analytics_per_post?
  // Let's test calling with aid=1988 or default query params
  const res = await send("Runtime.evaluate", {
    expression: `(async () => {
      const tests = {};
      // Test 1: plain fetch
      try {
        const r1 = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0", { credentials: "include" });
        tests.plain = { status: r1.status, body: await r1.json() };
      } catch (e) { tests.plain = { error: e.message }; }

      // Test 2: with aid=1988 & app_name=tiktok_activity
      try {
        const r2 = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics_per_post?aid=1988&app_name=tiktok_activity&page=0", { credentials: "include" });
        tests.withAid = { status: r2.status, body: await r2.json() };
      } catch (e) { tests.withAid = { error: e.message }; }

      // Test 3: with filter JSON
      try {
        const filter = encodeURIComponent(JSON.stringify({
          video_analytics_display_time_range: 1,
          video_analytics_sort_by_type: 3,
          video_analytics_programs: [9]
        }));
        const r3 = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics_per_post?aid=1988&app_name=tiktok_activity&page=0&video_analytics_filter=" + filter, { credentials: "include" });
        tests.withFilterAndAid = { status: r3.status, body: await r3.json() };
      } catch (e) { tests.withFilterAndAid = { error: e.message }; }

      return tests;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("TEST RESULTS:\n", JSON.stringify(res.result.value, null, 2));
  ws.close();
}

main().catch(console.error);

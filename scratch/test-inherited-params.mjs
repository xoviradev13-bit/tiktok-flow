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

  const testRes = await send("Runtime.evaluate", {
    expression: `(async () => {
      const entries = performance.getEntriesByType('resource').map(e => e.name);
      const baseRewardUrl = entries.find(u => u.includes('/m10n_center/reward_analytics?') || u.includes('reward_analytics_per_post?'));
      if (!baseRewardUrl) return { error: "No base reward url found" };

      const u = new URL(baseRewardUrl);
      u.pathname = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post";
      u.searchParams.set("page", "0");
      u.searchParams.set("video_analytics_filter", JSON.stringify({
        video_analytics_display_time_range: 1,
        video_analytics_sort_by_type: 3,
        video_analytics_programs: [9]
      }));

      const res = await fetch(u.toString(), { credentials: "include" });
      const json = await res.json();
      const payload = json.data || json;
      const list = payload.video_analytics_video_list || [];
      return {
        urlUsed: u.toString(),
        statusCode: json.status_code,
        statusMsg: json.status_msg,
        keys: Object.keys(json),
        activePrograms: payload.video_analytics_active_programs,
        activeProgramNames: payload.video_analytics_active_programs_names,
        videoCount: list.length,
        hasMore: payload.has_more,
        videos: list.slice(0, 5).map(v => ({
          id: v.video_id_str || v.video_id,
          title: v.video_name,
          reward: v.est_rewards?.formatted_no_symbol || v.est_rewards?.formatted,
          programs: v.video_analytics_programs
        }))
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("TEST WITH INHERITED PARAMS:\n", JSON.stringify(testRes.result.value, null, 2));
  ws.close();
}

main().catch(console.error);

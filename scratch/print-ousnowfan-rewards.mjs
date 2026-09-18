import fs from "fs";

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

  const perfUrls = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      return performance.getEntriesByType('resource')
        .map(e => e.name)
        .filter(u => u.includes('reward_analytics_per_post'));
    })()`,
    returnByValue: true,
  });

  const exactUrl = perfUrls.result?.value?.[0];
  console.log("Using URL:", exactUrl);

  const callRes = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(async () => {
      try {
        const res = await fetch("${exactUrl}", { credentials: "include" });
        return await res.json();
      } catch (e) {
        return { error: e.message };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  fs.writeFileSync("scratch/ousnowfan_reward_analytics_per_post.json", JSON.stringify(callRes.result?.value, null, 2), "utf8");
  console.log("Saved raw response to scratch/ousnowfan_reward_analytics_per_post.json");

  const data = callRes.result?.value;
  const videos = data?.video_analytics_video_list || data?.data?.video_analytics_video_list || [];
  console.log(`\n=== EXTRACTED ${videos.length} REWARD POSTS FOR @ousnowfan ===\n`);

  videos.forEach((v, i) => {
    console.log(`[Video #${i + 1}]`);
    console.log(`  ID: ${v.video_id_str || v.video_id}`);
    console.log(`  Title: ${v.video_name}`);
    console.log(`  Estimated Rewards: ${v.est_rewards?.formatted || v.est_rewards?.value || v.est_rewards}`);
    console.log(`  RPM: ${v.rpm_metadata?.formatted || v.rpm_metadata?.value || v.rpm_metadata || "N/A"}`);
    console.log(`  Qualified Views (QUVV): ${v.quvv || "N/A"}`);
    console.log(`  Total Views: ${v.views || "N/A"}`);
    console.log(`  Duration: ${v.video_duration || "N/A"}s`);
    console.log(`  Published: ${v.publish_date_unix_time ? new Date(Number(v.publish_date_unix_time) * 1000).toLocaleString("vi-VN") : "N/A"}`);
    console.log(`  Cover: ${v.video_thumbnail || "N/A"}`);
    console.log(`  Program: ${v.program_name || v.m10n_project || "Creator Rewards Program"}`);
    console.log("");
  });

  ws.close();
  process.exit(0);
}

main().catch(console.error);

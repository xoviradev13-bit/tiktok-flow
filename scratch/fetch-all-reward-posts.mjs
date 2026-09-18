import fs from "fs";
import { execSync } from "child_process";

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
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const listRes = await fetch("http://127.0.0.1:63119/json/list");
  const list = await listRes.json();
  const target = list.find((t) => t.type === "page" && t.url.includes("tiktokstudio"));
  if (!target) {
    throw new Error("No tiktokstudio page found in CDP");
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  console.log("WebSocket connected to TikTok Studio!");

  // Extract recorded resource URLs from performance
  const perfUrls = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      return performance.getEntriesByType('resource')
        .map(e => e.name)
        .filter(u => u.includes('reward_analytics_per_post'));
    })()`,
    returnByValue: true,
  });

  const baseReqUrl = perfUrls.result?.value?.[0];
  console.log("Base request URL from TikTok Studio session:", baseReqUrl);

  const urlObj = new URL(baseReqUrl);
  let page = 0;
  let hasMore = true;
  const allVideos = [];

  while (hasMore && page < 20) {
    urlObj.searchParams.set("page", String(page));
    const targetFetchUrl = urlObj.toString();
    console.log(`Fetching page ${page}...`);

    const res = await sendCdp(ws, "Runtime.evaluate", {
      expression: `(async () => {
        try {
          const r = await fetch("${targetFetchUrl}", { credentials: "include" });
          return await r.json();
        } catch (e) {
          return { error: e.message };
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    const data = res.result?.value;
    const list = data?.video_analytics_video_list || data?.data?.video_analytics_video_list || [];
    console.log(`  Page ${page}: retrieved ${list.length} posts.`);

    if (list.length > 0) {
      allVideos.push(...list);
    }

    hasMore = !!(data?.has_more || data?.data?.has_more);
    if (!list.length) break;
    page++;
    await sleep(300);
  }

  console.log(`\n[OK] Total reward posts extracted: ${allVideos.length}`);

  // Fetch overview monetization summary
  const m10nSummaryUrls = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      return performance.getEntriesByType('resource')
        .map(e => e.name)
        .filter(u => u.includes('m10n_center/reward_analytics?') && !u.includes('per_post'));
    })()`,
    returnByValue: true,
  });

  let overviewData = null;
  if (m10nSummaryUrls.result?.value?.[0]) {
    const ov = await sendCdp(ws, "Runtime.evaluate", {
      expression: `(async () => {
        try {
          const r = await fetch("${m10nSummaryUrls.result.value[0]}", { credentials: "include" });
          return await r.json();
        } catch (e) {
          return null;
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    overviewData = ov.result?.value;
  }

  // Also query video_reward_analytics using the studio parameters template
  console.log("\nAttempting detailed video_reward_analytics for rewarded videos...");
  const detailedVideos = [];
  const rt = Math.floor(Date.now() / 1000);
  const rn = rt - 31536000;

  for (const v of allVideos) {
    const vid = v.video_id_str || String(v.video_id);
    let detail = null;

    // Use baseReqUrl params to build video_reward_analytics URL
    const itemUrlObj = new URL(baseReqUrl);
    itemUrlObj.pathname = "/tiktok/v1/creator/m10n_center/video_reward_analytics";
    itemUrlObj.searchParams.delete("page");
    itemUrlObj.searchParams.delete("video_analytics_filter");
    itemUrlObj.searchParams.set("video_id", vid);
    itemUrlObj.searchParams.set("start_date", String(rn));
    itemUrlObj.searchParams.set("end_date", String(rt));

    try {
      const itemRes = await sendCdp(ws, "Runtime.evaluate", {
        expression: `(async () => {
          try {
            const r = await fetch("${itemUrlObj.toString()}", { credentials: "include" });
            return await r.json();
          } catch (e) {
            return null;
          }
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      detail = itemRes.result?.value;
    } catch {}

    detailedVideos.push({
      ...v,
      detail: detail?.status_code === 0 ? detail : null,
    });
    await sleep(150);
  }

  const finalPayload = {
    account: "ousnowfan",
    totalCount: detailedVideos.length,
    overview: overviewData,
    videos: detailedVideos,
  };

  fs.writeFileSync("scratch/ousnowfan_final_rewards.json", JSON.stringify(finalPayload, null, 2), "utf8");
  console.log("Saved full data to scratch/ousnowfan_final_rewards.json");

  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

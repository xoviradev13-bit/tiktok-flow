import WebSocket from "ws";

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

const PROGRAM_ID_MAP = {
  1: "Quà tặng video (Video Gifts)",
  2: "Tiền boa (Tips)",
  3: "Creator Next",
  4: "Quỹ nhà sáng tạo (Creator Fund)",
  5: "TikTok Creator Marketplace",
  7: "Quà tặng LIVE (Live Gifts)",
  8: "TikTok Shop",
  9: "Chương trình Creator Rewards",
  10: "Series",
  12: "Quảng bá âm nhạc (Work with Artists)",
  13: "Đăng ký LIVE (Live Subscription)",
  14: "TikTok Creative Challenge",
  16: "Branded Mission",
};

// Numbers 0 through 21
const ALL_NUMERIC_PROGRAMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

async function main() {
  const listRes = await fetch("http://127.0.0.1:52512/json/list");
  const list = await listRes.json();
  const target = list.find((t) => t.type === "page" && t.url.includes("tiktok"));

  if (!target) {
    console.error("No TikTok page target found!");
    process.exit(1);
  }

  console.log("Connecting to target:", target.url);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  console.log("Connected to CDP via WebSocket!");

  // Execute multi-program separation logic
  const evalScript = `
    (async () => {
      const allNums = ${JSON.stringify(ALL_NUMERIC_PROGRAMS)};
      const results = {
        probe: null,
        activePrograms: [],
        programVideos: {}
      };

      // Step 1: Probe page 0 with ALL programs to discover active programs
      try {
        const probeFilter = encodeURIComponent(JSON.stringify({
          video_analytics_display_time_range: 1,
          video_analytics_sort_by_type: 3,
          video_analytics_programs: allNums
        }));
        const probeRes = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0&video_analytics_filter=" + probeFilter, { credentials: "include" });
        const probeJson = await probeRes.json();
        const pData = probeJson?.data || probeJson;
        results.activePrograms = pData?.video_analytics_active_programs || [];
        results.probe = {
          totalCount: pData?.video_analytics_video_list?.length || 0,
          hasMore: !!pData?.has_more,
          activePrograms: results.activePrograms
        };
      } catch (e) {
        results.probeError = e.message;
      }

      // Step 2: Query each program in isolation
      const targetPrograms = results.activePrograms.length > 0 ? results.activePrograms : [9];
      for (const progId of targetPrograms) {
        results.programVideos[progId] = [];
        let p = 0;
        let keepGoing = true;
        while (keepGoing && p < 10) {
          try {
            const filterStr = encodeURIComponent(JSON.stringify({
              video_analytics_display_time_range: 1,
              video_analytics_sort_by_type: 3,
              video_analytics_programs: [progId]
            }));
            const r = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=" + p + "&video_analytics_filter=" + filterStr, { credentials: "include" });
            const j = await r.json();
            const data = j?.data || j;
            const list = data?.video_analytics_video_list || [];
            for (const v of list) {
              results.programVideos[progId].push(v);
            }
            keepGoing = !!data?.has_more;
            if (!list.length) break;
            p++;
          } catch (e) {
            break;
          }
        }
      }

      return results;
    })()
  `;

  console.log("Running isolated query evaluation...");
  const rawResult = await sendCdp(ws, "Runtime.evaluate", {
    expression: evalScript,
    awaitPromise: true,
    returnByValue: true,
  });

  const data = rawResult.result?.value;
  console.log("\n--- PROBE SUMMARY ---");
  console.log("Active Programs detected:", data.activePrograms);
  console.log("Probe Data:", data.probe);

  console.log("\n--- PROGRAM BREAKDOWN ---");
  let grandTotalReward = 0;
  let totalVideoEntries = 0;

  for (const [progId, videos] of Object.entries(data.programVideos)) {
    const progName = PROGRAM_ID_MAP[progId] || "Program " + progId;
    let progReward = 0;
    console.log(`\n======================================================`);
    console.log(`PROGRAM ID ${progId}: ${progName} (${videos.length} videos)`);
    console.log(`======================================================`);

    videos.forEach((v, idx) => {
      const money = v.est_rewards || {};
      const amt = money.formatted_no_symbol ? parseFloat(money.formatted_no_symbol) || 0 : 0;
      progReward += amt;
      totalVideoEntries += 1;
      const isPunished = (v.video_analytics_programs || []).some((p) => p.is_punished);
      console.log(`  ${idx + 1}. [ID: ${v.video_id_str || v.video_id}] $${amt.toFixed(2)} | Views: ${v.views || 0} | Punished: ${isPunished} | ${v.video_name.slice(0, 45)}...`);
    });

    console.log(`--> Total Rewards for ${progName}: $${progReward.toFixed(2)}`);
    grandTotalReward += progReward;
  }

  console.log(`\n******************************************************`);
  console.log(`GRAND TOTAL: ${totalVideoEntries} entries across programs | Total Earnings: $${grandTotalReward.toFixed(2)}`);
  console.log(`******************************************************`);

  ws.close();
  process.exit(0);
}

main().catch(console.error);

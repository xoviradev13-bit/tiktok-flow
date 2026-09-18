import WebSocket from "ws";

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

const ALL_M10N_PROGRAMS = [
  "M10N_PROGRAM_UNSPECIFIED", "M10N_PROGRAM_VIDEO_GIFTS", "M10N_PROGRAM_TIPS",
  "M10N_PROGRAM_CREATOR_NEXT", "M10N_PROGRAM_CREATOR_FUND", "M10N_PROGRAM_TIKTOK_CREATOR_MARKETPLACE",
  "M10N_PROGRAM_SHOUTOUTS", "M10N_PROGRAM_LIVE_GIFTS", "M10N_PROGRAM_TIKTOK_SHOP",
  "M10N_PROGRAM_CREATOR_INCENTIVES", "M10N_PROGRAM_SERIES", "M10N_PROGRAM_TIKTOK_SHOP_MERCHANT",
  "M10N_PROGRAM_MUSIC_PROMOTION", "M10N_PROGRAM_LIVE_SUBSCRIPTION", "M10N_PROGRAM_TIKTOK_CREATIVE_CHALLENGE",
  "M10N_PROGRAM_TIKTOK_GAMING_REWARD", "M10N_PROGRAM_TIKTOK_BRANDED_MISSION", "M10N_PROGRAM_TIKTOK_LOCAL_SERVICE",
  "M10N_PROGRAM_GO_LIVE_INCENTIVE", "M10N_PROGRAM_GO_LIVE_LEADS", "M10N_PROGRAM_SOUNDON", "M10N_PROGRAM_GO_LIVE_SMB",
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21
];

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

  const evaluationResult = await send("Runtime.evaluate", {
    expression: `(async () => {
      const entries = performance.getEntriesByType('resource').map(e => e.name);
      const baseReqUrl = entries.find(u => u.includes('/m10n_center/reward_analytics?') || u.includes('reward_analytics_per_post?'))
        || "/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0";

      const extra = [];
      let activeProgramIds = [];
      const allPrograms = ${JSON.stringify(ALL_M10N_PROGRAMS)};

      // 1. Probe page 0 to discover all active programs for this account
      try {
        const probeUrl = new URL(baseReqUrl, window.location.origin);
        probeUrl.pathname = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post";
        probeUrl.searchParams.set("page", "0");
        probeUrl.searchParams.set("video_analytics_filter", JSON.stringify({
          video_analytics_display_time_range: 1,
          video_analytics_sort_by_type: 3,
          video_analytics_programs: allPrograms,
        }));
        const probeRes = await fetch(probeUrl.toString(), { credentials: "include" });
        const probeJson = await probeRes.json();
        const probePayload = probeJson?.data || probeJson;
        if (Array.isArray(probePayload?.video_analytics_active_programs) && probePayload.video_analytics_active_programs.length > 0) {
          activeProgramIds = probePayload.video_analytics_active_programs;
        }
        const probeList = probePayload?.video_analytics_video_list || [];
        if (probeList.length > 0 && activeProgramIds.length <= 1) {
          const singleProgId = activeProgramIds[0] || 9;
          for (const item of probeList) {
            item._queried_program_id = singleProgId;
            extra.push(item);
          }
        }
      } catch (e) {}

      // 2. If multiple programs exist, query each program separately
      if (activeProgramIds.length > 1) {
        for (const progId of activeProgramIds) {
          let p = 0;
          let keepGoing = true;
          while (keepGoing && p < 20) {
            try {
              const u = new URL(baseReqUrl, window.location.origin);
              u.pathname = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post";
              u.searchParams.set("page", String(p));
              u.searchParams.set("video_analytics_filter", JSON.stringify({
                video_analytics_display_time_range: 1,
                video_analytics_sort_by_type: 3,
                video_analytics_programs: [progId],
              }));
              const r = await fetch(u.toString(), { credentials: "include" });
              const j = await r.json();
              const payload = j?.data || j;
              const list = payload?.video_analytics_video_list || [];
              for (const item of list) {
                item._queried_program_id = progId;
                extra.push(item);
              }
              keepGoing = !!payload?.has_more;
              if (!list.length) break;
              p++;
            } catch {
              break;
            }
          }
        }
      } else {
        // Single program: paginate remaining pages
        let p = 1;
        let keepGoing = true;
        const targetProgId = activeProgramIds[0] || 9;
        while (keepGoing && p < 25) {
          try {
            const u = new URL(baseReqUrl, window.location.origin);
            u.pathname = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post";
            u.searchParams.set("page", String(p));
            u.searchParams.set("video_analytics_filter", JSON.stringify({
              video_analytics_display_time_range: 1,
              video_analytics_sort_by_type: 3,
              video_analytics_programs: [targetProgId],
            }));
            const r = await fetch(u.toString(), { credentials: "include" });
            const j = await r.json();
            const payload = j?.data || j;
            const list = payload?.video_analytics_video_list || [];
            for (const item of list) {
              item._queried_program_id = targetProgId;
              extra.push(item);
            }
            keepGoing = !!payload?.has_more;
            if (!list.length) break;
            p++;
          } catch {
            break;
          }
        }
      }

      return {
        activeProgramIds,
        totalItems: extra.length,
        items: extra
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  const res = evaluationResult.result.value;
  console.log("Active Program IDs detected:", res.activeProgramIds);
  console.log("Total Raw Items retrieved:", res.totalItems);

  // Deduplicate and separate exactly as agent.js
  const seenKeys = new Set();
  const postRewards = [];

  for (const item of res.items) {
    const money = item.est_rewards || {};
    const amt = money.formatted_no_symbol ? parseFloat(money.formatted_no_symbol) || 0 : 0;
    const progId = item._queried_program_id || 9;
    const progName = PROGRAM_ID_MAP[progId] || `Program ${progId}`;
    const key = `${item.video_id_str || item.video_id}_${progId}`;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      postRewards.push({
        id: item.video_id_str || String(item.video_id),
        title: item.video_name,
        reward: amt,
        views: item.views || 0,
        programId: progId,
        programName: progName,
        postDate: item.publish_date_formatted || null,
        isPunished: (item.video_analytics_programs || []).some((p) => p.is_punished)
      });
    }
  }

  // Summary per program
  console.log(`\n==================================================================`);
  console.log(`TOTAL UNIQUE VIDEO-PROGRAM ENTRIES: ${postRewards.length}`);
  console.log(`==================================================================`);

  const byProgram = {};
  for (const item of postRewards) {
    if (!byProgram[item.programName]) {
      byProgram[item.programName] = { count: 0, totalRevenue: 0, videos: [] };
    }
    byProgram[item.programName].count += 1;
    byProgram[item.programName].totalRevenue += item.reward;
    byProgram[item.programName].videos.push(item);
  }

  for (const [progName, summary] of Object.entries(byProgram)) {
    console.log(`\nPROGRAM: ${progName}`);
    console.log(`  - Total Videos: ${summary.count}`);
    console.log(`  - Total Earnings: $${summary.totalRevenue.toFixed(2)}`);
    console.log(`  - Detailed Video List:`);
    summary.videos.forEach((v, idx) => {
      console.log(`    ${String(idx + 1).padStart(2, " ")}. [ID: ${v.id}] $${v.reward.toFixed(2).padStart(5, " ")} | Views: ${String(v.views).padStart(6, " ")} | Date: ${v.postDate} | Punished: ${v.isPunished ? "YES" : "NO "} | ${v.title.slice(0, 50)}...`);
    });
  }

  ws.close();
  process.exit(0);
}

main().catch(console.error);

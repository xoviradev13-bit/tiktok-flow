import { chromium } from "playwright-core";
import fs from "fs";

const PROFILE_ID = "500a1071-8dd2-43dd-9685-220721b0c4a4";
const GPM_BASE = "http://127.0.0.1:9495/api/v1";

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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  let port = null;
  for (const p of [52512, 51737]) {
    try {
      const v = await fetch(`http://127.0.0.1:${p}/json/version`);
      if (v.ok) { port = p; break; }
    } catch {}
  }

  if (!port) {
    console.log(`[1] Starting profile ${PROFILE_ID} via GPM API with proxy...`);
    const startRes = await fetch(`${GPM_BASE}/profiles/start/${PROFILE_ID}?skip_proxy_check=true`);
    const startJson = await startRes.json();
    port = startJson?.data?.remote_debugging_port;

    if (!port) {
      console.error("GPM start failed:", startJson);
      process.exit(1);
    }
  } else {
    console.log(`[1] Profile already running on port ${port}!`);
  }

  console.log(`[2] GPM Browser requested on port ${port}. Waiting for CDP to be ready...`);
  let cdpReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const v = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (v.ok) {
        cdpReady = true;
        console.log("CDP port is ready!");
        break;
      }
    } catch { }
    await sleep(1000);
  }

  if (!cdpReady) {
    console.error("CDP port failed to open in time.");
    process.exit(1);
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes("tiktok")) || (await context.newPage());

  console.log("[3] Navigating to monetization item page...");
  await page.goto("https://www.tiktok.com/tiktokstudio/monetization/item/7672354204966456598/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).catch(() => {});

  await sleep(4000);

  console.log("[4] Executing isolated program query routine inside session...");
  const evaluationResult = await page.evaluate(async ({ allPrograms, programIdMap }) => {
    const perfUrls = performance.getEntriesByType("resource")
      .map(e => e.name)
      .filter(u => u.includes("reward_analytics_per_post"));

    const baseReqUrl = perfUrls[0] || "/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0";
    const extra = [];
    let activeProgramIds = [];

    // Step 1: Probe page 0 to discover active programs
    try {
      const probeUrl = new URL(baseReqUrl, window.location.origin);
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
    } catch (e) {
      return { error: "Probe error: " + e.message };
    }

    // Step 2: Separate queries per program
    if (activeProgramIds.length > 1) {
      for (const progId of activeProgramIds) {
        let p = 0;
        let keepGoing = true;
        while (keepGoing && p < 20) {
          try {
            const u = new URL(baseReqUrl, window.location.origin);
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
      // Single program (Creator Rewards): paginate remaining pages with [targetProgId]
      let p = 1;
      let keepGoing = true;
      const targetProgId = activeProgramIds[0] || 9;
      while (keepGoing && p < 25) {
        try {
          const u = new URL(baseReqUrl, window.location.origin);
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
      totalRawItems: extra.length,
      items: extra
    };
  }, { allPrograms: ALL_M10N_PROGRAMS, programIdMap: PROGRAM_ID_MAP });

  console.log("\n[5] Evaluation Result:");
  if (evaluationResult.error) {
    console.error("Evaluation error:", evaluationResult.error);
    process.exit(1);
  }

  console.log("Active Program IDs detected by TikTok:", evaluationResult.activeProgramIds);
  console.log("Total Raw Items retrieved:", evaluationResult.totalRawItems);

  // Map and separate items exactly as agent.js does
  const seenKeys = new Set();
  const postRewards = [];

  for (const item of evaluationResult.items) {
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
        isPunished: (item.video_analytics_programs || []).some(p => p.is_punished)
      });
    }
  }

  // Summary per program
  console.log(`\n--- FINAL SEPARATED REWARDS RESULT ---`);
  console.log(`Total Unique Video-Program Entries: ${postRewards.length}`);

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
    console.log(`\n========================================`);
    console.log(`PROGRAM: ${progName}`);
    console.log(`  - Video Count: ${summary.count}`);
    console.log(`  - Total Earnings: $${summary.totalRevenue.toFixed(2)}`);
    console.log(`  - List of Videos:`);
    summary.videos.forEach((v, idx) => {
      console.log(`    ${idx + 1}. [ID: ${v.id}] Date: ${v.postDate} | Reward: $${v.reward.toFixed(2)} | Views: ${v.views} | ${v.title.slice(0, 45)}...`);
    });
  }

  console.log("\n[6] Disconnecting from CDP...");
  await browser.close();

  console.log("[7] Stopping GPM profile...");
  await fetch(`${GPM_BASE}/profiles/stop/${PROFILE_ID}`);
  console.log("Done!");
}

main().catch(console.error);

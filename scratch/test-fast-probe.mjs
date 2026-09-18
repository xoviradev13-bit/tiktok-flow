import { chromium } from "playwright-core";

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:52512");
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes("tiktok"));
  console.log("Found Page:", page.url());

  const res = await page.evaluate(async () => {
    try {
      const url = "/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0&video_analytics_filter=" + encodeURIComponent(JSON.stringify({
        video_analytics_display_time_range: 1,
        video_analytics_sort_by_type: 3,
        video_analytics_programs: [9]
      }));
      const r = await fetch(url, { credentials: "include" });
      const j = await r.json();
      return {
        status: r.status,
        hasData: !!j.data,
        activePrograms: j.data?.video_analytics_active_programs,
        videoCount: j.data?.video_analytics_video_list?.length,
        firstVideo: j.data?.video_analytics_video_list?.[0]?.video_name,
        firstReward: j.data?.video_analytics_video_list?.[0]?.est_rewards
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log("Result:", JSON.stringify(res, null, 2));
}

main().catch(console.error);

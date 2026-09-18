import fs from "fs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const rawData = JSON.parse(fs.readFileSync("scratch/ousnowfan_final_rewards.json", "utf8"));
  const videos = rawData.videos || [];

  console.log(`Processing ${videos.length} videos from dataset...`);

  const mappedPostRewards = videos.map((v: any) => {
    const d = v.detail?.crp_analytics_data;
    const estRewards =
      v.est_rewards?.formatted_no_symbol ||
      d?.total_rewards?.formatted_no_symbol ||
      (typeof v.est_rewards === "number" ? String(v.est_rewards) : "0");

    const rpmVal =
      d?.rpm_metadata?.rpm_integer !== undefined
        ? (Number(d.rpm_metadata.rpm_integer) / 100).toFixed(2)
        : (v.rpm_metadata?.value ? String(v.rpm_metadata.value) : "0.00");

    const quvvVal =
      d?.quvv_metadata?.quvv !== undefined
        ? Number(d.quvv_metadata.quvv)
        : (v.quvv ? Number(v.quvv) : 0);

    const pubTime = v.publish_date_unix_time
      ? new Date(Number(v.publish_date_unix_time) * 1000).toISOString()
      : null;

    return {
      id: String(v.video_id_str || v.video_id || ""),
      title: v.video_name || "Untitled",
      rewards: parseFloat(estRewards) || 0,
      currency: v.est_rewards?.currency?.symbol || "$",
      currencyCode: v.est_rewards?.currency?.code || "USD",
      rpm: parseFloat(rpmVal) || 0,
      views: Number(v.views) || 0,
      qualifiedViews: quvvVal,
      publishDate: pubTime,
      coverUrl: v.video_thumbnail || null,
      duration: v.video_duration ? Math.round(Number(v.video_duration)) : null,
      program: v.video_analytics_programs?.[0]?.program_name || "Creator Rewards Program",
      dailyRewards: d?.daily_rewards || [],
      countryRatios: d?.rpm_metadata?.quvv_country_ratios || [],
    };
  });

  // Calculate sum of rewards
  const totalRewardsUsd = mappedPostRewards.reduce((sum: number, p: any) => sum + (p.rewards || 0), 0);

  const account = await prisma.tiktokAccount.findFirst({
    where: { username: { contains: "ousnowfan", mode: "insensitive" } },
    include: { analytics: true },
  });

  if (!account) {
    console.error("Account ousnowfan not found in DB!");
    process.exit(1);
  }

  await prisma.accountAnalytics.upsert({
    where: { accountId: account.id },
    update: {
      postRewards: mappedPostRewards,
      currency: "USD",
    },
    create: {
      accountId: account.id,
      postRewards: mappedPostRewards,
      currency: "USD",
    },
  });

  console.log(`[SUCCESS] Updated database for @${account.username}!`);
  console.log(`Total Post Rewards saved: ${mappedPostRewards.length}`);
  console.log(`Sum of Post Rewards: $${totalRewardsUsd.toFixed(2)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error saving to DB:", err);
  process.exit(1);
});

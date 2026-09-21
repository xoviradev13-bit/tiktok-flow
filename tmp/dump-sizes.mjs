import fs from "fs";

const p =
  process.argv[2] ||
  "client-agent/test-results/run-2026-09-20T21-48-41-337Z/profiles/ousnowfan__500a1071.full.json";
const raw = JSON.parse(fs.readFileSync(p, "utf8"));
const d = raw.data || raw;
const keys = [
  "username",
  "videosList",
  "postRewards",
  "sumViews",
  "sumRevenue",
  "dailyViewsBreakdown",
  "insightsHistory",
  "revenueBreakdown",
  "dailyRevenueBreakdown",
  "topVideos365d",
];
for (const k of keys) {
  const v = d[k];
  let size;
  if (v == null) size = "null";
  else if (Array.isArray(v)) size = `arr(${v.length}) bytes=${JSON.stringify(v).length}`;
  else if (typeof v === "object") size = `obj bytes=${JSON.stringify(v).length}`;
  else size = typeof v;
  console.log(k, size);
}
console.log("totalJson", JSON.stringify(d).length);

import fs from "fs";

const apis = JSON.parse(fs.readFileSync("scratch/studio_home_apis.json", "utf-8"));

const targetUrls = [
  "getHashCount",
  "multiGetFollowRelationCount",
  "analytics/insights",
  "manage/item_list",
  "reward_analytics",
  "api/web/user"
];

for (const a of apis) {
  for (const t of targetUrls) {
    if (a.url.includes(t)) {
      console.log("=== URL ===", a.url);
      console.log(JSON.stringify(a.full, null, 2).slice(0, 800));
      console.log("\n");
      break;
    }
  }
}

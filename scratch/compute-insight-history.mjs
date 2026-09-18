import fs from "fs";

const apis = JSON.parse(fs.readFileSync("scratch/studio_home_apis.json", "utf-8"));

for (const a of apis) {
  if (a.url.includes("vv_history")) {
    console.log("Found insight history API!");
    const data = a.full;
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        const vals = data[key].map(x => x.value || 0);
        const last7 = vals.slice(-7);
        const prev7 = vals.slice(-14, -7);
        const sumLast7 = last7.reduce((a, b) => a + b, 0);
        const sumPrev7 = prev7.reduce((a, b) => a + b, 0);
        console.log(`${key}:`);
        console.log(`  All (${vals.length}):`, vals);
        console.log(`  Last 7 sum: ${sumLast7}, Prev 7 sum: ${sumPrev7}, Diff: ${sumLast7 - sumPrev7}`);
      }
    }
  }
}

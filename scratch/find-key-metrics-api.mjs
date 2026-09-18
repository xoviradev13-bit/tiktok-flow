import fs from "fs";

const apis = JSON.parse(fs.readFileSync("scratch/studio_home_apis.json", "utf-8"));

for (const a of apis) {
  const s = JSON.stringify(a.full || "");
  if (s.includes("2168") || s.includes("2468") || s.includes("2500") || (s.includes("shares") && s.includes("11")) || a.url.includes("analytics/insights")) {
    console.log("Found match URL:", a.url);
    if (a.full && a.full !== "TOO_LARGE") {
      console.log(JSON.stringify(a.full, null, 2).slice(0, 1500));
    }
  }
}

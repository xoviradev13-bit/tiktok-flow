import fs from "fs";

const apis = JSON.parse(fs.readFileSync("scratch/studio_home_apis.json", "utf-8"));

// Studio numbers:
// Video views: 2.5K, diff -137 (-5.1%)
// Profile views: 7, diff -6 (-46.2%)
// Likes: 42, diff -26 (-38.2%)
// Comments: 3, diff +2 (200.0%)
// Shares: 11, diff +4 (57.1%)

for (const a of apis) {
  const str = typeof a.full === "string" ? a.full : JSON.stringify(a.full);
  if (str.includes("42") && str.includes("-26")) {
    console.log("Found exact match for Likes (42, -26) in API:", a.url);
    console.log(JSON.stringify(a.full, null, 2).slice(0, 1000));
  } else if (str.includes("-137") || str.includes("-5.1%")) {
    console.log("Found exact match for Views diff in API:", a.url);
    console.log(JSON.stringify(a.full, null, 2).slice(0, 1000));
  }
}

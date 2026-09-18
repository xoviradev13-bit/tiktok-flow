import fs from "fs";

const apis = JSON.parse(fs.readFileSync("scratch/studio_home_apis.json", "utf-8"));

console.log("Total APIs captured:", apis.length);

for (const a of apis) {
  const s = JSON.stringify(a.full || "");
  const hasStats = s.includes("300800") || s.includes("301") || s.includes("469") || s.includes("2168") || s.includes("overview") || s.includes("metric");
  if (hasStats || a.url.includes("studio") || a.url.includes("home") || a.url.includes("overview") || a.url.includes("metric") || a.url.includes("creator")) {
    console.log(`URL: ${a.url.slice(0, 100)}`);
    console.log(`Sample: ${s.slice(0, 200)}...`);
    console.log("-".repeat(50));
  }
}

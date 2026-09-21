import {
  extractProfileStudio,
  getGpmStoragePath,
  getChromeExecutablePath,
} from "./agent.js";
import fs from "fs";
import path from "path";

const TARGET_HANDLE = "ousnowfan";
const storagePath = getGpmStoragePath();
const chromePath = getChromeExecutablePath();

console.log("============================================================");
console.log("  TEST: Top Videos 365d for @ousnowfan");
console.log("============================================================");
console.log("[*] Storage:", storagePath);

const sessDir = process.env.LOCALAPPDATA + "\\TikTokFlow\\sessions";
const sessionFiles = fs.existsSync(sessDir)
  ? fs.readdirSync(sessDir).filter(f => f.endsWith(".json"))
  : [];

// Sort by most recently updated session first
const profileIds = sessionFiles
  .map(f => {
    const id = f.replace(".json", "");
    try {
      const data = JSON.parse(fs.readFileSync(path.join(sessDir, f), "utf8"));
      return { id, at: data.at || 0 };
    } catch { return { id, at: 0 }; }
  })
  .sort((a, b) => b.at - a.at)
  .map(x => x.id);

console.log("[*] Trying", profileIds.length, "profiles with cached sessions...\n");

let found = false;
for (let i = 0; i < profileIds.length; i++) {
  const profileId = profileIds[i];
  const profileDir = path.join(storagePath, profileId, "Default");
  if (!fs.existsSync(profileDir)) {
    console.log("[" + (i+1) + "/" + profileIds.length + "] " + profileId.slice(0,8) + " - no Default dir, skip");
    continue;
  }

  console.log("[" + (i+1) + "/" + profileIds.length + "] Trying " + profileId.slice(0,8) + "...");

  const result = await extractProfileStudio(profileDir, profileId, chromePath, null).catch(err => ({ success: false, error: err.message }));

  if (!result.success) {
    console.log("    -> Failed:", result.error);
    continue;
  }

  const username = (result.data.username || "").toLowerCase();
  console.log("    -> @" + result.data.username);

  if (username === TARGET_HANDLE.toLowerCase()) {
    found = true;
    const d = result.data;
    console.log("\n[FOUND] @" + d.username + " — " + (d.followersCount || 0).toLocaleString() + " followers");
    console.log("============================================================");

    const tv = d.topVideos365d;
    if (!tv) {
      console.log("[!] topVideos365d = null");
      console.log("    insight_type 107/108/109 may not be correct.");
      console.log("    Open TikTok Studio > Analytics > Content tab in DevTools");
      console.log("    Network filter: 'insights' — check the actual insight_type values.");
    } else {
      console.log("\n[TOP-VIDEOS 365d] fetchedAt:", tv.fetchedAt);
      console.log("\n  Nhieu luot xem nhat (" + tv.mostViews.length + " videos):");
      tv.mostViews.forEach(function(v) {
        console.log("    #" + v.rank, '"' + (v.title || "").slice(0,50) + '"', "- views:", (v.viewsInRange||0).toLocaleString(), "| posted:", v.postedOn);
      });
      console.log("\n  Nhieu nguoi xem moi nhat (" + tv.mostNewViewers.length + " videos):");
      tv.mostNewViewers.forEach(function(v) {
        console.log("    #" + v.rank, '"' + (v.title || "").slice(0,50) + '"', "- new viewers:", (v.newViewersInRange||0).toLocaleString(), "| posted:", v.postedOn);
      });
      console.log("\n  Nhieu luot thich nhat (" + tv.mostLikes.length + " videos):");
      tv.mostLikes.forEach(function(v) {
        console.log("    #" + v.rank, '"' + (v.title || "").slice(0,50) + '"', "- likes:", (v.likesInRange||0).toLocaleString(), "| posted:", v.postedOn);
      });
      console.log("\n[RAW topVideos365d JSON]:");
      console.log(JSON.stringify(tv, null, 2));
    }
    break;
  }
}

if (!found) console.log("\n[!] @ousnowfan not found across all profiles.");
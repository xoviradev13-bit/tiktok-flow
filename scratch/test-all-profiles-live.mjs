import path from "path";
import fs from "fs";
import {
  extractProfileStudio,
  getGpmStoragePath,
  getChromeExecutablePath,
  readGpmProfileMetaFromDisk,
  findTikTokHandleInProfileAsync,
} from "../client-agent/agent.js";

async function run() {
  const storageRoot = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();

  console.log("=== COMPREHENSIVE TEST ON ALL PROFILES/ACCOUNTS ===");
  console.log(`Storage root: ${storageRoot}`);
  console.log(`Chrome path: ${chromePath}\n`);

  const allDirs = fs.readdirSync(storageRoot)
    .filter(d => /^[0-9a-f-]{36}$/i.test(d))
    .sort();

  console.log(`Discovered ${allDirs.length} GPM profile folders on disk.\n`);

  const results = [];

  for (let i = 0; i < allDirs.length; i++) {
    const profileId = allDirs[i];
    const fullDir = path.join(storageRoot, profileId);
    const meta = readGpmProfileMetaFromDisk(storageRoot, profileId);
    const diskHandle = await findTikTokHandleInProfileAsync(fullDir);
    const cookiePath = path.join(fullDir, "Default", "Network", "Cookies");
    const cookieDbExists = fs.existsSync(cookiePath);
    const cookieDbSize = cookieDbExists ? fs.statSync(cookiePath).size : 0;

    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[${i + 1}/${allDirs.length}] Profile: ${profileId.slice(0, 8)} | Name: "${meta.name || 'N/A'}" | Handle: @${diskHandle || 'unknown'} | CookieDb: ${cookieDbSize > 0 ? (cookieDbSize/1024).toFixed(1) + ' KB' : 'None'}`);

    if (!cookieDbExists || cookieDbSize === 0) {
      console.log(`   -> Skipping extraction: No cookie database found (profile never launched or empty).`);
      results.push({
        profileId,
        name: meta.name || null,
        handle: diskHandle,
        status: "NO_COOKIE_DB",
        reason: "Profile has no Default/Network/Cookies file",
      });
      continue;
    }

    const t0 = Date.now();
    try {
      console.log(`   -> Starting extraction via Tier 3 Minimal Snapshot...`);
      const res = await Promise.race([
        extractProfileStudio(fullDir, profileId, chromePath, diskHandle),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout 50s")), 50000)),
      ]);

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      if (res.success && res.data) {
        console.log(`   [SUCCESS] in ${elapsed}s: @${res.data.username} | Followers: ${res.data.followersCount} | Views: ${res.data.totalViews} | Revenue: ${res.data.currency}${res.data.totalRevenue} | PostRewards: ${res.data.postRewards?.length || 0}`);
        results.push({
          profileId,
          name: meta.name || null,
          username: res.data.username,
          followers: res.data.followersCount,
          totalViews: res.data.totalViews,
          revenue: res.data.totalRevenue,
          currency: res.data.currency,
          status: "EXTRACTED_SUCCESS",
          elapsedSeconds: parseFloat(elapsed),
        });

        if (res.data.username?.toLowerCase() === "ousnowfan" || profileId === "500a1071-8dd2-43dd-9685-220721b0c4a4") {
          fs.writeFileSync("ousnowfan_data.json", JSON.stringify(res.data, null, 2), "utf8");
          console.log(`   [OK] Wrote fresh full data to ousnowfan_data.json`);
        }
      } else {
        console.log(`   [UNAUTHENTICATED / INACTIVE] in ${elapsed}s: ${res.error}`);
        results.push({
          profileId,
          name: meta.name || null,
          handle: diskHandle,
          status: "NOT_LOGGED_IN_OR_EXPIRED",
          error: res.error,
          elapsedSeconds: parseFloat(elapsed),
        });
      }
    } catch (err) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`   [ERROR] in ${elapsed}s: ${err.message}`);
      results.push({
        profileId,
        name: meta.name || null,
        handle: diskHandle,
        status: "ERROR",
        error: err.message,
        elapsedSeconds: parseFloat(elapsed),
      });
    }
  }

  console.log(`\n================================================================================`);
  console.log("FINAL SUMMARY ACROSS ALL PROFILES:");
  console.table(results);

  fs.writeFileSync("scratch/all_profiles_test_summary.json", JSON.stringify(results, null, 2), "utf8");
  console.log("Summary saved to scratch/all_profiles_test_summary.json");
}

run().catch(console.error);

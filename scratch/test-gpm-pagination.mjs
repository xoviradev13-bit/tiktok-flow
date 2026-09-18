import { discoverGpmApiBase, fetchAllGpmProfiles } from "../client-agent/agent.js";

async function main() {
  console.log("Discovering GPM API...");
  const gpmApi = await discoverGpmApiBase();
  console.log("GPM API status:", gpmApi);

  if (!gpmApi.online) {
    console.error("GPM API is offline!");
    process.exit(1);
  }

  console.log("Fetching all GPM profiles with full pagination...");
  const t0 = performance.now();
  const profiles = await fetchAllGpmProfiles(gpmApi.base);
  const dur = ((performance.now() - t0) / 1000).toFixed(2);

  console.log(`Retrieved ${profiles.length} total profiles in ${dur}s`);
  if (profiles.length > 0) {
    console.log("Sample profile #1:", { id: profiles[0].id, name: profiles[0].name });
    console.log(`Sample profile #${profiles.length}:`, { id: profiles[profiles.length - 1].id, name: profiles[profiles.length - 1].name });
  }
}

main().catch(console.error);

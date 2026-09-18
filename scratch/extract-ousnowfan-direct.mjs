import path from "path";
import { extractProfileStudio } from "../client-agent/agent.js";

async function main() {
  const profileDir = "D:\\Tiktok automation\\500a1071-8dd2-43dd-9685-220721b0c4a4";
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const chromePath = "C:\\Users\\datng\\AppData\\Roaming\\GPMLoginGlobal\\Browsers\\ChromiumCore_v151\\chrome.exe";
  const detectedHandle = "ousnowfan";

  console.log("Starting extractProfileStudio for ousnowfan...");
  const startTime = Date.now();
  const res = await extractProfileStudio(profileDir, profileId, chromePath, detectedHandle);
  console.log(`Finished in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log("Success:", res?.success);
  if (!res?.success) {
    console.log("Error:", res?.error);
  } else {
    console.log("Username:", res.data?.username);
    console.log("Total Revenue:", res.data?.totalRevenue);
    console.log("Currency:", res.data?.currency);
    console.log("Post Rewards count:", res.data?.postRewards?.length);
    console.log("\nFull postRewards:");
    console.log(JSON.stringify(res.data?.postRewards, null, 2));
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
});

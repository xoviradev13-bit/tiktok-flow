import "dotenv/config";
import path from "path";
import { extractProfileStudio, getChromeExecutablePath, getGpmStoragePath } from "../client-agent/agent.js";

async function main() {
  const storagePath = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const testId = "30dabc91-9f51-49e9-9b6b-007d4c086b3b";
  const profileDir = path.join(storagePath, testId);

  console.log("Testing extractProfileStudio on:", profileDir);
  console.log("Chrome Path:", chromePath);

  const res = await extractProfileStudio(profileDir, testId, chromePath, null);
  console.log("Result:", JSON.stringify(res, null, 2));
}

main().catch(console.error);

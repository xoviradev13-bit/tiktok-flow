import path from "path";
import fs from "fs";
import { getGpmStoragePath, getChromeExecutablePath } from "../client-agent/agent.js";

async function run() {
  const storage = getGpmStoragePath();
  const chrome = getChromeExecutablePath();
  console.log("Storage:", storage);
  console.log("Chrome:", chrome);

  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const profileDir = path.join(storage, profileId);
  console.log("Profile dir exists?", fs.existsSync(profileDir), profileDir);

  // Check GPM API
  try {
    const res = await fetch("http://127.0.0.1:9495/api/v1/profiles");
    const json = await res.json();
    console.log("GPM API profiles count:", json?.data?.length);
    const p = (json?.data || []).find(x => x.id === profileId || x.raw_id === profileId || String(x.name).includes("2492"));
    console.log("Found profile in GPM API:", p);
  } catch (e) {
    console.log("GPM API error:", e.message);
  }
}

run();

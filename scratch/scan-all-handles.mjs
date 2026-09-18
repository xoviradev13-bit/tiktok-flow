import path from "path";
import fs from "fs";
import { findTikTokHandleInProfile, getGpmStoragePath } from "../client-agent/agent.js";

const storageRoot = getGpmStoragePath();
const dirs = fs.readdirSync(storageRoot, { withFileTypes: true })
  .filter(e => e.isDirectory() && /^[0-9a-f-]{36}$/i.test(e.name));

console.log(`Found ${dirs.length} profile directories.`);
for (const d of dirs) {
  const full = path.join(storageRoot, d.name);
  const handle = findTikTokHandleInProfile(full);
  console.log(`Profile ${d.name} -> Handle: ${handle || "None"}`);
}

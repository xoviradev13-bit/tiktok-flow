/**
 * Replay one extract dump into /api/extension/report to surface the 500 cause.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "client-agent", "config.json"), "utf8"));

const dumpPath =
  process.argv[2] ||
  path.join(
    root,
    "client-agent/test-results/run-2026-09-20T21-48-41-337Z/profiles/ousnowfan__500a1071.full.json"
  );

const raw = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
const d = raw.data || raw;

const serverUrl = config.serverUrl || "http://localhost:3000";

async function getBearer() {
  // Prefer exchange pairing code if present
  if (config.pairingCode) {
    const res = await fetch(`${serverUrl}/api/agent/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: config.pairingCode }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`exchange ${res.status}: ${JSON.stringify(json)}`);
    return json.accessToken;
  }
  if (config.personalToken) return config.personalToken;
  if (config.accessToken) return config.accessToken;
  throw new Error("No pairingCode/personalToken/accessToken in client-agent/config.json");
}

const bearer = await getBearer();
const body = {
  ...d,
  source: "agent",
  metricsSource: "agent",
  flagsVersion: 1,
};
delete body.memberEmail;

console.log("posting", {
  username: d.username,
  videos: Array.isArray(d.videosList) ? d.videosList.length : 0,
  postRewards: Array.isArray(d.postRewards) ? d.postRewards.length : 0,
  bytes: JSON.stringify(body).length,
});

const res = await fetch(`${serverUrl}/api/extension/report`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
  },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 2000));

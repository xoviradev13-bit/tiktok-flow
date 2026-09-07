import fs from "fs";
import path from "path";

async function testGpm() {
  console.log("🔍 Scanning for active GPMLogin Local API...");

  const testPorts = [9495, 19995, 19996, 8000, 8080, 9222, 50325];
  let found = false;

  for (const port of testPorts) {
    // 1. Test v1 (/api/v1/profiles)
    try {
      const urlV1 = `http://127.0.0.1:${port}/api/v1/profiles?page=1&page_size=5`;
      const res = await fetch(urlV1, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const json = await res.json();
        console.log(`\n🎉 SUCCESS! Connected to GPMLogin API v1 on port ${port}:`);
        console.log(`URL: http://127.0.0.1:${port}/api/v1`);
        console.log(`Response:`, JSON.stringify(json, null, 2));
        found = true;
        break;
      }
    } catch (e) {}

    // 2. Test v2 (/v2/profiles or /api/v2/profiles)
    try {
      const urlV2 = `http://127.0.0.1:${port}/v2/profiles`;
      const res = await fetch(urlV2, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const json = await res.json();
        console.log(`\n🎉 SUCCESS! Connected to GPMLogin API v2 on port ${port}:`);
        console.log(`URL: http://127.0.0.1:${port}/v2`);
        console.log(`Response:`, JSON.stringify(json, null, 2));
        found = true;
        break;
      }
    } catch (e) {}
  }

  // Check if GPM port file exists in AppData
  const localAppData = process.env.LOCALAPPDATA || "";
  const possiblePaths = [
    path.join(localAppData, "GPMLogin", "http.port"),
    path.join(localAppData, "GPM-Login", "http.port"),
    path.join(localAppData, "Programs", "GPMLogin", "http.port"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const portVal = fs.readFileSync(p, "utf-8").trim();
        console.log(`\n📄 Found GPMLogin http.port file at: ${p}`);
        console.log(`Active Port in file: ${portVal}`);
      } catch (e) {}
    }
  }

  if (!found) {
    console.log("\n⚠️ GPMLogin application is currently not open or Local API is not enabled.");
    console.log("👉 Please make sure:");
    console.log("1. Open the GPMLogin application on your computer.");
    console.log("2. In GPMLogin -> Settings -> Enable Local API (Default port: 9495 or 19995).");
  }
}

testGpm();

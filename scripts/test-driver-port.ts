import { gpmClient } from "../src/lib/gpm-api";

async function testGpmDriver() {
  const profiles = await gpmClient.listProfiles();
  const profileId = profiles!.data[0].id;
  console.log("Starting profile with GPM API...");
  const startResult = await gpmClient.startProfile(profileId, { skipProxyCheck: true });
  console.log("Start response:", startResult);

  if (!startResult?.remote_debugging_port) return;
  const port = startResult.remote_debugging_port;

  // Test WebDriver status
  for (const endpoint of ["/status", "/json/version", "/json", "/"]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${endpoint}`);
      console.log(`Endpoint ${endpoint} status: ${res.status}`);
      const text = await res.text();
      console.log(`Endpoint ${endpoint} response: ${text.substring(0, 300)}`);
    } catch (e: any) {
      console.log(`Endpoint ${endpoint} failed: ${e.message}`);
    }
  }
}

testGpmDriver();

import { gpmClient } from "../src/lib/gpm-api";

async function testStart() {
  console.log("Checking profiles...");
  const profiles = await gpmClient.listProfiles();
  console.log("Profiles:", JSON.stringify(profiles, null, 2));

  if (!profiles?.data?.length) {
    console.log("No profiles found.");
    return;
  }

  const profileId = profiles.data[0].id;
  console.log(`Starting profile ${profileId}...`);
  const startResult = await gpmClient.startProfile(profileId, { skipProxyCheck: true });
  console.log("Start result:", JSON.stringify(startResult, null, 2));

  if (startResult) {
    console.log(`Remote debugging port: ${startResult.remote_debugging_port}`);
    // Check if we can reach http://127.0.0.1:${startResult.remote_debugging_port}/json/version
    const port = startResult.remote_debugging_port;
    if (port) {
      for (let i = 0; i < 10; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/json/version`);
          if (res.ok) {
            const ver = await res.json();
            console.log("Found Chrome version endpoint:", ver);
            break;
          }
        } catch (e: any) {
          console.log(`Attempt ${i + 1}: port not ready yet (${e.message})`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }
}

testStart().catch(console.error);

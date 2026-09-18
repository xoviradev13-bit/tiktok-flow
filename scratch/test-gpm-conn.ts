import { gpmClient, readGpmConfiguredApiPort } from "../src/lib/gpm-api";

async function main() {
  const cfgPort = readGpmConfiguredApiPort();
  console.log("Configured GPM API Port:", cfgPort);

  const status = await gpmClient.checkConnection();
  console.log("GPM Connection Status:", status);

  if (status.isOnline) {
    const profiles = await gpmClient.listProfiles();
    console.log("Found profiles:", profiles?.data?.length);
    const p2492 = (profiles?.data || []).find(p => p.name?.includes("2492") || p.id === "500a1071-8dd2-43dd-9685-220721b0c4a4");
    console.log("Profile 2492:", p2492);
  }
}

main().catch(err => console.error("Error:", err));

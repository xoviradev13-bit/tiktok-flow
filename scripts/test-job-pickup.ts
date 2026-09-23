// Test job pickup by hitting the actual API endpoints the same way the dashboard does
const SERVER = "https://tiktok-flow-sigma.vercel.app";
const TOKEN = "ttf_sec_12f9e2382aa496c8927846b722bce4c6";

async function post(url: string, body: Record<string, unknown>) {
  const res = await fetch(`${SERVER}${url}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function get(url: string) {
  const res = await fetch(`${SERVER}${url}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.json();
}

async function main() {
  console.log("=== Step 1: Trigger syncAll via dashboard action ===");
  const trigger = await post("/api/gpm/sync", { syncAll: false });
  console.log("POST /api/gpm/sync status:", trigger.status);
  console.log("Response:", JSON.stringify(trigger.data, null, 2));

  console.log("\n=== Step 2: Check active job via dashboard poll ===");
  const dashboard = await get("/api/gpm/sync");
  console.log("activeJob:", JSON.stringify(dashboard.activeJob, null, 2));
  console.log("isSyncing:", dashboard.isSyncing);

  console.log("\n=== Step 3: Check via agent poll (client-sync) ===");
  const agentPoll = await get("/api/gpm/client-sync");
  console.log("syncJob:", JSON.stringify(agentPoll.syncJob, null, 2));

  if (agentPoll.syncJob?.id) {
    const jobId = agentPoll.syncJob.id;
    console.log(`\n[+] Job ${jobId} is visible to agent! Polling for 30s...`);

    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await get("/api/gpm/client-sync");
      const t = new Date().toLocaleTimeString("en-GB");
      console.log(`[${t}] Poll ${i+1}: syncJob=${JSON.stringify(poll.syncJob)}`);
      if (!poll.syncJob || poll.syncJob.status !== "PENDING") {
        console.log("[!] Job no longer PENDING — agent may have claimed or it timed out");
        break;
      }
    }
  } else {
    console.log("[!] syncJob is null in agent poll - job not visible to agent OR not created");
  }
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });

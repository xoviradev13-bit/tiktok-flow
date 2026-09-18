async function checkActiveGpm() {
  const res = await fetch("http://127.0.0.1:9495/api/v3/profiles").then(r => r.json()).catch(console.error);
  if (!res || !res.data) {
    console.log("No data from GPM");
    return;
  }
  console.log("Total GPM profiles:", res.data.length);
  for (const p of res.data) {
    // Check if profile is active or has remote debugging port
    if (p.remote_debugging_address || p.status === "running" || p.name?.toLowerCase().includes("ousnowfan") || p.id?.includes("500a1071")) {
      console.log(`Profile: ${p.name} | ID: ${p.id} | Status: ${p.status} | Debug: ${p.remote_debugging_address || p.port || "N/A"}`);
    }
  }
}

checkActiveGpm().catch(console.error);

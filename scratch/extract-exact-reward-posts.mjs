async function sendCdp(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const listRes = await fetch("http://127.0.0.1:63119/json/list");
  const list = await listRes.json();
  const target = list.find((t) => t.type === "page" && t.url.includes("tiktokstudio"));
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  // Get the exact full URL that was called by TikTok Studio!
  const perfUrls = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      return performance.getEntriesByType('resource')
        .map(e => e.name)
        .filter(u => u.includes('reward_analytics_per_post'));
    })()`,
    returnByValue: true,
  });

  console.log("Found reward_analytics_per_post URL:", perfUrls.result?.value);
  const exactUrl = perfUrls.result?.value?.[0];

  if (!exactUrl) {
    console.error("No exact URL found!");
    process.exit(1);
  }

  // Call exact URL in page!
  console.log("Calling exact URL in-session...");
  const callRes = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(async () => {
      try {
        const res = await fetch("${exactUrl}", { credentials: "include" });
        return { status: res.status, json: await res.json() };
      } catch (e) {
        return { error: e.message };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  console.log("\n================ FULL REWARD_ANALYTICS_PER_POST API RESULT ================");
  console.log(JSON.stringify(callRes.result?.value, null, 2));

  // Also get full overview:
  const overviewUrls = await sendCdp(ws, "Runtime.evaluate", {
    expression: `(() => {
      return performance.getEntriesByType('resource')
        .map(e => e.name)
        .filter(u => u.includes('m10n_center/reward_analytics?') || u.includes('m10n_center/all_programs'));
    })()`,
    returnByValue: true,
  });
  console.log("\nOverview URLs:", overviewUrls.result?.value);

  if (overviewUrls.result?.value?.[0]) {
    const ovRes = await sendCdp(ws, "Runtime.evaluate", {
      expression: `(async () => {
        try {
          const res = await fetch("${overviewUrls.result.value[0]}", { credentials: "include" });
          return { status: res.status, json: await res.json() };
        } catch (e) {
          return { error: e.message };
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log("\n================ OVERVIEW REWARDS RESULT ================");
    console.log(JSON.stringify(ovRes.result?.value, null, 2));
  }

  ws.close();
  process.exit(0);
}

main().catch(console.error);

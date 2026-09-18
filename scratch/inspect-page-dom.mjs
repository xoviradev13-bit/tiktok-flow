import WebSocket from "ws";

async function main() {
  const listRes = await fetch("http://127.0.0.1:52512/json/list");
  const list = await listRes.json();
  const target = list.find((t) => t.type === "page" && t.url.includes("tiktok"));

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.once("open", r));

  const res = await new Promise((resolve) => {
    const id = 123;
    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) resolve(msg.result);
    });
    ws.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: {
        expression: "JSON.stringify({ url: window.location.href, title: document.title, text: document.body.innerText.slice(0, 300) })",
        returnByValue: true
      }
    }));
  });

  console.log("Page State:", JSON.parse(res.result.value));
  ws.close();
}

main().catch(console.error);

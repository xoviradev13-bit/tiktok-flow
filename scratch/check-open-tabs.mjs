import { chromium } from "playwright-core";

async function run() {
  const b = await chromium.connectOverCDP("http://127.0.0.1:63119");
  const pages = b.contexts()[0].pages();
  console.log("Pages count:", pages.length);
  for (let i = 0; i < pages.length; i++) {
    console.log(`Page ${i}: ${pages[i].url()} | Title: ${await pages[i].title()}`);
  }
  process.exit(0);
}

run().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});

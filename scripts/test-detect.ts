import { detectTikTokAccountFromGpm } from "../src/lib/tiktok-extractor";

async function test() {
  const res = await detectTikTokAccountFromGpm("80d8f999-e7f6-4f06-bb33-15896a70b332");
  console.log("Detection result:", JSON.stringify(res, null, 2));
}

test();

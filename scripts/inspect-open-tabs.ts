import fs from "fs";
import path from "path";

const sessionsDir = "D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332\\Default\\Sessions";
const files = fs.readdirSync(sessionsDir);

for (const file of files) {
  const fullPath = path.join(sessionsDir, file);
  try {
    const stat = fs.statSync(fullPath);
    if (stat.size > 0) {
      const buf = fs.readFileSync(fullPath);
      const text = buf.toString("latin1");
      const urls = text.match(/https?:\/\/[a-zA-Z0-9_./?=&%#-]+/g) || [];
      const uniqueUrls = Array.from(new Set(urls));
      console.log(`\nURLs in ${file} (${stat.size} bytes):`);
      for (const u of uniqueUrls) {
        if (u.includes("tiktok") || u.includes("google") || u.length > 15) {
          console.log("  -", u);
        }
      }
    }
  } catch (e: any) {
    console.log(`Could not read ${file}: ${e.message}`);
  }
}

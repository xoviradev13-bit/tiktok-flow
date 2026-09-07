import fs from "fs";
import path from "path";

const levelDbDir = "D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332\\Default\\Local Storage\\leveldb";

console.log("Reading LevelDB files in:", levelDbDir);
const files = fs.readdirSync(levelDbDir);
for (const f of files) {
  if (f.endsWith(".log") || f.endsWith(".ldb")) {
    const full = path.join(levelDbDir, f);
    const buf = fs.readFileSync(full);
    const str = buf.toString("latin1");
    if (str.includes("tiktok") || str.includes("dat.nguyen6284")) {
      console.log(`\n📄 Found in ${f} (size: ${buf.length}):`);
      // Look for JSON or user objects
      const matches = str.match(/\{[^{}]*"uniqueId"[^{}]*\}/g);
      if (matches) {
        console.log("uniqueId matches:", matches);
      }
      const userMatches = str.match(/\{[^{}]*"user"[^{}]*\}/g);
      if (userMatches) {
        console.log("user matches:", userMatches.slice(0, 3));
      }
      // Look for dat.nguyen6284
      let idx = 0;
      while ((idx = str.indexOf("dat.nguyen6284", idx)) !== -1) {
        console.log("Snippet:", str.substring(Math.max(0, idx - 100), Math.min(str.length, idx + 200)).replace(/[\x00-\x1f]/g, " "));
        idx += 50;
      }
    }
  }
}

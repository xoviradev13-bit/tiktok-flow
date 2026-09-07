import fs from "fs";
import path from "path";

const cookiesDb = "D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332\\Default\\Network\\Cookies";

console.log("Cookies DB exists:", fs.existsSync(cookiesDb));
if (fs.existsSync(cookiesDb)) {
  const buf = fs.readFileSync(cookiesDb);
  console.log("Cookies DB size:", buf.length);
  const str = buf.toString("latin1");
  // Find cookie names for tiktok
  const matches = str.match(/[a-zA-Z0-9_-]{3,30}/g) || [];
  const knownCookies = ["sessionid", "sessionid_ss", "sid_tt", "uid_tt", "tt_chain_token", "passport_csrf_token"];
  for (const c of knownCookies) {
    if (str.includes(c)) {
      console.log(`Found cookie name in DB: ${c}`);
    }
  }
}

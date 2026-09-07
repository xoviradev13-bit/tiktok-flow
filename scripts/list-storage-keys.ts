import fs from "fs";

const buf = fs.readFileSync("D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332\\Default\\Local Storage\\leveldb\\000012.log");
const str = buf.toString("latin1");

const re = /_https:\/\/www\.tiktok\.com\x00\x01([^\x00]+)/g;
let m;
const keys = new Set();
while ((m = re.exec(str)) !== null) {
  keys.add(m[1]);
}
console.log("TikTok Local Storage Keys:", Array.from(keys));

import fs from "fs";

for (const file of ["000005.ldb", "000013.ldb", "000012.log"]) {
  const full = `D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332\\Default\\Local Storage\\leveldb\\${file}`;
  if (!fs.existsSync(full)) continue;
  const buf = fs.readFileSync(full);
  const str = buf.toString("utf8");
  let idx = 0;
  while ((idx = str.indexOf("dat.nguyen6284", idx)) !== -1) {
    console.log(`[${file}] Snippet at ${idx}:`);
    console.log(str.substring(Math.max(0, idx - 150), Math.min(str.length, idx + 400)).replace(/[\x00-\x1f]/g, " "));
    idx += 50;
  }
}

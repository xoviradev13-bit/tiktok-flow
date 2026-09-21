import fs from "fs";
import path from "path";
import { readGpmProfileMetaFromDisk, getGpmStoragePath } from "../client-agent/agent.js";

const storage = getGpmStoragePath();
console.log("storage", storage);

const dirs = fs.existsSync(storage)
  ? fs.readdirSync(storage).filter((n) => {
      try {
        return fs.statSync(path.join(storage, n)).isDirectory();
      } catch {
        return false;
      }
    })
  : [];

const named5404 = [];
for (const id of dirs) {
  const meta = readGpmProfileMetaFromDisk(storage, id);
  if (
    (meta.name && /5404/i.test(meta.name)) ||
    (meta.groupName && /test\s*1/i.test(meta.groupName))
  ) {
    named5404.push({ id, ...meta });
  }
}
console.log("profiles matching 5404 or test 1:", named5404);

// Also scan all names containing Profile
const sample = [];
for (const id of dirs.slice(0, 200)) {
  const meta = readGpmProfileMetaFromDisk(storage, id);
  if (meta.name) sample.push({ id: id.slice(0, 8), name: meta.name, group: meta.groupName });
}
console.log("sample with names", sample.filter((s) => /5404|hong|minh/i.test(s.name + (s.group || ""))));
console.log("total dirs", dirs.length, "named sample size", sample.length);

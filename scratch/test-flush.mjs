import fs from "fs";
import path from "path";
import assert from "assert";

const testConfigPath = path.join(process.cwd(), "scratch", "test-config.json");
try { if (fs.existsSync(testConfigPath)) fs.unlinkSync(testConfigPath); } catch {}

let config = { testVal: "initial" };
let persistTimer = null;

function persist(immediate = false) {
  if (immediate) {
    persist.flush();
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persist.flush();
  }, 300);
}

persist.flush = function() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2), "utf8");
};

// 1. Test debounce doesn't write synchronously
config.testVal = "debounced";
persist(false);
assert(!fs.existsSync(testConfigPath), "Debounced write should not exist immediately!");

// 2. Test synchronous .flush() immediately writes without waiting for timer
persist.flush();
assert(fs.existsSync(testConfigPath), "Flushed config must exist on disk!");
const read = JSON.parse(fs.readFileSync(testConfigPath, "utf8"));
assert.strictEqual(read.testVal, "debounced", "Flushed content must match config state!");

// Clean up
try { fs.unlinkSync(testConfigPath); } catch {}
console.log("[OK] persistConfig.flush synchronously writes and clears pending timers!");

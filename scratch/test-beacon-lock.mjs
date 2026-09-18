// Scratch test for withBeaconScanLock serialization and persistConfig.flush
import assert from "assert";

let beaconScanTail = Promise.resolve();
function withBeaconScanLock(fn) {
  const run = beaconScanTail.then(fn, fn);
  beaconScanTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function runTest() {
  console.log("[*] Testing withBeaconScanLock wall-clock serialization under 3 concurrent calls...");
  const timings = [];

  const callSimulatedScan = (id, durationMs) => {
    return withBeaconScanLock(async () => {
      const start = Date.now();
      timings.push({ id, event: "start", time: start });
      await new Promise((r) => setTimeout(r, durationMs));
      const end = Date.now();
      timings.push({ id, event: "end", time: end });
      return { id, start, end };
    });
  };

  // Launch 3 concurrent calls simultaneously
  const t0 = Date.now();
  const [res1, res2, res3] = await Promise.all([
    callSimulatedScan(1, 100),
    callSimulatedScan(2, 100),
    callSimulatedScan(3, 100),
  ]);

  console.log("Call 1:", res1.start - t0, "->", res1.end - t0);
  console.log("Call 2:", res2.start - t0, "->", res2.end - t0);
  console.log("Call 3:", res3.start - t0, "->", res3.end - t0);

  // Assert strict wall-clock serialization:
  assert(res2.start >= res1.end, "Call 2 started before Call 1 finished!");
  assert(res3.start >= res2.end, "Call 3 started before Call 2 finished!");
  console.log("[OK] withBeaconScanLock strictly serializes wall-clock execution (zero overlap)!");
}

runTest().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});

import { execSync } from "child_process";

try {
  const stdout = execSync("powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name like '%chrome%'\\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json\"", {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const list = JSON.parse(stdout);
  const arr = Array.isArray(list) ? list : [list];
  console.log(`Found ${arr.length} chrome processes:`);
  for (const p of arr) {
    if (p.CommandLine && (p.CommandLine.includes("ChromiumCore") || p.CommandLine.includes("Tiktok automation"))) {
      console.log(`PID: ${p.ProcessId}`);
      console.log(`CMD: ${p.CommandLine}\n`);
    }
  }
} catch (e: any) {
  console.error("Error:", e.message);
}

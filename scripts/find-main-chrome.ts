import { execSync } from "child_process";

const stdout = execSync("powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name like '%chrome%'\\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json\"", {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});

const list = JSON.parse(stdout);
const arr = Array.isArray(list) ? list : [list];
for (const p of arr) {
  if (p.CommandLine && p.CommandLine.includes("Tiktok automation") && !p.CommandLine.includes("--type=")) {
    console.log(`MAIN BROWSER PID: ${p.ProcessId}`);
    console.log(`COMMAND LINE:\n${p.CommandLine}\n`);
  }
}

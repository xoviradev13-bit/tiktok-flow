import { execSync } from "child_process";

const out = execSync("powershell -Command \"Get-Process chrome | Select-Object Id\"", { encoding: "utf8" });
console.log("All chrome PIDs:\n", out);

const pids = out.trim().split("\n").map(l => l.trim()).filter(l => /^\d+$/.test(l));

for (const pid of pids) {
  try {
    const cmd = execSync(`powershell -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine"`, { encoding: "utf8" }).trim();
    if (cmd.includes("500a1071-8dd2-43dd-9685-220721b0c4a4")) {
      console.log(`MATCH PID ${pid}: ${cmd.slice(0, 120)}...`);
    }
  } catch (e) {}
}

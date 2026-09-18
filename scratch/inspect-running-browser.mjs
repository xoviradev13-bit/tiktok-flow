import { execSync } from "child_process";

const cmd = 'wmic process where "name=\'chrome.exe\'" get ProcessId,CommandLine /format:list';
try {
  const out = execSync(cmd).toString();
  const procs = out.split("\n\n").filter(Boolean);
  for (const p of procs) {
    if (p.includes("Tiktok automation") || p.includes("ChromiumCore")) {
      const lines = p.trim().split("\n");
      const cl = lines.find(l => l.startsWith("CommandLine="));
      const pid = lines.find(l => l.startsWith("ProcessId="));
      if (cl && !cl.includes("--type=")) {
        console.log(`[MAIN] ${pid}`);
        console.log(`  CMD: ${cl.slice(0, 300)}`);
      }
    }
  }
} catch (e) {
  console.error(e);
}

import { execSync } from "child_process";

const out = execSync("wmic process where \"name='chrome.exe'\" get ProcessId,CommandLine /format:list").toString();
for (const b of out.split("\n\n")) {
  if (b.includes("ChromiumCore")) {
    const cl = b.split("\n").find(l => l.startsWith("CommandLine="));
    const pid = b.split("\n").find(l => l.startsWith("ProcessId="));
    console.log(pid, cl?.slice(0, 180));
  }
}

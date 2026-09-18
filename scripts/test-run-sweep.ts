import "dotenv/config";
import { execSync } from "child_process";

console.log("=== RUNNING CLIENT-AGENT IN TEST MODE ===");
try {
  const out = execSync("node client-agent/agent.js", {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120000,
  });
  console.log("Agent Output:\n", out);
} catch (err: any) {
  console.error("Agent Error:\n", err.stdout || err.message);
}

import fs from "fs";
import path from "path";
import readline from "readline";

const CONVERSATION_ID = "3fb2b205-a06a-463c-b33c-ad0d7272a091";
const LOG_PATH = `C:\\Users\\datng\\.gemini\\antigravity-ide\\brain\\${CONVERSATION_ID}\\.system_generated\\logs\\transcript_full.jsonl`;
const FALLBACK_LOG_PATH = `C:\\Users\\datng\\.gemini\\antigravity-ide\\brain\\${CONVERSATION_ID}\\.system_generated\\logs\\transcript.jsonl`;
const OUTPUT_FILE = path.join(process.cwd(), "CONVERSATION_HISTORY.md");

async function exportConversation() {
  const filePath = fs.existsSync(LOG_PATH) ? LOG_PATH : FALLBACK_LOG_PATH;
  if (!fs.existsSync(filePath)) {
    console.error(`Transcript file not found at ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading transcript from: ${filePath}`);
  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const out = fs.createWriteStream(OUTPUT_FILE, { encoding: "utf8" });

  out.write(`# Full Conversation History Export\n\n`);
  out.write(`- **Conversation ID:** \`${CONVERSATION_ID}\`\n`);
  out.write(`- **Exported At:** ${new Date().toLocaleString()}\n`);
  out.write(`- **Project:** StreamDash / TikTok Automation\n\n`);
  out.write(`---\n\n`);

  let messageCount = 0;
  let currentAssistantText = "";

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);

      // 1. User Message
      if (entry.type === "USER_INPUT" && entry.content) {
        // Clean out system metadata tags
        let text = entry.content;
        const match = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        if (match) {
          text = match[1].trim();
        } else {
          text = text
            .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, "")
            .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, "")
            .trim();
        }

        if (text) {
          messageCount++;
          const time = entry.created_at ? new Date(entry.created_at).toLocaleString() : "";
          out.write(`\n### 👤 User (${time})\n\n${text}\n\n---\n`);
        }
      }

      // 2. Model Response Text
      if (entry.type === "PLANNER_RESPONSE" && entry.content) {
        const text = entry.content.trim();
        if (text) {
          messageCount++;
          const time = entry.created_at ? new Date(entry.created_at).toLocaleString() : "";
          out.write(`\n### 🤖 Assistant (${time})\n\n${text}\n\n---\n`);
        }
      }
    } catch {
      // ignore parse errors on fragmented lines
    }
  }

  out.end(() => {
    console.log(`\nSuccessfully exported ${messageCount} messages to:\n${OUTPUT_FILE}`);
  });
}

exportConversation().catch(console.error);

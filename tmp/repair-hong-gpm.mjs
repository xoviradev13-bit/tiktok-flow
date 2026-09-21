import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";
import {
  findTikTokHandleInProfileAsync,
  getGpmStoragePath,
} from "../client-agent/agent.js";
import { isPlausibleTikTokHandle } from "../src/lib/tiktok-handle.ts";
import path from "path";

const PROFILE_ID = "b255d876-c886-450f-a4a8-3451206b9346";
const PORT = 9495; // same as other accounts on this workstation

const storage = getGpmStoragePath();
const rawHandle = await findTikTokHandleInProfileAsync(
  path.join(storage, PROFILE_ID)
);
console.log("raw disk handle:", rawHandle);
console.log("plausible?", isPlausibleTikTokHandle(rawHandle));
console.log("hong.minh3808 plausible?", isPlausibleTikTokHandle("hong.minh3808"));

const hong = await prisma.tiktokAccount.findFirst({
  where: { username: "hong.minh3808" },
});
if (!hong) {
  console.error("hong.minh3808 not found");
  process.exit(1);
}

const conflict = await prisma.tiktokAccount.findFirst({
  where: { gpmProfileId: PROFILE_ID, NOT: { id: hong.id } },
});
if (conflict) {
  console.error("UUID already on", conflict.username);
  process.exit(1);
}

const updated = await prisma.tiktokAccount.update({
  where: { id: hong.id },
  data: {
    gpmProfileId: PROFILE_ID,
    gpmProfileName: "Profile 5404",
    gpmPort: PORT,
  },
  select: {
    username: true,
    gpmProfileId: true,
    gpmProfileName: true,
    gpmPort: true,
    groupName: true,
  },
});

await prisma.accountLog.create({
  data: {
    accountId: hong.id,
    oldStatus: hong.status,
    newStatus: hong.status,
    logType: "STATUS_CHANGE",
    message: `[REPAIR] Gắn GPM Profile ${PROFILE_ID} (Profile 5404) + port ${PORT} — disk handle scrape trả về giá trị rác nên sync trước đó bỏ qua.`,
    actorName: "repair-script",
  },
});

console.log("repaired:", updated);
await prisma.$disconnect();

import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";
import path from "path";
import {
  findTikTokHandleInProfileAsync,
  getGpmStoragePath,
  readGpmProfileMetaFromDisk,
} from "../client-agent/agent.js";

const PROFILE_ID = "b255d876-c886-450f-a4a8-3451206b9346";
const storage = getGpmStoragePath();
const fullDir = path.join(storage, PROFILE_ID);
const meta = readGpmProfileMetaFromDisk(storage, PROFILE_ID);
const handle = await findTikTokHandleInProfileAsync(fullDir).catch((e) => ({
  error: e.message,
}));

console.log({ PROFILE_ID, meta, handleFromDisk: handle });

const byId = await prisma.tiktokAccount.findFirst({
  where: { gpmProfileId: PROFILE_ID },
  select: {
    username: true,
    gpmProfileId: true,
    gpmProfileName: true,
    gpmPort: true,
  },
});
console.log("account holding this gpmProfileId:", byId);

const hong = await prisma.tiktokAccount.findFirst({
  where: { username: "hong.minh3808" },
});
console.log("hong before repair:", {
  id: hong?.id,
  gpmProfileId: hong?.gpmProfileId,
  gpmProfileName: hong?.gpmProfileName,
  gpmPort: hong?.gpmPort,
  groupName: hong?.groupName,
});

await prisma.$disconnect();

import "dotenv/config";
import { resolveExtensionBearerAuth } from "../src/lib/extension-auth.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const token = "ttf_sec_dfc29fbb726ca308a2163c37e96df6aa";
  const authRes = await resolveExtensionBearerAuth(token, "/test");
  console.log("Auth:", authRes.ok, authRes.user?.email);

  const account = await prisma.tiktokAccount.findFirst({
    where: { username: "user008437433" },
  });
  console.log("Found account:", account?.id, account?.username);

  // Check if AccountAnalytics exists for it
  const analytics = await prisma.accountAnalytics.findUnique({
    where: { accountId: account!.id },
  });
  console.log("Existing analytics:", analytics);
}

main().catch(console.error);

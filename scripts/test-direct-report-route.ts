import "dotenv/config";
import { POST } from "../src/app/api/extension/report/route.js";

async function main() {
  const token = "ttf_sec_dfc29fbb726ca308a2163c37e96df6aa";
  const payload = {
    username: "user008437433",
    followersCount: 0,
    totalLikes: 0,
    totalViews: 0,
    videoCount: 0,
    totalVideos: 0,
    totalRevenue: 0,
    currency: "$",
    country: "US",
    rpm: null,
    videosList: [],
    sumRevenue: {
      revenue7d: 0,
      revenue28d: 0,
      revenue60d: 0,
      revenue365d: 0,
      totalRevenue: 0,
    },
    sumViews: {
      views7d: 0,
      views28d: 0,
      views60d: 0,
      views365d: 0,
      totalViews: 0,
    },
    sumLikes: {
      likes7d: 0,
      likes28d: 0,
      likes60d: 0,
      likes365d: 0,
      totalLikes: 0,
    },
    sumComments: {
      comments7d: 0,
      comments28d: 0,
      comments60d: 0,
      comments365d: 0,
    },
    sumShares: {
      shares7d: 0,
      shares28d: 0,
      shares60d: 0,
      shares365d: 0,
    },
    sumProfileViews: {
      profileViews7d: 0,
      profileViews28d: 0,
      profileViews60d: 0,
      profileViews365d: 0,
    },
    revenueBreakdown: null,
    dailyRevenueBreakdown: [],
    insightsHistory: null,
    isLoggedIn: true,
    gpmProfileId: "30dabc91-9f51-49e9-9b6b-007d4c086b3b",
    gpmProfileName: "Profile 4712",
    gpmGroupName: "test 2",
    source: "agent",
    metricsSource: "agent",
  };

  const req = new Request("http://localhost:3000/api/extension/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const res = await POST(req);
  console.log("Direct Route Status:", res.status);
  const data = await res.json();
  console.log("Direct Route Data:", JSON.stringify(data, null, 2));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

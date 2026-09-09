async function testNewReport() {
  const payload = {
    username: "dat.nguyen6284",
    nickname: "ceotelamonix | Founder @Telamonix @Wapp",
    avatarUrl: "https://example.com/avatar.jpg",
    followersCount: 6,
    followingCount: 14,
    totalLikes: 26,
    videoCount: 4,
    totalVideos: 4,
    totalViews: 334,
    viewsToday: 0,
    views7d: 0,
    views14d: 0,
    views30d: 0,
    totalRevenue: 0.00,
    rpm: 0.00,
    currency: "$",
    country: "US",
    isLoggedIn: true,
    gpmProfileId: "80d8f999-e7f6-4f06-bb33-15896a70b332",
    gpmProfileName: "Profile 3359",

    // 1. Key metrics
    profileViews: 0,
    commentsCount: 0,
    sharesCount: 0,

    // 2. Per-video metrics (views, likes, comments for each video)
    videosList: [
      {
        title: "# 🚀 WAPP - AI Central Hub: Your Gateway to AI-Powered...",
        views: 30,
        likes: 1,
        comments: 0,
        postDate: "Sep 19, 2024, 4:02 PM",
        privacy: "Everyone",
      },
      {
        title: "🚀 Introducing Wapp: The Future of Web-Based Code Editors!",
        views: 7,
        likes: 0,
        comments: 0,
        postDate: "Sep 19, 2024, 3:39 PM",
        privacy: "Everyone",
      },
      {
        title: "#construction #foundation #software #app #analysis",
        views: 125,
        likes: 2,
        comments: 0,
        postDate: "Dec 7, 2025, 11:54 AM",
        privacy: "Everyone",
      },
      {
        title: "#softwaredevelopment #cad #jwcad",
        views: 172,
        likes: 4,
        comments: 0,
        postDate: "Dec 7, 2025, 11:42 AM",
        privacy: "Everyone",
      },
    ],

    // 3. Most views video in 7, 28, 60, 365 days
    topVideos: {
      past7d: [],
      past28d: [],
      past60d: [],
      past365d: [
        {
          rank: 1,
          title: "#softwaredevelopment #cad #jwcad",
          viewsInRange: 172,
          allViews: 172,
          postedOn: "9mo ago",
        },
        {
          rank: 2,
          title: "#construction #foundation #software #app #analysis",
          viewsInRange: 125,
          allViews: 125,
          postedOn: "9mo ago",
        },
        {
          rank: 3,
          title: "# 🚀 WAPP - AI Central Hub: Your Gateway to AI-Powered...",
          viewsInRange: 30,
          allViews: 30,
          postedOn: "Sep 19, 2024",
        },
      ],
    },

    // 4. Revenue breakdown
    liveRewardsRevenue: 0.00,
    tiktokShopRevenue: 0.00,
    creatorRewardsRevenue: 0.00,
  };

  console.log("--> Testing POST http://localhost:3000/api/extension/report with new metrics...");
  const postRes = await fetch("http://localhost:3000/api/extension/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log("POST Status:", postRes.status);
  const postData = await postRes.json();
  console.log("POST Result:", JSON.stringify(postData, null, 2));

  console.log("\n--> Testing GET http://localhost:3000/api/extension/report?username=dat.nguyen6284 ...");
  const getRes = await fetch("http://localhost:3000/api/extension/report?username=dat.nguyen6284");
  console.log("GET Status:", getRes.status);
  const getData = await getRes.json();
  console.log("GET Result:", JSON.stringify(getData, null, 2));
}

testNewReport().catch(console.error);

async function checkTikTokUser(username: string) {
  console.log(`🔍 Fetching real TikTok data for @${username}...`);
  try {
    const res = await fetch(`https://www.tiktok.com/@${username}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const html = await res.text();
    console.log(`Response status: ${res.status}, body length: ${html.length}`);

    // Try finding __UNIVERSAL_DATA_FOR_REHYDRATION__
    const match = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );

    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      const userDetail =
        data["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;
      if (userDetail) {
        console.log("\n🎉 REAL TIKTOK DATA FOUND:");
        console.log("Username:", userDetail.user?.uniqueId);
        console.log("Nickname:", userDetail.user?.nickname);
        console.log("Follower count:", userDetail.stats?.followerCount);
        console.log("Following count:", userDetail.stats?.followingCount);
        console.log("Heart (likes) count:", userDetail.stats?.heartCount);
        console.log("Video count:", userDetail.stats?.videoCount);
        return {
          username: userDetail.user?.uniqueId,
          nickname: userDetail.user?.nickname,
          followerCount: userDetail.stats?.followerCount || 0,
          followingCount: userDetail.stats?.followingCount || 0,
          heartCount: userDetail.stats?.heartCount || 0,
          videoCount: userDetail.stats?.videoCount || 0,
        };
      }
    }

    // Try SIGI_STATE or __INIT_PROPS__
    const sigiMatch = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (sigiMatch && sigiMatch[1]) {
      const sigi = JSON.parse(sigiMatch[1]);
      console.log("SIGI User:", sigi.UserModule?.users);
      console.log("SIGI Stats:", sigi.UserModule?.stats);
    }

    console.log("No structured data found in SSR HTML");
  } catch (err: any) {
    console.error("Error fetching TikTok user:", err.message);
  }
}

checkTikTokUser("dat.nguyen6284");

function parseTikTokProfileHtml(innerText: string, videoLinks: string[]) {
  console.log("=== PARSING PROFILE DATA ===");
  console.log("Input text snippet:\n", innerText.substring(0, 400));

  // Regex for following, followers, likes supporting English and Vietnamese
  // Text pattern:
  // "0\nĐã follow\n1\nFollower\n1\nLượt thích"
  // or "0 Following\n1 Followers\n1 Likes"
  
  const parseNum = (str?: string) => {
    if (!str) return 0;
    const clean = str.trim();
    if (clean.endsWith("M") || clean.endsWith("m")) return Math.round(parseFloat(clean) * 1000000);
    if (clean.endsWith("K") || clean.endsWith("k")) return Math.round(parseFloat(clean) * 1000);
    return parseInt(clean.replace(/[^0-9]/g, ""), 10) || 0;
  };

  let following = 0;
  let followers = 0;
  let likes = 0;

  // Patterns
  const followingMatch = innerText.match(/([0-9.KMBkmb]+)\s*(?:Đã follow|Following|đang theo dõi)/i) ||
                         innerText.match(/(?:Đã follow|Following)\s*([0-9.KMBkmb]+)/i);
  if (followingMatch) following = parseNum(followingMatch[1]);

  const followersMatch = innerText.match(/([0-9.KMBkmb]+)\s*(?:Follower|Followers|Người theo dõi)/i) ||
                         innerText.match(/(?:Follower|Followers|Người theo dõi)\s*([0-9.KMBkmb]+)/i);
  if (followersMatch) followers = parseNum(followersMatch[1]);

  const likesMatch = innerText.match(/([0-9.KMBkmb]+)\s*(?:Lượt thích|Likes|Thích)/i) ||
                     innerText.match(/(?:Lượt thích|Likes|Thích)\s*([0-9.KMBkmb]+)/i);
  if (likesMatch) likes = parseNum(likesMatch[1]);

  // Video count
  const videoCount = videoLinks.length;

  console.log("Parsed:", { following, followers, likes, videoCount });
  return { following, followers, likes, videoCount };
}

const sample = `Dat Nguyen\ndat.nguyen6284\n0\nĐã follow\n1\nFollower\n1\nLượt thích\nChưa có tiểu sử.\n24\nĐăng nhập`;
const sampleLinks = ["https://www.tiktok.com/@dat.nguyen6284/video/7681871217019735303"];

parseTikTokProfileHtml(sample, sampleLinks);

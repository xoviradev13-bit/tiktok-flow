import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function testFullExtraction() {
  const sourceProfile = "D:\\Tiktok automation\\80d8f999-e7f6-4f06-bb33-15896a70b332";
  const tempProfile = path.join(os.tmpdir(), "gpm_full_extract_" + Date.now());
  fs.mkdirSync(path.join(tempProfile, "Default"), { recursive: true });

  const filesToCopy = [
    "Local State",
    "Default/Preferences",
    "Default/Secure Preferences",
    "Default/Network",
    "Default/Local Storage",
    "Default/Sessions",
  ];

  for (const item of filesToCopy) {
    const src = path.join(sourceProfile, item);
    const dst = path.join(tempProfile, item);
    try {
      if (fs.existsSync(src)) {
        fs.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
      }
    } catch (e) {}
  }

  const chromePath = getChromeExecutablePath();
  const context = await chromium.launchPersistentContext(tempProfile, {
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    viewport: { width: 1440, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.tiktok.com/@dat.nguyen6284", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForTimeout(6000);

  const extracted = await page.evaluate(`(() => {
    var text = document.body.innerText;
    
    function parseNum(str) {
      if (!str) return 0;
      var clean = str.trim();
      if (clean.endsWith("M") || clean.endsWith("m")) return Math.round(parseFloat(clean) * 1000000);
      if (clean.endsWith("K") || clean.endsWith("k")) return Math.round(parseFloat(clean) * 1000);
      return parseInt(clean.replace(/[^0-9]/g, ""), 10) || 0;
    }

    var following = 0;
    var followers = 0;
    var likes = 0;

    var followingMatch = text.match(/([0-9.KMBkmb]+)\\s*(?:Đã follow|Following|đang theo dõi)/i) ||
                         text.match(/(?:Đã follow|Following)\\s*([0-9.KMBkmb]+)/i);
    if (followingMatch) following = parseNum(followingMatch[1]);

    var followersMatch = text.match(/([0-9.KMBkmb]+)\\s*(?:Follower|Followers|Người theo dõi)/i) ||
                         text.match(/(?:Follower|Followers|Người theo dõi)\\s*([0-9.KMBkmb]+)/i);
    if (followersMatch) followers = parseNum(followersMatch[1]);

    var likesMatch = text.match(/([0-9.KMBkmb]+)\\s*(?:Lượt thích|Likes|Thích)/i) ||
                     text.match(/(?:Lượt thích|Likes|Thích)\\s*([0-9.KMBkmb]+)/i);
    if (likesMatch) likes = parseNum(likesMatch[1]);

    var links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
    var videoUrls = [];
    var totalViews = 0;

    for (var i = 0; i < links.length; i++) {
      var href = links[i].href;
      if (!videoUrls.includes(href)) {
        videoUrls.push(href);
        var card = links[i].closest('[data-e2e="user-post-item"]') || links[i].parentElement || links[i];
        var strongs = card.querySelectorAll("strong, span");
        for (var j = 0; j < strongs.length; j++) {
          var t = strongs[j].textContent.trim();
          if (t && /^[0-9.KMBkmb]+$/.test(t)) {
            totalViews += parseNum(t);
            break;
          }
        }
      }
    }

    if (totalViews === 0 && videoUrls.length > 0) {
      var allStrongs = Array.from(document.querySelectorAll("strong")).map(function(s) { return s.textContent.trim(); });
      for (var k = 3; k < allStrongs.length; k++) {
        if (/^[0-9.KMBkmb]+$/.test(allStrongs[k])) {
          totalViews += parseNum(allStrongs[k]);
          break;
        }
      }
    }

    var h1 = document.querySelector("h1");
    var nickname = h1 ? h1.textContent.trim() : "";

    return {
      username: "dat.nguyen6284",
      nickname: nickname,
      following: following,
      followers: followers,
      likes: likes,
      videoCount: videoUrls.length,
      videoUrls: videoUrls,
      totalViews: totalViews,
    };
  })()`);

  console.log("Full Extracted Data:", JSON.stringify(extracted, null, 2));

  const extractedData = extracted as any;
  // If we have videoUrls, let's open the first video to inspect comments!
  if (extractedData.videoUrls && extractedData.videoUrls.length > 0) {
    console.log("Opening video URL to check comments & likes:", extractedData.videoUrls[0]);
    await page.goto(extractedData.videoUrls[0], { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(4000);

    const videoMetrics = await page.evaluate(() => {
      var likeBtn = document.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]');
      var commentBtn = document.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]');
      return {
        videoLikes: likeBtn ? (likeBtn as HTMLElement).textContent?.trim() : "0",
        videoComments: commentBtn ? (commentBtn as HTMLElement).textContent?.trim() : "0",
        bodyTextSnippet: document.body.innerText.substring(0, 600),
      };
    });
    console.log("Video Metrics:", videoMetrics);
  }

  await context.close();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
}

testFullExtraction().catch(console.error);

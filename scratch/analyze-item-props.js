const https = require('https');

async function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

async function analyzeItemProps() {
  const url = 'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/204.54492f02.js';
  const js = await fetchUrl(url);

  console.log('=== Searching property access on video items ===');
  const regex = /\.video_id|\.title|\.cover|\.duration|\.create_time|\.post_time|\.reward|\.income|\.rpm|\.quvv|\.qualified/g;
  const matches = new Set();
  let m;
  while ((m = regex.exec(js)) !== null) {
    const start = Math.max(0, m.index - 50);
    const end = Math.min(js.length, m.index + 100);
    matches.add(js.slice(start, end));
    if (matches.size > 20) break;
  }

  for (const snippet of matches) {
    console.log('--- snippet ---');
    console.log(snippet.replace(/[^\x20-\x7E\r\n\t]/g, '.'));
  }
}

analyzeItemProps();

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

async function analyzeDetails() {
  const url = 'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/204.54492f02.js';
  const js = await fetchUrl(url);

  console.log('=== Inspecting crp_analytics_data in 204.54492f02.js ===');
  let pos = 0;
  while ((pos = js.indexOf('crp_analytics_data', pos)) !== -1) {
    const start = Math.max(0, pos - 150);
    const end = Math.min(js.length, pos + 400);
    console.log('--- Context ---');
    console.log(js.slice(start, end));
    pos += 20;
  }

  console.log('\n=== Inspecting video_analytics_video_list in 204.54492f02.js ===');
  pos = 0;
  while ((pos = js.indexOf('video_analytics_video_list', pos)) !== -1) {
    const start = Math.max(0, pos - 150);
    const end = Math.min(js.length, pos + 400);
    console.log('--- Context ---');
    console.log(js.slice(start, end));
    pos += 28;
  }
}

analyzeDetails();

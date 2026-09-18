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

async function analyze() {
  const bundles = [
    'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/929.13a67f1d.js',
    'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/210.961524ec.js',
    'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/204.54492f02.js',
    'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/400.0546be1a.js',
  ];

  for (const b of bundles) {
    const js = await fetchUrl(b);
    const fname = b.split('/').pop();
    
    // Check reward_analytics_per_post
    if (js.includes('reward_analytics_per_post')) {
      console.log(`\n=== Found 'reward_analytics_per_post' in ${fname} ===`);
      let pos = 0;
      while ((pos = js.indexOf('reward_analytics_per_post', pos)) !== -1) {
        const start = Math.max(0, pos - 200);
        const end = Math.min(js.length, pos + 500);
        console.log('--- Context ---');
        console.log(js.slice(start, end));
        pos += 25;
      }
    }

    // Check video_reward_analytics
    if (js.includes('video_reward_analytics')) {
      console.log(`\n=== Found 'video_reward_analytics' in ${fname} ===`);
      let pos = 0;
      while ((pos = js.indexOf('video_reward_analytics', pos)) !== -1) {
        const start = Math.max(0, pos - 200);
        const end = Math.min(js.length, pos + 500);
        console.log('--- Context ---');
        console.log(js.slice(start, end));
        pos += 22;
      }
    }
  }
}

analyze();

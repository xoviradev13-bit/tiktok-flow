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

async function analyzeNu() {
  const url = 'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/204.54492f02.js';
  const js = await fetchUrl(url);

  const idx = js.indexOf('nu=function');
  if (idx !== -1) {
    console.log('=== Found nu=function ===');
    console.log(js.slice(idx, idx + 1200).replace(/[^\x20-\x7E\r\n\t]/g, '.'));
  } else {
    const idx2 = js.indexOf('nu=');
    console.log('nu= at', idx2);
  }
}

analyzeNu();

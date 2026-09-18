const https = require('https');

const chunks = [
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/__federation_expose_default_export.40289b27.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/131.aba7bea1.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/204.54492f02.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/210.961524ec.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/232.b144c878.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/338.00062875.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/400.0546be1a.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/41.cde530ae.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/514.f1f1ef02.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/649.abfd3fe9.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/929.13a67f1d.js',
  'https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/941.d141a917.js'
];

async function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

async function run() {
  console.log('Downloading and analyzing TikTok Studio Monetization JS bundles...');
  const allEndpoints = new Set();
  const allM10nStrings = new Set();

  for (const c of chunks) {
    const js = await fetchUrl(c);
    console.log(`Bundle ${c.split('/').pop()}: length ${js.length}`);
    
    // Find api paths
    const matches = js.match(/\/api\/[a-zA-Z0-9_/.-]+/g) || [];
    matches.forEach(m => allEndpoints.add(m));

    const m10nMatches = js.match(/\/m10n[a-zA-Z0-9_/.-]+/g) || [];
    m10nMatches.forEach(m => allM10nStrings.add(m));

    const creatorMatches = js.match(/\/creator[a-zA-Z0-9_/.-]+/g) || [];
    creatorMatches.forEach(m => allEndpoints.add(m));

    const awemeMatches = js.match(/\/aweme[a-zA-Z0-9_/.-]+/g) || [];
    awemeMatches.forEach(m => allEndpoints.add(m));

    // Look for item detail or reward patterns
    const regex = /["'](\/[a-zA-Z0-9_/-]*(?:item|reward|income|video)[a-zA-Z0-9_/-]*)["']/gi;
    let match;
    while ((match = regex.exec(js)) !== null) {
      if (!match[1].endsWith('.js') && !match[1].endsWith('.css') && match[1].length > 4) {
        allEndpoints.add(match[1]);
      }
    }
  }

  console.log('\n--- Discovered /m10n Endpoints ---');
  for (const ep of Array.from(allM10nStrings).sort()) {
    console.log('  ', ep);
  }

  console.log('\n--- Discovered Monetization / Item Endpoints ---');
  for (const ep of Array.from(allEndpoints).sort()) {
    if (ep.includes('item') || ep.includes('reward') || ep.includes('m10n') || ep.includes('income') || ep.includes('video')) {
      console.log('  ', ep);
    }
  }
}

run();

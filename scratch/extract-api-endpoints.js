const fs = require('fs');
const path = require('path');

const cacheDir = 'D:\\Tiktok automation\\500a1071-8dd2-43dd-9685-220721b0c4a4\\Default\\Cache\\Cache_Data';

const files = fs.readdirSync(cacheDir);
const endpoints = new Set();

for (const f of files) {
  const full = path.join(cacheDir, f);
  try {
    const stat = fs.statSync(full);
    if (stat.size > 1000 && stat.size < 10 * 1024 * 1024) {
      const buf = fs.readFileSync(full);
      const str = buf.toString('latin1');
      if (str.includes('tiktok_studio_monetization_web') || str.includes('m10n')) {
        // Search for API path patterns e.g. "/api/..." or "/m10n_..." or "/tiktokstudio/..."
        const matches = str.match(/(?:['"`])(\/(?:api|m10n|creator|aweme|tiktokstudio|passport)[a-zA-Z0-9_/.-]+)(?:['"`])/g) || [];
        for (const m of matches) {
          const clean = m.replace(/['"`]/g, '');
          if (clean.length > 5 && !clean.endsWith('.js') && !clean.endsWith('.css') && !clean.endsWith('.png')) {
            endpoints.add(clean);
          }
        }
      }
    }
  } catch (e) {}
}

console.log('--- Discovered Internal Monetization API Endpoints ---');
for (const ep of Array.from(endpoints).sort()) {
  console.log('ENDPOINT:', ep);
}

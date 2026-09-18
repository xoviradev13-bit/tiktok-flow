const fs = require('fs');
const path = require('path');

const cacheDir = 'D:\\Tiktok automation\\500a1071-8dd2-43dd-9685-220721b0c4a4\\Default\\Cache\\Cache_Data';

function searchCache() {
  if (!fs.existsSync(cacheDir)) {
    console.log('Cache dir does not exist:', cacheDir);
    return;
  }
  const files = fs.readdirSync(cacheDir);
  console.log(`Cache contains ${files.length} files`);
  const foundApis = new Set();

  for (const f of files) {
    const full = path.join(cacheDir, f);
    try {
      const stat = fs.statSync(full);
      if (stat.size > 100 && stat.size < 10 * 1024 * 1024) {
        const buf = fs.readFileSync(full);
        const str = buf.toString('latin1');
        
        // Find URLs
        const urls = str.match(/https?:\/\/[a-zA-Z0-9_./?=&%#-]+/g) || [];
        for (const u of urls) {
          if (u.includes('m10n') || u.includes('creator') || u.includes('monetization') || u.includes('item_') || u.includes('reward')) {
            foundApis.add(u);
          }
        }

        // Look for JSON containing 7672354204966456598 or 7629019889742777602
        if (str.includes('7672354204966456598') || str.includes('7629019889742777602')) {
          console.log(`\nMatch in cache file ${f} (size ${stat.size}):`);
          const idx = Math.max(0, str.indexOf('7672354204966456598'));
          console.log(str.slice(Math.max(0, idx - 200), idx + 800).replace(/[^\x20-\x7E\r\n\t]/g, '.'));
        }
      }
    } catch (e) {}
  }

  console.log('\n--- Discovered APIs from Cache ---');
  for (const u of Array.from(foundApis).sort()) {
    console.log('API:', u);
  }
}

searchCache();

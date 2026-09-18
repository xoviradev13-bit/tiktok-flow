const fs = require('fs');
const path = require('path');

const cacheDir = 'D:\\Tiktok automation\\500a1071-8dd2-43dd-9685-220721b0c4a4\\Default\\Cache\\Cache_Data';

const files = fs.readdirSync(cacheDir);

for (const f of files) {
  const full = path.join(cacheDir, f);
  try {
    const stat = fs.statSync(full);
    if (stat.size > 1000 && stat.size < 10 * 1024 * 1024) {
      const buf = fs.readFileSync(full);
      const str = buf.toString('latin1');
      if (str.includes('reward_analytics') || str.includes('monetization/item') || str.includes('item_list') || str.includes('all_programs')) {
        console.log(`Cache file ${f} matches! Size: ${stat.size}`);
        // Find strings starting with /
        const matches = str.match(/\/m10n[a-zA-Z0-9_/.-]+/g) || [];
        console.log('  /m10n matches:', Array.from(new Set(matches)));
        const itemMatches = str.match(/\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]*item[a-zA-Z0-9_-]*/g) || [];
        console.log('  item matches:', Array.from(new Set(itemMatches)));
      }
    }
  } catch (e) {}
}

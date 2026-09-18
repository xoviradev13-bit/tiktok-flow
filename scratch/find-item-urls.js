const fs = require('fs');
const path = require('path');

const userDir = 'D:\\Tiktok automation\\500a1071-8dd2-43dd-9685-220721b0c4a4';

function searchDirectory(dir, depth = 0) {
  if (depth > 4) return;
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          if (!f.includes('Cache') && !f.includes('Code Cache')) {
            searchDirectory(full, depth + 1);
          }
        } else if (stat.size > 0 && stat.size < 50 * 1024 * 1024) {
          if (f.includes('Session') || f.includes('Network') || f.includes('Cookie') || f.endsWith('.log') || f.endsWith('.ldb') || f.endsWith('.json')) {
            const buf = fs.readFileSync(full);
            const str = buf.toString('latin1');
            const matches = str.match(/https?:\/\/[a-zA-Z0-9_./?=&%#-]+/g) || [];
            for (const m of matches) {
              if (m.includes('m10n') || m.includes('monetization') || m.includes('creator_reward') || m.includes('reward') || m.includes('item_info') || m.includes('item/')) {
                console.log(`[${f}] ${m}`);
              }
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

console.log('Searching URLs in profile 500a1071-8dd2-43dd-9685-220721b0c4a4...');
searchDirectory(userDir);

const fs = require('fs');
const path = require('path');

const userDir = 'D:\\Tiktok automation\\500a1071-8dd2-43dd-9685-220721b0c4a4\\Default';

function searchInDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        searchInDir(full);
      } else if (ent.isFile()) {
        try {
          const stat = fs.statSync(full);
          if (stat.size > 0 && stat.size < 50 * 1024 * 1024) {
            const buf = fs.readFileSync(full);
            if (buf.includes('video_analytics_video_list') || buf.includes('crp_analytics_data') || buf.includes('7672354204966456598') || buf.includes('reward_analytics_per_post')) {
              console.log(`\nMatch in file: ${full} (${stat.size} bytes)`);
              const str = buf.toString('latin1');
              const idx = Math.max(0, str.indexOf('7672354204966456598'));
              if (idx > 0) {
                console.log(str.slice(Math.max(0, idx - 100), idx + 800).replace(/[^\x20-\x7E\r\n\t]/g, '.'));
              } else {
                const idx2 = Math.max(0, str.indexOf('reward_analytics_per_post'));
                console.log(str.slice(Math.max(0, idx2 - 100), idx2 + 800).replace(/[^\x20-\x7E\r\n\t]/g, '.'));
              }
            }
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

console.log('Searching for reward analytics data in Default profile directory...');
searchInDir(userDir);

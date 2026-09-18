const fs = require('fs');
const path = require('path');

const userDir = 'D:\\Tiktok automation\\500a1071-8dd2-43dd-9685-220721b0c4a4';
const searchItem = '7672354204966456598';

function searchFile(fullPath) {
  try {
    const stat = fs.statSync(fullPath);
    if (stat.size === 0 || stat.size > 200 * 1024 * 1024) return;
    const buf = fs.readFileSync(fullPath);
    const idx = buf.indexOf(searchItem);
    if (idx !== -1) {
      console.log(`\n*** FOUND ${searchItem} in ${fullPath} at offset ${idx} ***`);
      const start = Math.max(0, idx - 500);
      const end = Math.min(buf.length, idx + 1500);
      const snippet = buf.slice(start, end).toString('utf8');
      console.log('Snippet surrounding match:');
      console.log(snippet.replace(/[^\x20-\x7E\r\n\t]/g, '.'));
    }
  } catch (e) {}
}

function traverse(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          traverse(full);
        } else {
          searchFile(full);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

console.log(`Searching for itemId ${searchItem}...`);
traverse(userDir);

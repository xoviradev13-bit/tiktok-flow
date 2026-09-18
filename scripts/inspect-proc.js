const { execSync } = require('child_process');
try {
  const out = execSync('powershell -NoProfile -Command "(Get-Process -Id 3188).Path"', { encoding: 'utf8' });
  console.log('Path:', out.trim());
} catch (e) {
  console.error(e.message);
}

const { execSync } = require('child_process');

try {
  const output = execSync('netstat -ano', { encoding: 'utf8' });
  const lines = output.split('\n');
  const chromePid = 24456;
  console.log(`Searching connections for PID ${chromePid}:`);
  for (const l of lines) {
    if (l.includes(String(chromePid))) {
      console.log('  ', l.trim());
    }
  }
} catch (e) {
  console.error(e);
}

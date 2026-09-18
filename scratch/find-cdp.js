const { execSync } = require('child_process');

try {
  const output = execSync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"name=\'chrome.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"', { encoding: 'utf8' });
  const procs = JSON.parse(output);
  const arr = Array.isArray(procs) ? procs : [procs];
  console.log(`Found ${arr.length} chrome processes`);
  for (const p of arr) {
    if (p.CommandLine && (p.CommandLine.includes('tiktok') || p.CommandLine.includes('user-data-dir') || p.CommandLine.includes('Profile') || p.CommandLine.includes('2492'))) {
      console.log(`PID ${p.ProcessId}: ${p.CommandLine.substring(0, 200)}...`);
    }
  }
} catch (err) {
  console.error('Error:', err.message);
}

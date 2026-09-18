const fs = require('fs');
const { execSync } = require('child_process');

const src = 'D:\\Tiktok automation\\500a1071-8dd2-43dd-9685-220721b0c4a4\\Default\\Network\\Cookies';
const dst = 'C:\\Users\\datng\\AppData\\Local\\Temp\\test_cookies.db';

console.log('Testing locked file copy methods...');

// Test 1: cmd copy
try {
  const out = execSync(`cmd /c copy "${src}" "${dst}"`, { encoding: 'utf8' });
  console.log('cmd copy output:', out);
  console.log('dst size:', fs.statSync(dst).size);
} catch (e) {
  console.log('cmd copy failed:', e.message);
}

// Test 2: powershell Copy-Item
try {
  const out = execSync(`powershell -Command "Copy-Item -LiteralPath '${src}' -Destination '${dst}' -Force"`, { encoding: 'utf8' });
  console.log('powershell copy output:', out);
  console.log('dst size:', fs.statSync(dst).size);
} catch (e) {
  console.log('powershell copy failed:', e.message);
}

// Test 3: powershell FileStream with FileShare.ReadWrite | Delete
try {
  const script = `
$src = '${src.replace(/\\/g, '\\\\')}';
$dst = '${dst.replace(/\\/g, '\\\\')}';
$share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete;
$inStream = New-Object System.IO.FileStream($src, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share);
$outStream = New-Object System.IO.FileStream($dst, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write);
$inStream.CopyTo($outStream);
$inStream.Close();
$outStream.Close();
Write-Host 'Stream copy success! Bytes:' (Get-Item $dst).Length;
`;
  const out = execSync(`powershell -Command "${script.replace(/\n/g, ' ')}"`, { encoding: 'utf8' });
  console.log('powershell FileStream output:', out);
} catch (e) {
  console.log('powershell FileStream failed:', e.message);
}

// Test 4: esentutl or robocopy or handle / who is locking
try {
  const out = execSync(`robocopy "D:\\Tiktok automation\\500a1071-8dd2-43dd-9685-220721b0c4a4\\Default\\Network" "C:\\Users\\datng\\AppData\\Local\\Temp\\robocopy_test" Cookies /R:1 /W:1`, { encoding: 'utf8' });
  console.log('robocopy output:', out);
} catch (e) {
  console.log('robocopy result code:', e.status);
  try {
    const stat = fs.statSync('C:\\Users\\datng\\AppData\\Local\\Temp\\robocopy_test\\Cookies');
    console.log('robocopy copied Cookies! size:', stat.size);
  } catch (err) {
    console.log('robocopy failed to copy file:', err.message);
  }
}

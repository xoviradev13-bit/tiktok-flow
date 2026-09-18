@echo off
taskkill /F /PID 15916 /T >nul 2>nul
taskkill /F /PID 12192 /T >nul 2>nul
powershell -NoProfile -Command "$procs = (Get-NetTCPConnection -LocalPort 39741 -ErrorAction SilentlyContinue).OwningProcess; foreach ($p in $procs) { if ($p -gt 0) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }" >nul 2>nul
copy /y "c:\Users\datng\tiktok-automation\client-agent\agent.js" "C:\Program Files\TikTokFlow\ClientAgent\agent.js" > "c:\Users\datng\tiktok-automation\scratch\copy-result.txt" 2>&1

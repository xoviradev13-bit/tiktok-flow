@echo off
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

set "NSSM=%~dp0bin\nssm.exe"
if exist "%ProgramFiles%\TikTokFlow\ClientAgent\bin\nssm.exe" (
  set "NSSM=%ProgramFiles%\TikTokFlow\ClientAgent\bin\nssm.exe"
)

echo [*] Stop TikTokFlowAgent Service (neu co)...
net stop TikTokFlowAgent >nul 2>nul
sc stop TikTokFlowAgent >nul 2>nul
"%NSSM%" stop TikTokFlowAgent >nul 2>nul

echo [*] Stop schtasks (neu co)...
schtasks /end /tn "TikTokFlow_Agent_Daemon" >nul 2>nul
schtasks /end /tn "\TikTokFlow_Agent_Daemon" >nul 2>nul

echo [*] Giai phong cong 39741 va kill process agent...
powershell -NoProfile -Command "$ports = @(39741); foreach ($p in $ports) { $procs = (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue).OwningProcess; foreach ($procId in $procs) { if ($procId -gt 0) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } } }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul

echo [OK] Agent da dung hoan toan va cong 39741 da giai phong.
timeout /t 3 >nul


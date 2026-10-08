@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem --- Admin check (fltmc works even when the Server service is stopped) ---
fltmc >nul 2>&1
if errorlevel 1 goto :elevate
goto :main

:elevate
echo [*] Dang mo hop thoai Quan tri vien - UAC...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','\"\"%~f0\"\"' -Verb RunAs"
if errorlevel 1 (
  echo [LOI] Khong the nang quyen Admin.
  pause
)
exit /b 0

:main
set "PF=%ProgramFiles%\TikTokFlow\ClientAgent"

if not exist "%PF%" (
  echo [LOI] Thu muc "%PF%" chua ton tai. Vui long chay setup-agent.bat de cai dat truoc.
  pause
  exit /b 1
)

echo [*] Dung process agent cu tren cong 39741...
schtasks /end /tn "TikTokFlow_Agent_Daemon" >nul 2>nul
powershell -NoProfile -Command "$ports = @(39741); foreach ($p in $ports) { $procs = (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue).OwningProcess; foreach ($procId in $procs) { if ($procId -gt 0) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } } }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
timeout /t 1 >nul

echo [*] Cap nhat agent.js moi nhat sang "%PF%"...
copy /y "%~dp0agent.js" "%PF%\agent.js"
if errorlevel 1 goto :copy_failed
copy /y "%~dp0run-agent.bat" "%PF%\run-agent.bat"
if errorlevel 1 goto :copy_failed
copy /y "%~dp0run-agent-silent.vbs" "%PF%\run-agent-silent.vbs"
if errorlevel 1 goto :copy_failed

echo [*] Khoi dong lai Client Agent Daemon...
schtasks /run /tn "TikTokFlow_Agent_Daemon" >nul 2>nul

echo.
echo ========================================================
echo   [THANH CONG] DA CAP NHAT VA KHOI DONG LAI CLIENT AGENT!
echo ========================================================
pause
exit /b 0

:copy_failed
color 0c
echo.
echo [LOI] Khong the copy file vao "%PF%".
echo Vui long kiem tra xem co process nao dang khoa file khong.
pause
exit /b 1
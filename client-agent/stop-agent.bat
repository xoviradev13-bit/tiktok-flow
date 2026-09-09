@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Dung Tien Trinh - TikTokFlow Client Agent
color 0e

echo ========================================================
echo        TIKTOKFLOW CLIENT AGENT - DUNG HOAT DONG          
echo ========================================================
echo.

:: 1. Dung tien trinh agent.js dang chay ngam
echo [1/2] Dang tim va dung toan bo tien trinh Agent dang chay ngam...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul
echo    -^> Da dung tien trinh Agent va giai phong RAM.

:: 2. Don dep thu muc tam gpm-agent-* neu con sot lai
echo [2/2] Dang don dep cac tep tam thoi...
powershell -Command "Get-ChildItem -Path $env:TEMP -Filter 'gpm-agent-*' -Directory | Remove-Item -Recurse -Force" >nul 2>nul
echo    -^> Da don dep sach se bo nho dem.

echo.
echo ========================================================
echo   [THANH CONG] AGENT DA DUOC DUNG HOAN TOAN!
echo ========================================================
echo.
echo Ban co muon TAT LUON che do tu dong khoi dong cung Windows khong?
echo   [Y] Co  - Go bo tu dong chay khi mo may
echo   [N] Khong - Chi dung luc nay, khi mo may lan sau van chay
echo.

set "disable_startup="
set /p disable_startup="Nhap lua chon (Y/N, mac dinh la N): "

if /i "%disable_startup%"=="Y" goto :disable_yes
goto :disable_no

:disable_yes
schtasks /delete /tn "TikTokFlow_Agent_Daemon" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Daily" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Noon" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Evening" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Periodic" /f >nul 2>nul
echo.
echo [DA TAT] Da huy che do tu dong khoi dong cung Windows!
goto :done

:disable_no
echo.
echo [GIU NGUYEN] Lan sau khi ban bat may tinh, Agent se tiep tuc chay ngam theo lich.
goto :done

:done
echo.
echo Nhan phim bat ky de dong cua so nay...
pause >nul

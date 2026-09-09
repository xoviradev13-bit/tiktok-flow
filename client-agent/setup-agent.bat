@echo off
chcp 65001 >nul
cd /d "%~dp0"

title Cai Dat Tu Dong Chay Ngam - TikTokFlow Client Agent
color 0a

echo ========================================================
echo     TIKTOKFLOW CLIENT AGENT - TU DONG CHAY CUNG WINDOWS  
echo ========================================================
echo.
echo Che do hoat dong:
echo   Moi khi ban bat may tinh (dang nhap Windows), Agent se tu
echo   dong chay ngam 100%% vo hinh (khong mo cua so, khong lam phien).
echo   Agent se tu dong ket noi may chu TikTokFlow va quet so lieu
echo   theo dung Lich Trinh (Schedule) duoc thiet lap trong Settings.
echo.
echo --------------------------------------------------------
echo   [1] CAI DAT   : Tu dong chay ngam moi khi mo may tinh (Khuyen nghi)
echo   [2] GO BO     : Huy che do tu dong chay cung Windows
echo   [3] DOI TOKEN : Nhap / Cap nhat Personal Security Token moi
echo   [0] Thoat
echo --------------------------------------------------------
echo.

set "choice="
set /p choice="Nhap lua chon cua ban (1, 2, 3 hoac 0): "

if "%choice%"=="1" goto :action_install
if "%choice%"=="2" goto :action_uninstall
if "%choice%"=="3" goto :action_token
if "%choice%"=="0" goto :action_exit
goto :action_unknown

:action_install
echo.
echo [*] Dang cau hinh Windows Task Scheduler...
set "VBS_PATH=%~dp0run-agent-silent.vbs"
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul
schtasks /create /tn "TikTokFlow_Agent_Daemon" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /rl highest /f >nul 2>nul
schtasks /run /tn "TikTokFlow_Agent_Daemon" >nul 2>nul
echo.
echo ========================================================
echo  [THANH CONG] DA KICH HOAT VA DANG KY TU DONG CHAY!
echo ========================================================
echo  - Agent da duoc khoi chay ngam ngay lap tuc.
echo  - Moi khi mo may, Agent se tu dong chay tiep tuc.
echo  - Lich quet se tu dong dong bo theo cai dat tren Server.
echo.
goto :done

:action_uninstall
echo.
echo [*] Dang go bo cac tac vu chay ngam...
schtasks /delete /tn "TikTokFlow_Agent_Daemon" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Daily" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Noon" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Evening" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Periodic" /f >nul 2>nul
echo.
echo ========================================================
echo  [THANH CONG] Da go bo toan bo lich chay tu dong!
echo ========================================================
echo.
goto :done

:action_token
echo.
echo ========================================================
echo          CAP NHAT ^& XAC THUC PERSONAL SECURITY TOKEN
echo ========================================================
echo Hay dan ma Token moi ban lay tu trang Cai Dat tren website.
echo.
set "new_token="
set /p new_token="Nhap ma Token moi (bat dau bang ttf_sec_...): "
if "%new_token%"=="" goto :token_empty

echo.
echo [*] Dang kiem tra tinh hop le cua ma Token voi may chu TikTokFlow...
powershell -ExecutionPolicy Bypass -File "%~dp0verify-token.ps1" -Token "%new_token%"
goto :done

:token_empty
echo.
echo [HUY] Ma Token khong duoc de trong.
goto :done

:action_unknown
echo.
echo [!] Lua chon khong hop le.
goto :done

:action_exit
echo.
echo Thoat chuong trinh.
goto :eof

:done
echo.
echo ========================================================
echo Nhan phim bat ky de ket thuc...
pause >nul

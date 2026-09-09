@echo off
chcp 65001 >nul
cd /d "%~dp0"

:: 1. Uu tien dung Portable Node.exe co san trong thu muc bin
set "NODE_CMD="
if exist "%~dp0bin\node.exe" (
    set "NODE_CMD=%~dp0bin\node.exe"
    goto :found_node
)
if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
    goto :found_node
)
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_CMD=node"
    goto :found_node
)

:: 2. Neu chua co Node, tu dong tai Portable Node trong vai giay
echo [INFO] Dang tu dong chuan bi moi truong chay Portable...
mkdir bin >nul 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/win-x64/node.exe', 'bin\node.exe')" >nul 2>nul
if exist "%~dp0bin\node.exe" (
    set "NODE_CMD=%~dp0bin\node.exe"
    goto :found_node
)

:no_node
color 0c
echo [LOI] Khong the khoi dong moi truong runtime. Vui long kiem tra ket noi mang.
pause
exit /b 1

:found_node
:: 3. Chay Agent
if "%1"=="--daemon" goto :run_daemon

title TikTokFlow Client Agent - Quet Ngam TikTok Studio
color 0b
"%NODE_CMD%" agent.js
echo.
echo ========================================================
echo Nhan phim bat ky de dong cua so nay...
pause >nul
goto :eof

:run_daemon
"%NODE_CMD%" agent.js --daemon
goto :eof

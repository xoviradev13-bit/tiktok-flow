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
:: 3. Chan Agent thu 2 neu cong khoa 39741 dang duoc giu
powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 39741); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if %errorlevel% equ 0 (
    color 0c
    echo ========================================================
    echo   [CHAN] CLIENT AGENT DA DANG CHAY TREN MAY NAY
    echo ========================================================
    echo   Cong khoa localhost:39741 dang bi chiem.
    echo   Chi cho phep 1 Agent / may.
    echo   Hay chay stop-agent.bat truoc khi mo Agent khac.
    echo ========================================================
    if not "%1"=="--daemon" pause
    exit /b 1
)

:: 4. Chay Agent
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
"%NODE_CMD%" agent.js --daemon >> "%~dp0agent-run.log" 2>&1
goto :eof

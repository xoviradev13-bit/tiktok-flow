@echo off
chcp 65001 >nul
cd /d "%~dp0"

title TikTokFlow Client Agent - Cai Dat
color 0a

set "PF=%ProgramFiles%\TikTokFlow\ClientAgent"
set "PD=%ProgramData%\TikTokFlow"
set "NSSM=%~dp0bin\nssm.exe"
if not exist "%NSSM%" (
  if exist "%PF%\bin\nssm.exe" set "NSSM=%PF%\bin\nssm.exe"
)
set "NODE=%~dp0bin\node.exe"
if not exist "%NODE%" (
  if exist "%PF%\bin\node.exe" set "NODE=%PF%\bin\node.exe"
)
if not exist "%NODE%" set "NODE=node"

set "choice=%~1"
if not "%choice%"=="" goto :dispatch

echo ========================================================
echo     TIKTOKFLOW CLIENT AGENT - CAI DAT
echo ========================================================
echo.
echo   [1] CAI DAT   : Cai Agent chay ngam cung Windows (can Admin)
echo   [2] GO BO     : Dung + go cai dat Agent
echo   [3] DOI TOKEN : Cap nhat Personal Token + khoi dong lai
echo   [0] Thoat
echo.

set "choice="
set /p choice="Nhap lua chon (1, 2, 3, 0): "

:dispatch
if "%choice%"=="1" goto :need_admin
if "%choice%"=="2" goto :need_admin
if "%choice%"=="3" goto :need_admin
if "%choice%"=="0" goto :action_exit
goto :action_unknown

:need_admin
net session >nul 2>&1
if not errorlevel 1 goto :run_as_admin

echo.
echo [*] Dang mo hop thoai Quan tri vien (UAC)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%choice%' -Verb RunAs"
exit /b 0

:run_as_admin
if "%choice%"=="1" goto :action_install
if "%choice%"=="2" goto :action_uninstall
if "%choice%"=="3" goto :action_token
goto :action_unknown

:action_install
echo.
echo [*] Kill Agent cu, dung service va giai phong cong 39741...
net stop TikTokFlowAgent >nul 2>nul
sc stop TikTokFlowAgent >nul 2>nul
if exist "%PF%\bin\nssm.exe" "%PF%\bin\nssm.exe" stop TikTokFlowAgent >nul 2>nul
if exist "%PF%\bin\nssm.exe" "%PF%\bin\nssm.exe" remove TikTokFlowAgent confirm >nul 2>nul
if exist "%NSSM%" "%NSSM%" stop TikTokFlowAgent >nul 2>nul
if exist "%NSSM%" "%NSSM%" remove TikTokFlowAgent confirm >nul 2>nul

powershell -NoProfile -Command "$ports = @(39741); foreach ($p in $ports) { $procs = (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue).OwningProcess; foreach ($procId in $procs) { if ($procId -gt 0) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } } }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul

schtasks /end /tn "TikTokFlow_Agent_Daemon" >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Daemon" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Daily" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Noon" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Evening" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Periodic" /f >nul 2>nul

ping 127.0.0.1 -n 2 >nul

if not exist "%NSSM%" (
  echo [LOI] Thieu bin\nssm.exe — tai lai goi Client Agent tu he thong.
  goto :done
)

echo [*] Copy sang "%PF%"...
mkdir "%PF%" >nul 2>nul
mkdir "%PD%" >nul 2>nul
mkdir "%PD%\logs" >nul 2>nul

robocopy "%~dp0." "%PF%" /E /XD node_modules\.cache /NFL /NDL /NJH /NJS /nc /ns /np >nul
if errorlevel 8 (
  echo [LOI] Copy that bai. Thu lai: chuot phai setup-agent.bat - Run as administrator.
  goto :done
)

icacls "%PF%" /inheritance:r >nul 2>nul
icacls "%PF%" /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "Users:(OI)(CI)RX" >nul 2>nul

echo [*] Dang cai dat tac vu chay ngam tu dong khoi dong cung Windows...
schtasks /create /tn "TikTokFlow_Agent_Daemon" /tr "wscript.exe \"%PF%\run-agent-silent.vbs\"" /sc onlogon /rl highest /f >nul 2>nul

echo [*] Dang khoi dong Agent ngay lap tuc...
schtasks /run /tn "TikTokFlow_Agent_Daemon" >nul 2>nul

echo.
echo [THANH CONG] Agent da cai dat xong va dang chay ngam!
echo He thong se TU DONG chay moi khi ban bat may tinh (khong can bam lai).
echo Kiem tra: mo trinh duyet toi http://127.0.0.1:39741/
goto :done

:action_uninstall
echo.

:: ---------------------------------------------------------------------
:: CRITICAL: cmd.exe keeps an open handle on the .bat it is executing.
:: If we run from Program Files\TikTokFlow and `call` a temp copy, the
:: PARENT still holds setup-agent.bat open, so the folder can never be
:: fully deleted. Fix: copy to %TEMP%, START a NEW process, EXIT this
:: one immediately so the Program Files handle is released first.
::
:: Also: do NOT put set/use of SELFCOPY inside a parenthesized IF block —
:: %VAR% expands at parse-time there and becomes empty. Use gotos instead.
:: ---------------------------------------------------------------------
set "SELF_IN_TARGET="
echo "%~dp0"| find /I "%ProgramFiles%\TikTokFlow" >nul 2>nul
if not errorlevel 1 set "SELF_IN_TARGET=1"
:: NOTE: never use `if defined ProgramFiles(x86)` — the (x86) breaks cmd parsing.
set "PF86=%ProgramFiles(x86)%"
if defined PF86 (
  echo "%~dp0"| find /I "%PF86%\TikTokFlow" >nul 2>nul
  if not errorlevel 1 set "SELF_IN_TARGET=1"
)

if not defined SELF_IN_TARGET goto :uninstall_main

echo [*] Script dang chay trong Program Files — chuyen go bo sang tien trinh tam...
set "UNIQ=%RANDOM%%RANDOM%"
set "SELFCOPY=%TEMP%\ttf-uninstall-body-%UNIQ%.bat"
set "SELFPS1=%TEMP%\ttf-uninstall-cleanup-%UNIQ%.ps1"
set "LAUNCHER=%TEMP%\ttf-uninstall-launch-%UNIQ%.cmd"
copy /y "%~f0" "%SELFCOPY%" >nul
if exist "%~dp0uninstall-cleanup.ps1" copy /y "%~dp0uninstall-cleanup.ps1" "%SELFPS1%" >nul
if not exist "%SELFCOPY%" (
  echo [LOI] Khong the tao ban sao tam. Thu chay setup-agent.bat tu thu muc zip goc.
  goto :done
)

> "%LAUNCHER%" echo @echo off
>>"%LAUNCHER%" echo rem Wait for parent cmd to exit and release Program Files .bat lock
>>"%LAUNCHER%" echo ping 127.0.0.1 -n 3 ^>nul
>>"%LAUNCHER%" echo set "TTF_UNINSTALL_PS1=%SELFPS1%"
>>"%LAUNCHER%" echo set "TTF_UNINSTALL_NOPAUSE=%TTF_UNINSTALL_NOPAUSE%"
>>"%LAUNCHER%" echo call "%SELFCOPY%" 2
>>"%LAUNCHER%" echo del /f /q "%SELFCOPY%" ^>nul 2^>nul
>>"%LAUNCHER%" echo if exist "%SELFPS1%" del /f /q "%SELFPS1%" ^>nul 2^>nul
>>"%LAUNCHER%" echo del /f /q "%%~f0" ^>nul 2^>nul

start "TikTokFlow Uninstall" /D "%TEMP%" cmd /c call "%LAUNCHER%"
echo [*] Cua so go bo moi da mo. Cua so nay se dong de nha khoa file...
ping 127.0.0.1 -n 2 >nul
exit

:uninstall_main
echo [*] Dang dung service va tat cac tien trinh...
cd /d "%TEMP%"

:: 1. Prefer a TEMP copy of nssm so we never depend on a binary we are about to delete
set "NSSM_TMP=%TEMP%\ttf-nssm-%RANDOM%.exe"
set "NSSM_USE="
if exist "%ProgramFiles%\TikTokFlow\ClientAgent\bin\nssm.exe" (
  copy /y "%ProgramFiles%\TikTokFlow\ClientAgent\bin\nssm.exe" "%NSSM_TMP%" >nul 2>nul
)
if not exist "%NSSM_TMP%" if exist "%NSSM%" (
  copy /y "%NSSM%" "%NSSM_TMP%" >nul 2>nul
)
if exist "%NSSM_TMP%" set "NSSM_USE=%NSSM_TMP%"
if not defined NSSM_USE if exist "%ProgramFiles%\TikTokFlow\ClientAgent\bin\nssm.exe" set "NSSM_USE=%ProgramFiles%\TikTokFlow\ClientAgent\bin\nssm.exe"
if not defined NSSM_USE if exist "%NSSM%" set "NSSM_USE=%NSSM%"

net stop TikTokFlowAgent >nul 2>nul
sc stop TikTokFlowAgent >nul 2>nul
if defined NSSM_USE (
  "%NSSM_USE%" stop TikTokFlowAgent >nul 2>nul
  "%NSSM_USE%" remove TikTokFlowAgent confirm >nul 2>nul
)
sc delete TikTokFlowAgent >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Daemon" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Daily" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Noon" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Evening" /f >nul 2>nul
schtasks /delete /tn "TikTokFlow_Agent_Periodic" /f >nul 2>nul

:: 2. Kill holders under install dirs only (do NOT match generic "TikTokFlow" in
::    our own uninstall command line — that would kill this script mid-run).
taskkill /f /im nssm.exe >nul 2>nul
set "CLEANUP_PS1="
if defined TTF_UNINSTALL_PS1 if exist "%TTF_UNINSTALL_PS1%" set "CLEANUP_PS1=%TTF_UNINSTALL_PS1%"
if not defined CLEANUP_PS1 if exist "%~dp0uninstall-cleanup.ps1" set "CLEANUP_PS1=%~dp0uninstall-cleanup.ps1"
if not defined CLEANUP_PS1 if exist "%ProgramFiles%\TikTokFlow\ClientAgent\uninstall-cleanup.ps1" set "CLEANUP_PS1=%ProgramFiles%\TikTokFlow\ClientAgent\uninstall-cleanup.ps1"

if defined CLEANUP_PS1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%CLEANUP_PS1%" -Phase KillOnly >nul 2>nul
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$roots=@((Join-Path $env:ProgramFiles 'TikTokFlow')); $p86=[Environment]::GetEnvironmentVariable('ProgramFiles(x86)'); if($p86){$roots+=(Join-Path $p86 'TikTokFlow')}; $me=$PID; Get-CimInstance Win32_Process -EA SilentlyContinue | ForEach-Object { if($_.ProcessId -eq $me){return}; $path=[string]$_.ExecutablePath; $cmd=[string]$_.CommandLine; $hit=$false; if($cmd -match 'agent\.js'){$hit=$true}; foreach($r in $roots){ if($path -and $path.StartsWith($r,[StringComparison]::OrdinalIgnoreCase)){$hit=$true} }; if($hit){ Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue } }" >nul 2>nul
)

powershell -NoProfile -Command "for ($i=0; $i -lt 20; $i++) { if (-not (Get-Service -Name 'TikTokFlowAgent' -EA SilentlyContinue)) { break }; Start-Sleep -Milliseconds 500; Stop-Service -Name 'TikTokFlowAgent' -Force -EA SilentlyContinue }" >nul 2>nul

:: 3. Give AV / Explorer time to drop handles
ping 127.0.0.1 -n 4 >nul

echo [*] Dang xoa thu muc cai dat...
:: 4. Dedicated cleanup script (reliable quoting + retries + rename-then-delete)
if defined CLEANUP_PS1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%CLEANUP_PS1%" -Phase Delete
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=Join-Path $env:ProgramFiles 'TikTokFlow'; if(Test-Path -LiteralPath $t){ cmd /c \"takeown /f `\"$t`\" /r /d y >nul 2>nul\"; cmd /c \"icacls `\"$t`\" /grant Administrators:F /t /c /q >nul 2>nul\"; Remove-Item -LiteralPath $t -Recurse -Force -EA SilentlyContinue; if(Test-Path -LiteralPath $t){ cmd /c \"rd /s /q `\"$t`\" >nul 2>nul\" } }; $d=Join-Path $env:ProgramData 'TikTokFlow'; if(Test-Path -LiteralPath $d){ Remove-Item -LiteralPath $d -Recurse -Force -EA SilentlyContinue }"
)

if exist "%NSSM_TMP%" del /f /q "%NSSM_TMP%" >nul 2>nul

:: 5. Final CMD sweep
if exist "%PF%" rmdir /s /q "%PF%" >nul 2>nul
if exist "%ProgramFiles%\TikTokFlow" rmdir /s /q "%ProgramFiles%\TikTokFlow" >nul 2>nul
if defined PF86 if exist "%PF86%\TikTokFlow" rmdir /s /q "%PF86%\TikTokFlow" >nul 2>nul
if exist "%PD%" rmdir /s /q "%PD%" >nul 2>nul

echo.
echo ========================================================
echo               KET QUA GO BO
echo ========================================================
if exist "%ProgramFiles%\TikTokFlow" (
  echo   [!] Program Files: CHUA XOA HET - da danh dau xoa tu dong sau khi
  echo       KHOI DONG LAI may ^(co the do AV hoac tien trinh nen dang giu file^).
) else (
  echo   [+] Program Files: DA XOA SACH HOAN TOAN.
)
if defined PF86 if exist "%PF86%\TikTokFlow" (
  echo   [!] Program Files ^(x86^): CHUA XOA HET - se tu xoa sau reboot.
)
if exist "%PD%" (
  echo   [!] ProgramData  : CHUA XOA HET - se tu xoa sau khi khoi dong lai may.
) else (
  echo   [+] ProgramData  : DA XOA SACH HOAN TOAN.
)
echo ========================================================
goto :done

:action_token
echo.
if not exist "%PF%\config.json" (
  color 0e
  echo ========================================================
  echo   [CANH BAO] CLIENT AGENT CHUA DUOC CAI DAT!
  echo ========================================================
  echo   Khong tim thay Agent tai: %PF%
  echo.
  echo   Vui long chon [1] CAI DAT de cai dat Agent truoc,
  echo   sau do moi co the cap nhat Personal Token.
  echo ========================================================
  goto :done
)

set "new_token="
set /p new_token="Nhap Personal Token (ttf_sec_...): "
if "%new_token%"=="" goto :token_empty
powershell -ExecutionPolicy Bypass -File "%~dp0verify-token.ps1" -Token "%new_token%" -ConfigPath "%PF%\config.json"
if errorlevel 1 goto :done
if exist "%PF%\bin\nssm.exe" (
  "%PF%\bin\nssm.exe" restart TikTokFlowAgent >nul 2>nul
) else if exist "%NSSM%" (
  "%NSSM%" restart TikTokFlowAgent >nul 2>nul
)
echo.
echo [THANH CONG] Token da cap nhat + Agent restart thanh cong.
goto :done

:token_empty
echo [!] Token trong.
goto :done

:action_unknown
echo Lua chon khong hop le.
goto :done

:action_exit
exit /b 0

:done
echo.
if /i not "%TTF_UNINSTALL_NOPAUSE%"=="1" if /i not "%~2"=="nopause" pause
exit /b 0
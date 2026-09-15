param (
    [Parameter(Mandatory = $true)]
    [string]$Token,
    [string]$ConfigPath
)

# Set UTF-8 output encoding for PowerShell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$tok = $Token.Trim()

if (-not $tok) {
    Write-Host " [HUY] Ma Token khong duoc de trong." -ForegroundColor Yellow
    exit 1
}

# 1. Format check
if (-not ($tok -match '^ttf_sec_[a-f0-9]{16,64}$')) {
    Write-Host " [LOI] Dinh dang Token khong dung!" -ForegroundColor Red
    Write-Host "       Ma Token chuan phai bat dau bang 'ttf_sec_' theo sau boi cac ky tu ma hoa hex." -ForegroundColor Yellow
    exit 1
}

# 2. Resolve config.json — prefer installed Program Files path when provided
$pfConfig = Join-Path $env:ProgramFiles "TikTokFlow\ClientAgent\config.json"
if ($ConfigPath -and (Test-Path $ConfigPath)) {
    $configFile = $ConfigPath
} elseif (Test-Path $pfConfig) {
    $configFile = $pfConfig
} else {
    $configFile = Join-Path $PSScriptRoot "config.json"
}

if (-not (Test-Path $configFile)) {
    Write-Host " [LOI] Khong tim thay file config.json: $configFile" -ForegroundColor Red
    exit 1
}

Write-Host " [*] Config: $configFile" -ForegroundColor DarkGray

try {
    $cfg = Get-Content $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Write-Host " [LOI] Khong the doc file config.json: $_" -ForegroundColor Red
    exit 1
}

$srv = $cfg.serverUrl
if (-not $srv) { $srv = "http://localhost:3000" }
$srv = $srv.TrimEnd('/')

# 3. Verify with Server
Write-Host " [*] Dang ket noi may chu tai: $srv ..." -ForegroundColor Cyan

try {
    $body = @{ token = $tok } | ConvertTo-Json
    $headers = @{ Authorization = "Bearer $tok" }
    $res = Invoke-RestMethod -Uri ($srv + "/api/extension/verify-token") -Method Post -Body $body -ContentType "application/json" -Headers $headers -TimeoutSec 10

    Write-Host ""
    Write-Host (" [XAC THUC THANH CONG] " + $res.message) -ForegroundColor Green
    if ($res.user.email) {
        Write-Host (" [+] Nhan vien so huu: " + $res.user.email) -ForegroundColor Green
    }

    # 4. Save to the LIVE Agent config and clear revoke flags
    $cfg.personalToken = $tok
    $cfg.tokenRevoked = $false
    $cfg.tokenRevokedReason = ""
    $cfg.tokenRevokedAt = $null
    $cfg.pairingCode = ""
    if ($res.user.email) {
        $cfg.memberEmail = $res.user.email
    }

    $cfg | ConvertTo-Json -Depth 5 | Set-Content $configFile -Encoding UTF8
    Write-Host " [+] Da luu ma Token moi vao config.json an toan." -ForegroundColor Green
    Write-Host " [+] Da xoa trang thai 'token thu hoi' — Agent co the dong bo lai." -ForegroundColor Green

    # 5. Restart background agent
    $svc = Get-Service -Name "TikTokFlowAgent" -ErrorAction SilentlyContinue
    if ($svc) {
        Restart-Service -Name "TikTokFlowAgent" -Force -ErrorAction SilentlyContinue
        Write-Host " [+] Da khoi dong lai Windows Service TikTokFlowAgent." -ForegroundColor Green
    } else {
        Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.js*' } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        } 2>$null

        Start-Sleep -Seconds 1
        $agentDir = Split-Path -Parent $configFile
        $node = Join-Path $agentDir "bin\node.exe"
        if (-not (Test-Path $node)) { $node = "node" }
        $agentJs = Join-Path $agentDir "agent.js"
        if (Test-Path $agentJs) {
            Start-Process -FilePath $node -ArgumentList "`"$agentJs`"","--daemon" -WorkingDirectory $agentDir -WindowStyle Hidden
            Write-Host " [+] Da khoi dong lai Agent tu: $agentDir" -ForegroundColor Green
        }
    }

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "   HOAN TAT! AGENT DA SAN SANG DONG BO SO LIEU          " -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    exit 0

} catch {
    $errorMsg = "Khong the ket noi toi may chu hoac Token khong hop le!"
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $jsonResp = $reader.ReadToEnd() | ConvertFrom-Json
            if ($jsonResp.error) {
                $errorMsg = $jsonResp.error
            }
        } catch {}
    } else {
        $errorMsg = $_.Exception.Message
    }

    Write-Host ""
    Write-Host " [LOI TU SERVER] $errorMsg" -ForegroundColor Red
    Write-Host " -> Token khong duoc luu. Vui long kiem tra lai ma Token tren website." -ForegroundColor Yellow
    exit 1
}

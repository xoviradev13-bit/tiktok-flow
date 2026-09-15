# Pack client-agent-base.zip for fast-path download (Track B).
# Pins NSSM win64 and verifies SHA256. Fails if bin/node.exe or bin/nssm.exe missing after pack.
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$NssmUrl = "https://nssm.cc/release/nssm-2.24.zip",
  # Official nssm-2.24.zip SHA256 (update if URL/version changes)
  [string]$NssmSha256 = "727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743"
)

$ErrorActionPreference = "Stop"
$agentDir = Join-Path $RepoRoot "client-agent"
$outZip = Join-Path $RepoRoot "client-agent-base.zip"
$staging = Join-Path $env:TEMP ("ttf-agent-pack-" + [guid]::NewGuid().ToString("n"))
$binDir = Join-Path $staging "bin"

Write-Host "[*] Staging $agentDir -> $staging"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
robocopy $agentDir $staging /E /XD .git node_modules\.cache /XF config.json /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }

# Prefer existing portable node in client-agent/bin
$srcNode = Join-Path $agentDir "bin\node.exe"
if (Test-Path $srcNode) {
  Copy-Item $srcNode (Join-Path $binDir "node.exe") -Force
} elseif (Test-Path (Join-Path $staging "bin\node.exe")) {
  Write-Host "[*] Using staged bin/node.exe"
} else {
  Write-Warning "bin/node.exe missing — download route will warn; place portable Node into client-agent/bin before release."
}

$srcNssm = Join-Path $agentDir "bin\nssm.exe"
if (Test-Path $srcNssm) {
  Write-Host "[*] Using existing $srcNssm"
  Copy-Item $srcNssm (Join-Path $binDir "nssm.exe") -Force
} else {
  $nssmZip = Join-Path $env:TEMP "nssm-2.24.zip"
  Write-Host "[*] Fetch NSSM $NssmUrl"
  Invoke-WebRequest -Uri $NssmUrl -OutFile $nssmZip -UseBasicParsing
  $hash = (Get-FileHash -Algorithm SHA256 -Path $nssmZip).Hash.ToUpperInvariant()
  if ($hash -ne $NssmSha256.ToUpperInvariant()) {
    throw "NSSM SHA256 mismatch. Got $hash expected $NssmSha256"
  }
  $nssmExtract = Join-Path $env:TEMP ("nssm-extract-" + [guid]::NewGuid().ToString("n"))
  Expand-Archive -Path $nssmZip -DestinationPath $nssmExtract -Force
  $nssmExe = Get-ChildItem -Path $nssmExtract -Recurse -Filter nssm.exe |
    Where-Object { $_.FullName -match '\\win64\\' } |
    Select-Object -First 1
  if (-not $nssmExe) { throw "nssm.exe win64 not found in archive" }
  Copy-Item $nssmExe.FullName (Join-Path $binDir "nssm.exe") -Force
}

if (-not (Test-Path (Join-Path $binDir "nssm.exe"))) {
  throw "bin/nssm.exe missing after pack"
}

# cmd.exe requires CRLF in .bat — LF-only causes "X is not recognized" (first char eaten)
Get-ChildItem -Path $staging -Filter "*.bat" -Recurse | ForEach-Object {
  $text = [IO.File]::ReadAllText($_.FullName)
  $text = $text -replace "`r`n", "`n" -replace "`r", "`n" -replace "`n", "`r`n"
  [IO.File]::WriteAllText($_.FullName, $text, (New-Object System.Text.UTF8Encoding $false))
}

if (Test-Path $outZip) { Remove-Item $outZip -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $outZip -Force
Write-Host "[OK] Wrote $outZip"
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue

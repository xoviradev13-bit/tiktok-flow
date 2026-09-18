# TikTokFlow Client Agent — uninstall cleanup helper
# Used by setup-agent.bat. Safe to run elevated.
param(
  [ValidateSet("KillOnly", "Delete", "All")]
  [string]$Phase = "All"
)

$ErrorActionPreference = "SilentlyContinue"

function Get-InstallRoots {
  $roots = @((Join-Path $env:ProgramFiles "TikTokFlow"))
  $p86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if ($p86) { $roots += (Join-Path $p86 "TikTokFlow") }
  $roots += (Join-Path $env:ProgramData "TikTokFlow")
  return $roots
}

function Stop-AgentProcesses {
  $roots = Get-InstallRoots
  $myPid = $PID
  $parentPid = $null
  try {
    $parentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$myPid").ParentProcessId
  } catch {}

  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.ProcessId -eq $myPid) { return }
    if ($parentPid -and $_.ProcessId -eq $parentPid) { return }

    $path = [string]$_.ExecutablePath
    $cmd = [string]$_.CommandLine
    $hit = $false

    # Only agent.js / install-dir binaries — never match our own "TikTokFlow" strings
    if ($cmd -and ($cmd -match 'agent\.js')) { $hit = $true }

    foreach ($r in $roots) {
      if ($path -and $path.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)) {
        $hit = $true
      }
    }

    if ($hit) {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }

  try {
    $ports = @(39741)
    foreach ($p in $ports) {
      $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
      foreach ($c in $conns) {
        if ($c.OwningProcess -gt 0 -and $c.OwningProcess -ne $myPid) {
          Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
      }
    }
  } catch {}

  Get-Process -Name "nssm" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Schedule-DeleteOnReboot([string]$path) {
  if (-not $path) { return }
  if (-not ("Win32.Native" -as [type])) {
    Add-Type -Namespace Win32 -Name Native -MemberDefinition @'
      [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
      public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
'@ -ErrorAction SilentlyContinue
  }
  if ("Win32.Native" -as [type]) {
    [Win32.Native]::MoveFileEx($path, $null, 4) | Out-Null
  }
}

function Remove-TreeForce([string]$t) {
  if (-not (Test-Path -LiteralPath $t)) { return $true }

  Stop-AgentProcesses

  for ($i = 0; $i -lt 12; $i++) {
    cmd /c "takeown /f `"$t`" /r /d y >nul 2>nul"
    cmd /c "icacls `"$t`" /grant Administrators:F /t /c /q >nul 2>nul"
    cmd /c "icacls `"$t`" /grant SYSTEM:F /t /c /q >nul 2>nul"

    Get-ChildItem -LiteralPath $t -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try { $_.Attributes = "Normal" } catch {}
    }

    try { Remove-Item -LiteralPath $t -Recurse -Force -ErrorAction Stop } catch {}
    if (-not (Test-Path -LiteralPath $t)) { return $true }

    # Rename aside then delete — clears some Explorer / indexer locks on the original path
    $renamed = "$t.__ttf_trash_$i"
    try {
      Rename-Item -LiteralPath $t -NewName ([IO.Path]::GetFileName($renamed)) -ErrorAction Stop
    } catch {}

    $delTarget = if (Test-Path -LiteralPath $renamed) { $renamed } else { $t }
    cmd /c "rd /s /q `"$delTarget`" >nul 2>nul"
    try { Remove-Item -LiteralPath $delTarget -Recurse -Force -ErrorAction SilentlyContinue } catch {}

    if (-not (Test-Path -LiteralPath $t) -and -not (Test-Path -LiteralPath $renamed)) {
      return $true
    }

    Stop-AgentProcesses
    Start-Sleep -Milliseconds 800
  }

  return $false
}

function Remove-InstallTrees {
  $needsReboot = $false
  $roots = Get-InstallRoots

  foreach ($t in $roots) {
    if (-not (Test-Path -LiteralPath $t)) { continue }

    $ok = Remove-TreeForce $t
    if (-not $ok -and (Test-Path -LiteralPath $t)) {
      Get-ChildItem -LiteralPath $t -Recurse -Force -File -ErrorAction SilentlyContinue |
        ForEach-Object { Schedule-DeleteOnReboot $_.FullName }
      Get-ChildItem -LiteralPath $t -Recurse -Force -Directory -ErrorAction SilentlyContinue |
        Sort-Object { $_.FullName.Length } -Descending |
        ForEach-Object { Schedule-DeleteOnReboot $_.FullName }
      Schedule-DeleteOnReboot $t
      $needsReboot = $true
    }

    $parent = Split-Path $t -Parent
    Get-ChildItem -LiteralPath $parent -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like "TikTokFlow.__ttf_trash_*" } |
      ForEach-Object {
        if (-not (Remove-TreeForce $_.FullName)) {
          Schedule-DeleteOnReboot $_.FullName
          $needsReboot = $true
        }
      }
  }

  if ($needsReboot) {
    Write-Host "[!] Mot vai file dang bi khoa. Da danh dau xoa tu dong sau khi KHOI DONG LAI may."
    return 1
  }
  return 0
}

if ($Phase -eq "KillOnly" -or $Phase -eq "All") {
  Stop-AgentProcesses
}

if ($Phase -eq "Delete" -or $Phase -eq "All") {
  exit (Remove-InstallTrees)
}

exit 0

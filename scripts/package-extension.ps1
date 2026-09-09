# Script to package TikTokFlow Companion Extension into ZIP for GPMLogin distribution
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ExtensionDir = Join-Path $ProjectRoot "extension"
$ZipOutput = Join-Path $ProjectRoot "TikTokFlow-Companion-Extension.zip"

if (-not (Test-Path $ExtensionDir)) {
    Write-Error "Extension directory not found at $ExtensionDir"
    exit 1
}

if (Test-Path $ZipOutput) {
    Remove-Item $ZipOutput -Force
}

Write-Output "Packaging TikTokFlow Companion Extension..."
Compress-Archive -Path "$ExtensionDir\*" -DestinationPath $ZipOutput -Force

Write-Output "Package created successfully: $ZipOutput"
Write-Output "Size: $([math]::Round((Get-Item $ZipOutput).Length / 1KB, 1)) KB"

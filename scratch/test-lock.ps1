$path = 'D:\Tiktok automation\500a1071-8dd2-43dd-9685-220721b0c4a4\Default\Network\Cookies'
try {
    $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
    $stream = New-Object System.IO.FileStream($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share)
    Write-Host "SUCCESS! Stream opened. Length = $($stream.Length) bytes"
    $stream.Close()
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}

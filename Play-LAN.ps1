# Serves this folder so the game loads on your phone over Wi‑Fi.
# Run: right-click → Run with PowerShell, OR: powershell -ExecutionPolicy Bypass -File .\Play-LAN.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .\index.html)) {
    Write-Host "ERROR: index.html not found in $PSScriptRoot"
    exit 1
}

$port = 8765
$lanIp = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and $_.IPAddress -notlike '127.*' } |
    Select-Object -ExpandProperty IPAddress -First 1

Write-Host ""
Write-Host "=== War of Dots — local web server ===" -ForegroundColor Cyan
Write-Host "Folder: $PSScriptRoot"
Write-Host ""
Write-Host "On THIS computer, open:" -ForegroundColor Green
Write-Host "  http://127.0.0.1:$port/index.html"
Write-Host ""
if ($lanIp) {
    Write-Host "On your PHONE (same Wi-Fi as this PC), open:" -ForegroundColor Green
    Write-Host "  http://${lanIp}:$port/index.html"
    Write-Host ""
    Write-Host "If the phone says it cannot connect:" -ForegroundColor Yellow
    Write-Host "  1) Windows may block the port — run PowerShell as Admin once:"
    Write-Host "     netsh advfirewall firewall add rule name=`"WOD Game $port`" dir=in action=allow protocol=TCP localport=$port"
    Write-Host "  2) Confirm the phone is on Wi-Fi, not mobile data only."
    Write-Host "  3) Keep this window open while you play."
} else {
    Write-Host "Could not detect a LAN IP (Wi‑Fi/Ethernet). Check ipconfig for IPv4." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

py -3 -m http.server $port --bind 0.0.0.0

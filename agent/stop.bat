@echo off
chcp 65001 >nul
echo Mencari proses STIKAR BROADCAST AGENT (node src/index.mjs)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*index.mjs*' } | ForEach-Object { Write-Host ('  Stop PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo [OK] Semua proses agent dihentikan. (MediaMTX/ffmpeg anak ikut terhenti via graceful shutdown)
pause

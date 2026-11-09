@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Jalankan agent di latar belakang (jendela tersembunyi).
rem Untuk menghentikan: jalankan stop.bat
powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'src/index.mjs' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
echo [OK] STIKAR BROADCAST AGENT dijalankan di latar belakang (hidden).
echo      Status: buka http://localhost:8082/ di browser.
echo      Stop   : stop.bat
pause

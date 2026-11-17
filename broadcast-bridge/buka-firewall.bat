@echo off
chcp 65001 >nul
title STIKAR — Buka Firewall Windows (LAN)
net session >nul 2>&1
if errorlevel 1 (
  echo [X] Klik kanan file ini ^> "Run as administrator", lalu jalankan lagi.
  pause
  exit /b 1
)
echo Membuka port untuk siaran lokal ^(hanya jaringan lokal, JANGAN port-forward di router^)...
netsh advfirewall firewall delete rule name="STIKAR Siaran Lokal TCP" >nul 2>&1
netsh advfirewall firewall delete rule name="STIKAR Siaran Lokal UDP" >nul 2>&1
netsh advfirewall firewall add rule name="STIKAR Siaran Lokal TCP" dir=in action=allow protocol=TCP localport=8080,8888,8889 profile=private,public
netsh advfirewall firewall add rule name="STIKAR Siaran Lokal UDP" dir=in action=allow protocol=UDP localport=8189 profile=private,public
echo.
echo Selesai. Port 8078 ^(bridge^) sengaja TIDAK dibuka — hanya untuk laptop ini.
pause

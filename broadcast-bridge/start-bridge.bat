@echo off
chcp 65001 >nul
title STIKAR BROADCAST BRIDGE — Battle Off Friends
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js tidak ditemukan. Install dulu: https://nodejs.org ^(versi 18 atau lebih baru^)
  pause
  exit /b 1
)

if not exist node_modules (
  echo [SETUP] Menginstall dependensi ^(sekali saja, butuh internet^)...
  call npm install
  if errorlevel 1 (
    echo [X] npm install gagal — cek koneksi internet lalu jalankan lagi.
    pause
    exit /b 1
  )
)

echo.
echo  Bridge akan: membuat .env + token otomatis, membaca password OBS,
echo  menjalankan MediaMTX, dan mendeteksi IP laptop. Jangan tutup jendela ini selama acara.
echo.
node src\index.js
echo.
echo [!] Bridge berhenti. Tekan tombol apa saja untuk menutup.
pause >nul

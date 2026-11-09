@echo off
chcp 65001 >nul
title STIKAR BROADCAST AGENT — Battle Off Friends
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js tidak ditemukan. Install dulu: https://nodejs.org ^(versi 20 atau lebih baru^)
  pause
  exit /b 1
)

if not exist node_modules (
  echo [SETUP] Menginstall dependensi ^\(sekali saja^)...
  call npm install
  if errorlevel 1 (
    echo [X] npm install gagal — cek koneksi internet lalu jalankan lagi.
    pause
    exit /b 1
  )
  echo [SETUP] Untuk kontrol input di Windows, install koffi juga:
  echo         npm install koffi
)

echo ============================================
echo   STIKAR BROADCAST AGENT — mulai...
echo   Jangan tutup jendela ini selama siaran!
echo ============================================
node src\index.mjs
pause

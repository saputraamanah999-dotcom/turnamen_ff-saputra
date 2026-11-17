#!/usr/bin/env bash
# Jalankan STIKAR Broadcast Bridge (macOS / Linux)
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "[X] Node.js (>=18) belum terpasang: https://nodejs.org"; exit 1; }
[ -d node_modules ] || { echo "[SETUP] npm install..."; npm install || exit 1; }
exec node src/index.js

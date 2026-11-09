# ZEROID AI OBSERVER

Service Python **lokal** untuk menganalisis frame gameplay Free Fire yang **terlihat di layar** (screen
capture via `mss`), membantu operator turnamen memahami *apa yang sedang terjadi* pada pemain yang
di-spectate: nama pemain HUD, perpindahan target, kill feed, map, dan minimap (eksperimental).

> **Prinsip kepatuhan (WAJIB)**
> - ✅ Hanya membaca **piksel layar** (screen capture `mss`) + OCR HUD offline (`rapidocr-onnxruntime`)
> - ❌ **TANPA** akses memori game / injeksi kode
> - ❌ **TANPA** API berbayar / cloud — 100% lokal & gratis
> - ❌ **TANPA** mengunggah frame ke internet (frame tidak pernah keluar dari mesin)
> - 🔒 Bind default `127.0.0.1:8077` (localhost-only)

---

## 1. Instalasi

```bash
cd observer-ai
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`rapidocr-onnxruntime` jika gagal terpasang, service tetap jalan dengan status
`ocrAvailable: false` (OCR otomatis dilewati, event visual lain tetap berjalan).

## 2. Konfigurasi

Semua setting bisa di-override lewat environment variable berprefix `OBSERVER_` atau file `.env`:

| Variabel               | Default  | Keterangan                                          |
|------------------------|----------|-----------------------------------------------------|
| `OBSERVER_HOST`        | 127.0.0.1| Alamat bind (jangan diekspos publik)                |
| `OBSERVER_PORT`        | 8077     | Port HTTP/WS                                        |
| `OBSERVER_FPS`         | 1        | Sampling frame: `1`, `2`, atau `5`                   |
| `OBSERVER_MONITOR_INDEX` | 1      | Monitor mss yang di-capture (1 = utama)             |
| `OBSERVER_SAVE_SCREENSHOTS` | false | Simpan frame saat event ke `data/screenshots/` (lokal) |
| `OBSERVER_CPU_THRESHOLD` | 85     | % CPU; di atas ini OCR/vision berat dilewati (power-save) |
| `OBSERVER_REGIONS`     | (default)| JSON dict region `[x,y,w,h]`                        |

## 3. Kalibrasi region HUD

Koordinat region mengikuti **frame hasil capture** (lebar dibatasi **1280px**). Default mengasumsikan
frame 1280x720. Cara kalibrasi:

1. Jalankan service, buka `http://127.0.0.1:8077/docs`.
2. Salin `calibration.example.json` → `calibration.json`, sesuaikan `x, y, w, h` tiap region:
   - `player_hud` : nama pemain yang di-spectate
   - `team_hud`   : nama tim pemain
   - `map_name`   : nama map (kiri atas)
   - `killfeed`   : area kill feed (kanan atas)
   - `minimap`    : area minimap (eksperimental)
3. Atau kirim via API:

```bash
curl -X POST http://127.0.0.1:8077/calibration \
  -H 'Content-Type: application/json' \
  -d @calibration.example.json
```

Cek region aktif: `curl http://127.0.0.1:8077/calibration`.

## 4. Menjalankan

```bash
python run.py
```

- API docs: `http://127.0.0.1:8077/docs`
- WebSocket realtime: `ws://127.0.0.1:8077/ws`
- Aktifkan match: `curl -X POST http://127.0.0.1:8077/match/activate -H 'Content-Type: application/json' -d '{"matchId":"FF-001"}'`

## 5. Endpoint REST

| Method | Path                              | Fungsi                                             |
|--------|-----------------------------------|----------------------------------------------------|
| GET    | `/health`                         | Indikator layanan hidup                            |
| GET    | `/status`                         | cpu, memory, fps, lastFrameTime, latencyMs, ocrAvailable, map/minimap status, dsb. |
| GET    | `/events?limit=50`                | Riwayat event (ring buffer 500, dedup 10 detik)    |
| POST   | `/events/{id}/confirm`            | Tandai event valid                                 |
| POST   | `/events/{id}/false-positive`     | Tandai event salah deteksi                         |
| GET    | `/recommendations`                | Ranking target HIGH/MEDIUM/LOW + confidence%       |
| POST   | `/recommendations/{id}/dismiss`   | Abaikan rekomendasi                                |
| POST   | `/match/activate`                 | Set matchId aktif untuk tagging event              |
| GET/POST | `/calibration`                  | Lihat / perbarui region kalibrasi                  |

Event types: `SPECTATOR_TARGET_CHANGED`, `POSSIBLE_ENGAGEMENT`, `ELIMINATION_DETECTED`,
`MULTIPLE_ELIMINATIONS`, `POSSIBLE_TEAM_FIGHT`, `QUIET_PERIOD` — semua berstatus `pending`
dan **tidak pernah mengubah skor resmi**; konfirmasi akhir tetap di tangan operator.

## 6. Struktur folder

```
observer-ai/
├── run.py                     # entrypoint uvicorn
├── requirements.txt
├── catalog.json               # katalog map (BERMUDA/PURGATORY/KALAHARI/ALPINE/NEXTERRA)
├── calibration.example.json   # contoh region kalibrasi
├── calibration.json           # (opsional) hasil kalibrasi
└── app/
    ├── config.py              # pydantic-settings
    ├── main.py                # FastAPI lifespan + pipeline analisis
    ├── capture/screen_capture.py
    ├── ocr/reader.py
    ├── tracking/player_tracker.py
    ├── vision/killfeed.py · fight.py
    ├── maps/recognizer.py
    ├── minimap/monitor.py
    ├── events/engine.py
    ├── recommendations/engine.py
    ├── api/routes.py · websocket.py
    └── models/schemas.py
```

## 7. Keamanan & privasi

- **localhost-only**: server bind `127.0.0.1`; tidak ada trafik keluar. CORS dibatasi origin `localhost/127.0.0.1`.
- **Frame tidak pernah diunggah**; `save_screenshots=true` hanya menulis file lokal di `data/screenshots/`.
- Tidak ada telemetry, tidak ada API key, tidak ada biaya.

## 8. Batasan & disclaimer

- **Tidak sempurna**: OCR bisa salah membaca HUD → nama menjadi `PEMAIN TIDAK DIKENAL`; map tidak yakin → `MAP TIDAK DIKENAL DENGAN YAKIN`; minimap selalu `APPROXIMATE` / `MINIMAP TIDAK DAPAT DITAFSIRKAN`.
- **Event bersifat kemungkinan** (`POSSIBLE_*`) berbasis piksel — bukan keputusan, bukan skor resmi, dan tidak pernah mengubah hasil pertandingan.
- Perlu **kalibrasi manual** per resolusi layar/layout HUD; HUD Free Fire sering berubah per versi game.
- `mss` bekerja baik di X11; pada Wayland beberapa desktop butuh konfigurasi/izin screencast tambahan.
- Konsumsi CPU disengaja rendah (FPS 1–5, frame ≤1280px, power-save otomatis saat `cpu >= cpu_threshold`).
- Gunakan hanya untuk kebutuhan broadcasting/turnamen internal yang diizinkan; hormati ToS game dan privasi pemain.

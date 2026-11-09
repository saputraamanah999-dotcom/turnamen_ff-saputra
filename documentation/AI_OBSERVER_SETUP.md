# AI_OBSERVER_SETUP.md — AI Observer Lokal (Port 8077)

**AI Observer** adalah program Python yang berjalan **lokal di laptop produksi**. Ia membaca layar permainan (via analisis frame lokal dengan **OCR + computer vision**) dan memberikan **indikasi event** — misalnya indikasi kill atau indikasi perubahan situasi — lengkap dengan tingkat keyakinan (**confidence**).

> **Tiga prinsip yang wajib dipahami operator:**
> 1. Hasil AI hanyalah **INDIKASI**, bukan skor resmi.
> 2. AI **TIDAK mengubah skor resmi**. Semua skor tetap dikonfirmasi **manual oleh operator** lalu diinput ke website.
> 3. **Privasi:** frame dianalisis di laptop. **Frame tidak diunggah ke internet.**

---

## 1. Prasyarat

- Laptop produksi (yang juga menjalankan OBS) atau laptop kedua di jaringan yang sama.
- **Python 3.10 atau lebih baru** — cek dengan:

```bash
python --version
```

Jika belum ada, unduh di `https://www.python.org/downloads/` (saat install Windows, centang **Add python.exe to PATH**).
- Folder proyek AI Observer (Python) lengkap dengan file `requirements.example.txt`.
- Website BOF berjalan, dan Anda punya akses `/admin`.

---

## 2. Install (venv + pip)

Buka terminal/CMD di folder proyek AI Observer, lalu:

```bash
# 1. Buat lingkungan virtual (venv) agar dependensi tidak bercampur sistem
python -m venv venv

# 2. Aktifkan venv
# Windows:
venv\Scripts\activate
# Linux:
source venv/bin/activate

# 3. Install dependensi (file .example.txt disalin dulu sekali)
cp requirements.example.txt requirements.txt
pip install -r requirements.txt
```

Setiap kali akan menjalankan AI Observer di masa depan, **aktifkan venv dulu** (langkah 2), baru jalankan program.

📸 [Tempel screenshot: terminal menampilkan hasil pip install -r requirements.txt yang sukses]

---

## 3. Jalankan AI Observer

1. Dengan venv aktif, jalankan server AI sesuai instruksi folder proyek (umumnya `python main.py` atau perintah yang tercantum di README folder tersebut).
2. Saat berjalan, AI Observer membuka layanan lokal di **`http://127.0.0.1:8077`**. `127.0.0.1` berarti "hanya laptop ini" — aman dari akses luar.
3. Biarkan jendela/terminal AI Observer **tetap terbuka** selama pertandingan.
4. Uji cepat: buka `http://127.0.0.1:8077` di browser laptop — halaman status AI Observer harus tampil.

---

## 4. Kalibrasi Region HUD & Minimap

Agar OCR dan computer vision membaca layar dengan benar, **region** (kotak area) pada layar harus dikalibrasi: area **HUD** (bar atas bawah layar Free Fire — jumlah player alive, kill feed, dsb.) dan **minimap** (peta kecil pojok layar).

1. Jalankan AI Observer, buka halaman/fitur kalibrasi (sesuai menu pada program AI).
2. AI akan menampilkan frame terakhir dari layar permainan.
3. Tarik kotak region pada:
   - **HUD**: area tempat angka penting muncul (jumlah pemain hidup, kill feed).
   - **Minimap**: kotak peta pojok layar.
4. Kotak harus **pas dan rapat** di sekitar elemen: tidak terlalu lebar (ikut menangkap background) dan tidak terlalu sempit (memotong angka).
5. Simpan kalibrasi. Kalibrasi berlaku untuk resolusi layar saat ini — **kalibrasi ulang jika resolusi/scaling scrcpy berubah**.
6. Uji: jalankan satu game, amati apakah angka HUD terbaca benar pada hasil analisis.

**Sumber frame untuk AI:** program AI membaca layar laptop (window/screen capture lokal). Pastikan jendela scrcpy/gameplay terlihat jelas, **tidak di-minimize**, dan tidak tertutup jendela lain, karena AI menganalisis frame lokal yang tampak di layar.

---

## 5. Atur FPS Analisis (1 / 2 / 5)

AI Observer menganalisis frame dengan laju yang bisa dipilih:

| FPS | Kapan dipakai | Catatan |
|---|---|---|
| **1 FPS** | Laptop lemah / tes awal | Paling hemat CPU, deteksi paling lambat |
| **2 FPS** | Rekomendasi umum turnamen sekolah | Seimbang antara kecepatan dan beban |
| **5 FPS** | Laptop kuat, butuh respons cepat | Beban CPU paling tinggi; pantau suhu laptop |

Cara mengatur: konfigurasi fps pada program AI (file konfigurasi atau menu kalibrasi), atau argumen saat menjalankan. Mulai dari **1 FPS** untuk tes, naik ke **2 FPS** untuk hari-H, gunakan **5 FPS** hanya jika laptop stabil.

---

## 6. Hubungkan dari Admin > AI Observer

1. Login di website → `/admin`.
2. Buka menu **AI Observer**.
3. Masukkan URL layanan AI: **`http://127.0.0.1:8077`** (default bila AI berjalan di laptop yang sama).
4. Klik hubungkan/save. Status koneksi harus menunjukkan **terhubung**.
5. Jika AI Observer berjalan di **laptop kedua** dalam LAN sekolah: isi `http://IP-LAPTOP-AI:8077` (IP laptop AI), dan pastikan firewall laptop AI mengizinkan port 8077 **hanya untuk jaringan lokal**.
6. Setelah terhubung, halaman Admin > AI Observer menampilkan hasil analisis secara langsung (event indikasi + confidence).

**Broadcast Bridge (port 8078):** layanan lokal ini menghubungkan sisi OBS dengan website; jalankan sesuai panduan proyek bila fitur bridge dipakai. Jika bridge tidak connect, periksa obs-websocket dan token — lihat [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## 7. Cara Membaca Hasil Analisis

Setiap event dari AI berisi:

| Field | Arti |
|---|---|
| Waktu | Kapan frame dianalisis |
| Jenis event | Misalnya indikasi kill / indikasi situasi permainan |
| Target | Tim/pemain yang terindikasi (sesuai yang terbaca) |
| **Confidence** | Tingkat keyakinan AI, biasanya persentase |

**Interpretasi confidence:**
- **Tinggi (± di atas 70–80%)**: indikasi kuat — tetap **cek feed/layar** sebelum dipakai sebagai dasar input skor.
- **Sedang (40–70%)**: indikasi mungkin — wajib konfirmasi visual.
- **Rendah (di bawah 40%)**: kemungkinan salah baca (glare, efek, angka kecil) — abaikan atau verifikasi ekstra.

**Ingat terus:** hasil ini **hanya membantu operator**, tidak pernah otomatis menjadi skor.

---

## 8. Konfirmasi Event (Alur Resmi BOF)

1. AI menampilkan indikasi event dengan confidence.
2. Operator **melihat langsung** layar permainan (jendela scrcpy di OBS) untuk memverifikasi: benar ada kill/tidak.
3. Jika benar → catat pada lembar pencatatan (form/klip pan) dan masukkan **hasil resmi** melalui `/admin` setelah match selesai (atau saat itu juga sesuai SOP panitia).
4. Jika salah/tidak jelas → abaikan indikasi. Bila AI sering salah baca, lihat [guides/GUIDE_17](guides/GUIDE_17_atasi-ai-gagal-baca-hud.md).
5. Skor resmi di website hanya berasal dari input manual operator ini.

---

## 9. Batasan & Disclaimer (Wajib Dibaca Panitia)

1. AI Observer berjalan **1–5 FPS** — tidak real-time penuh; event yang sangat cepat bisa terlewat atau terlambat beberapa detik.
2. Akurasi bergantung kualitas frame: resolusi, kerja OCR, efek visual game, pencahayaan layar. Hasil **bisa salah**.
3. AI **tidak mengubah skor resmi** dan **tidak menulis ke leaderboard otomatis**. Panitia tetap bertanggung jawab penuh atas skor.
4. Gunakan sebagai alat **bantu pencatatan**, bukan hakim keputusan. Semua sengketa diputuskan panitia dengan bukti rekaman.
5. **Privasi:** frame layar dianalisis di laptop lokal; **frame tidak diunggah ke internet**. Jangan mengubah konfigurasi agar mengirim frame keluar.

---

## 10. Checklist Akhir AI Observer

- [ ] Python 3.10+ terpasang.
- [ ] venv dibuat, `pip install -r requirements.txt` sukses.
- [ ] AI Observer berjalan, `http://127.0.0.1:8077` tampil di browser.
- [ ] Region HUD & minimap sudah dikalibrasi dan diuji.
- [ ] FPS analisis dipilih (mulai 1–2 FPS).
- [ ] Admin > AI Observer terhubung.
- [ ] Operator memahami: indikasi ≠ skor resmi; konfirmasi manual wajib.
- [ ] Frame tetap lokal (tidak dikirim ke internet).

Panduan operator: [guides/GUIDE_12](guides/GUIDE_12_jalankan-ai-observer.md), [guides/GUIDE_13](guides/GUIDE_13_baca-hasil-analisis-ai.md).

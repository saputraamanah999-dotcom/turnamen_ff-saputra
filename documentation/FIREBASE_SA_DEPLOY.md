# Deploy Firebase Otomatis via Service Account (Rules + Index + Verifikasi E2E)

> Masalah yang diselesaikan: tahap ⑤ (rules) & ⑥ (indexes) di `setup.html` berjalan
> dari **browser** sehingga rawan gagal (CORS, izin IAM akun Google yang dipakai,
> kontrak API). Script di sini berjalan **server-side** dengan service account —
> satu perintah, tanpa klik-klik console.

## Kapan dipakai?

| Gejala | Solusi |
| --- | --- |
| `Missing or insufficient permissions` saat tombol admin menulis (mis. REGISTRASI PERANGKAT INI di `/admin/interactive-stream`) | `python3 scripts/deploy-firestore.py` (langkah 1–2) |
| Ingin memastikan rules di cloud identik dengan `firebase/firestore.rules` di repo | langkah 1–2 + 4 |
| Ingin bukti nyata rules mengizinkan admin & menolak anonim | `python3 scripts/verify-rules-e2e.py` |

## Langkah

1. **Buat service account key** — Firebase Console → ⚙️ Project settings →
   *Service accounts* → **Generate new private key** → simpan sebagai
   `service-account.json` di **root repo**.
   ⚠️ File ini = kunci penuh project. Sudah di-gitignore (`**/service-account*.json`)
   — **JANGAN PERNAH di-commit / di-share**. Hapus setelah dipakai bila tidak rutin.

2. **Install dependensi Python** (sekali saja):
   ```bash
   pip install pyjwt cryptography requests
   ```

3. **Deploy rules (+ index bila SA diizinkan):**
   ```bash
   python3 scripts/deploy-firestore.py
   ```
   Yang dilakukan: baca rules aktif → buat ruleset dari `firebase/firestore.rules`
   → pasang release (`cloud.firestore`/`firebase.firestore`) → buat composite
   indexes dari `firebase/firestore.indexes.json` → verifikasi akhir.

4. **Verifikasi end-to-end (opsional tapi disarankan):**
   ```bash
   python3 scripts/verify-rules-e2e.py
   ```
   Membuat user admin sementara, mencoba `CREATE interactiveDevices` (harus
   DIIZINKAN) dan tanpa login (harus DITOLAK 403), lalu membersihkan artefak uji.

## Catatan composite index

Saat ini **aplikasi tidak menjalankan satu pun compound query** (hanya
`orderBy` single-field → dicover auto-index). Jadi index composite bersifat
opsional. Bila kelak ada query `where(...) + orderBy(...)` dan muncul error
`The query requires an index`, buat manual via **Console → Firestore → Indexes**
atau beri SA peran *Cloud Datastore Index Admin* lalu jalankan ulang script.

## Keamanan

- Script hanya mengirim data ke `googleapis.com` resmi.
- Private key service account tidak pernah dicetak/log.
- Token OAuth hanya hidup 1 jam di memori proses.
- `verify-rules-e2e.py` membuat & menghapus user ujinya sendiri — tidak menyentuh
  akun asli, tidak mengubah skor/match.

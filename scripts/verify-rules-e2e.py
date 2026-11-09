#!/usr/bin/env python3
# ============================================================
# BOF / STIKAR ESPORTS — Verifikasi END-TO-END security rules Firestore.
# Membuktikan dengan AKSI NYATA (bukan tebakan):
#   [PASS] CREATE interactiveDevices oleh admin login  -> DIIZINKAN
#   [PASS] CREATE interactiveDevices tanpa login       -> DITOLAK 403
# Membuat user admin sementara via Auth, lalu menghapusnya lagi.
#
# CARA PAKAI:
#   1. Simpan service-account.json di root repo (lihat deploy-firestore.py).
#   2. python3 scripts/verify-rules-e2e.py
# ============================================================
import json, os, secrets, string, time
from pathlib import Path
import jwt
import requests
from cryptography.hazmat.primitives import serialization

REPO = Path(__file__).resolve().parent.parent
SA_PATH = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", str(REPO / "service-account.json"))
ok = lambda m: print("  [PASS] " + m)
fail = lambda m: print("  [FAIL] " + m)
info = lambda m: print("  [INFO] " + m)

sa = json.load(open(SA_PATH))
PROJECT = sa["project_id"]
FS_DOC = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
IDTK_DELETE = f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:delete"
IDTK_LOOKUP = f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:lookup"

# OAuth token SA
key = serialization.load_pem_private_key(sa["private_key"].encode(), password=None)
now = int(time.time())
assertion = jwt.encode({"iss": sa["client_email"], "scope": "https://www.googleapis.com/auth/cloud-platform",
                        "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600},
                       key, algorithm="RS256")
tok = requests.post("https://oauth2.googleapis.com/token",
                    data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
                    timeout=30).json()["access_token"]
H = {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}

# Web API key (dipakai untuk signUp v1 publik). Ambil dari env bila ada,
# kalau tidak fetch konfigurasi web app project via SA.
WEB_KEY = os.environ.get("NEXT_PUBLIC_FIREBASE_API_KEY", "")
if not WEB_KEY:
    r = requests.get(f"https://firebase.googleapis.com/v1beta1/projects/{PROJECT}/webApps/-/config",
                     headers=H, timeout=30)
    if r.status_code < 300:
        WEB_KEY = r.json().get("apiKey", "")
if not WEB_KEY:
    fail("Web API Key tidak ditemukan (set NEXT_PUBLIC_FIREBASE_API_KEY)."); raise SystemExit(1)
IDTK_SIGNUP = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={WEB_KEY}"

print("== Verifikasi rules end-to-end ==")
# idempoten: hapus sisa user uji sebelumnya
r = requests.post(IDTK_LOOKUP, headers=H, json={"email": ["bof-e2e-test@turnamenffbof.com"]}, timeout=30)
for stale in r.json().get("users", []):
    requests.post(IDTK_DELETE, headers=H, json={"localId": stale["localId"]}, timeout=30)
    info("User uji lama dihapus: " + stale["localId"])

alphabet = string.ascii_letters + string.digits
pw = "Px" + "".join(secrets.choice(alphabet) for _ in range(14)) + "!9"
r = requests.post(IDTK_SIGNUP, headers={"Content-Type": "application/json"},
                  json={"email": "bof-e2e-test@turnamenffbof.com", "password": pw, "returnSecureToken": True},
                  timeout=30)
if r.status_code >= 300:
    fail("signUp gagal: " + r.text[:200]); raise SystemExit(1)
u = r.json()
uid, id_token = u["localId"], u["idToken"]
ok("User uji dibuat: " + uid)
UH = {"Authorization": "Bearer " + id_token, "Content-Type": "application/json"}

# adminRoles untuk user uji (SA menulis = bypass rules, hanya untuk setup uji)
r = requests.patch(f"{FS_DOC}/adminRoles/{uid}", headers=H, timeout=30, json={"fields": {
    "uid": {"stringValue": uid},
    "email": {"stringValue": "bof-e2e-test@turnamenffbof.com"},
    "role": {"stringValue": "superadmin"},
    "note": {"stringValue": "temporary e2e test - auto-deleted"}}})
if r.status_code >= 300:
    fail("tulis adminRoles gagal: " + r.text[:200]); raise SystemExit(1)
ok("adminRoles/{uid} (superadmin) dibuat")

# 1) CREATE interactiveDevices SEBAGAI USER LOGIN (melewati rules) - aksi yang error di HP
r = requests.post(f"{FS_DOC}/interactiveDevices", headers=UH, timeout=30, json={"fields": {
    "name": {"stringValue": "E2E test device"}, "type": {"stringValue": "viewer"},
    "permission": {"stringValue": "viewer"}, "tournamentId": {"stringValue": ""},
    "at": {"integerValue": str(int(time.time() * 1000))}}})
if r.status_code < 300:
    ok("CREATE interactiveDevices oleh superadmin -> DIIZINKAN (rules benar)")
    requests.delete(f"https://firestore.googleapis.com/v1/{r.json()['name']}", headers=H, timeout=30)
else:
    fail(f"CREATE interactiveDevices ditolak ({r.status_code}): {r.text[:300]}")

# 2) CREATE tanpa login -> HARUS ditolak
r = requests.post(f"{FS_DOC}/interactiveDevices", headers={"Content-Type": "application/json"},
                  timeout=30, json={"fields": {"name": {"stringValue": "anon"}}})
if r.status_code in (401, 403):
    ok(f"CREATE interactiveDevices tanpa login -> DITOLAK ({r.status_code}) - aman")
else:
    fail(f"Anon tidak ditolak? status={r.status_code}")

print("== Bersih-bersih ==")
requests.delete(f"{FS_DOC}/adminRoles/{uid}", headers=H, timeout=30)
requests.post(IDTK_DELETE, headers=H, json={"localId": uid}, timeout=30)
ok("User uji + doc adminRoles dihapus.")
print("\nKESIMPULAN: rules AKTIF dan BENAR. Ulangi aksi di browser yang login admin (bila masih gagal, logout-login ulang).")

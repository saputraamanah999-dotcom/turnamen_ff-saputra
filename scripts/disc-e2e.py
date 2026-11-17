#!/usr/bin/env python3
# ============================================================
# E2E TEST RULES DISCIPLINARY (live) — turnamenffbof
# Pola: buat admin sementara (web-key signUp) -> uji read/write
#       sesuai rules -> bersih-bersih (idempoten).
# Jalankan: python3 scripts/disc-e2e.py  (dari root repo)
# ============================================================
import json, os, time, uuid, requests, jwt
from pathlib import Path
from cryptography.hazmat.primitives import serialization

REPO = Path(__file__).resolve().parent.parent
SA = json.load(open(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", REPO / "secrets/serviceAccountKey.json")))
PROJECT = "turnamenffbof"
WEB_KEY = os.environ.get("NEXT_PUBLIC_FIREBASE_API_KEY", "")
if not WEB_KEY:
    envf = REPO / ".env"
    if envf.exists():
        for line in envf.read_text().splitlines():
            if line.startswith("NEXT_PUBLIC_FIREBASE_API_KEY="):
                WEB_KEY = line.split("=", 1)[1].strip()
if not WEB_KEY:
    raise SystemExit("Web API key tidak ditemukan (.env / env)")

FS = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}"

# ---------- token SA ----------
key = serialization.load_pem_private_key(SA["private_key"].encode(), None)
now = int(time.time())
assertion = jwt.encode(
    {"iss": SA["client_email"], "scope": "https://www.googleapis.com/auth/cloud-platform",
     "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600},
    key, algorithm="RS256")
SA_TOK = requests.post("https://oauth2.googleapis.com/token",
                       data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
                       timeout=30).json()["access_token"]
SA_H = {"Authorization": "Bearer " + SA_TOK, "Content-Type": "application/json"}

# ---------- admin sementara ----------
SUFFIX = uuid.uuid4().hex[:8]
EMAIL = f"disc-e2e-{SUFFIX}@bof-test.local"
PASSWORD = "Disc-E2E-2026!"

r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={WEB_KEY}",
                  json={"email": EMAIL, "password": PASSWORD, "returnSecureToken": True}, timeout=30)
r.raise_for_status()
UID = r.json()["localId"]
USER_H = {"Authorization": "Bearer " + r.json()["idToken"], "Content-Type": "application/json"}

# ---------- helpers ----------
def sa_set(path, fields):
    rr = requests.patch(f"{FS}/{path}", json={"fields": fields}, headers=SA_H, timeout=30)
    return rr.status_code

def sa_del(path):
    return requests.delete(f"{FS}/{path}", headers=SA_H, timeout=30).status_code

def user_post(coll, doc_id, fields):
    return requests.post(f"{FS}/{coll}?documentId={doc_id}", json={"fields": fields}, headers=USER_H, timeout=30)

def user_patch(path, fields):
    return requests.patch(f"{FS}/{path}", json={"fields": fields}, headers=USER_H, timeout=30)

def user_delete(path):
    return requests.delete(f"{FS}/{path}", headers=USER_H, timeout=30)

def anon_post(coll, doc_id, fields):
    return requests.post(f"{FS}/{coll}?documentId={doc_id}", json={"fields": fields}, timeout=30)

def fstr(v): return {"stringValue": v}
def fint(v): return {"integerValue": str(v)}
def fts():  return {"timestampValue": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

results = []
def check(name, ok, extra=""):
    results.append((name, ok, extra))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {extra}")

# ---------- bersihkan sisa test sebelumnya (idempoten) ----------
for c in ["disciplinaryViolations", "disciplinaryPenalties", "disciplinaryLogs"]:
    rr = requests.get(f"{FS}/{c}?pageSize=300", headers=SA_H, timeout=30)
    for d in rr.json().get("documents", []):
        if "e2e-" in d["name"].rsplit("/", 1)[1]:
            sa_del(d["name"].split("/databases/(default)/documents/")[1])
    for d in requests.get(f"https://identitytoolkit.googleapis.com/v1/accounts:query", headers=SA_H,
                          json={"expression": "disc-e2e-", "limit": 50}, timeout=30).json().get("userInfo", []) if False else []:
        pass

try:
    # admin sementara = superadmin
    assert sa_set(f"adminRoles/{UID}", {"role": fstr("superadmin"), "updatedAt": fts()}) == 200
    time.sleep(1)  # beri waktu claims/rules membaca adminRoles

    V = {"tournamentId": fstr("bof-main"), "teamId": fstr("t01"), "type": fstr("TEASING"),
         "status": fstr("PENDING"), "severity": fstr("minor"), "note": fstr("e2e"),
         "createdAt": fts(), "createdBy": fstr("disc-e2e")}

    # 1) staff/superadmin boleh create violations
    rr = user_post("disciplinaryViolations", f"e2e-{SUFFIX}", V)
    check("superadmin CREATE disciplinaryViolations", rr.status_code == 200, rr.text[:80] if rr.status_code != 200 else "")

    # 2) boleh update violations
    rr = user_patch(f"disciplinaryViolations/e2e-{SUFFIX}", {"note": fstr("e2e-edit"), "status": fstr("VERIFIED")})
    check("superadmin UPDATE disciplinaryViolations", rr.status_code == 200, rr.text[:80] if rr.status_code != 200 else "")

    # 3) boleh create logs (audit)
    rr = user_post("disciplinaryLogs", f"e2e-{SUFFIX}", {"action": fstr("TEST"), "actorId": fstr(UID),
                  "reason": fstr("e2e"), "createdAt": fts()})
    check("superadmin CREATE disciplinaryLogs", rr.status_code == 200, rr.text[:80] if rr.status_code != 200 else "")

    # 4) logs TIDAK boleh diupdate (create-only)
    rr = user_patch(f"disciplinaryLogs/e2e-{SUFFIX}", {"reason": fstr("hack")})
    check("UPDATE disciplinaryLogs DITOLAK (create-only)", rr.status_code == 403, f"got={rr.status_code}")

    # 5) logs TIDAK boleh dihapus admin
    rr = user_delete(f"disciplinaryLogs/e2e-{SUFFIX}")
    check("DELETE disciplinaryLogs DITOLAK", rr.status_code == 403, f"got={rr.status_code}")

    # 6) anonim tidak boleh create violations
    rr = anon_post("disciplinaryViolations", f"e2e-anon-{SUFFIX}", V)
    check("ANONIM CREATE disciplinaryViolations DITOLAK", rr.status_code == 403, f"got={rr.status_code}")

    # 7) anonim tidak boleh read
    rr = requests.get(f"{FS}/disciplinaryViolations/e2e-{SUFFIX}", timeout=30)
    check("ANONIM READ disciplinaryViolations DITOLAK", rr.status_code == 403, f"got={rr.status_code}")

    # 8) user biasa (bukan staff) tidak boleh read
    r2 = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={WEB_KEY}",
                       json={"email": f"disc-plain-{SUFFIX}@bof-test.local", "password": PASSWORD, "returnSecureToken": True}, timeout=30)
    if r2.status_code == 200:
        plain_h = {"Authorization": "Bearer " + r2.json()["idToken"]}
        rr = requests.get(f"{FS}/disciplinaryViolations/e2e-{SUFFIX}", headers=plain_h, timeout=30)
        check("NON-STAFF READ DITOLAK", rr.status_code == 403, f"got={rr.status_code}")
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={WEB_KEY}",
                      json={"idToken": r2.json()["idToken"]}, timeout=30)
    else:
        check("NON-STAFF READ DITOLAK", False, f"signUp gagal: {r2.status_code}")

finally:
    # ---------- cleanup ----------
    for p in [f"disciplinaryViolations/e2e-{SUFFIX}", f"disciplinaryLogs/e2e-{SUFFIX}",
              f"disciplinaryPenalties/e2e-{SUFFIX}", f"adminRoles/{UID}"]:
        sa_del(p)
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={WEB_KEY}",
                  json={"idToken": USER_H["Authorization"].split(" ")[1]}, timeout=30)

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)} pass, {len(fails)} fail")
raise SystemExit(1 if fails else 0)

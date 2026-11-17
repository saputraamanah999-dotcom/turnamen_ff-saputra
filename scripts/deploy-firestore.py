#!/usr/bin/env python3
# ============================================================
# BOF / STIKAR ESPORTS — Deploy Firestore Rules + Composite Indexes
# Langsung ke project Firebase via SERVICE ACCOUNT (server-side),
# tanpa lewat browser — menghindari masalah CORS/IAM yang selama ini
# membuat tahap ⑤ & ⑥ setup.html gagal.
#
# CARA PAKAI:
#   1. Firebase Console → Project settings → Service accounts
#      → Generate new private key → simpan sebagai "service-account.json"
#      di root repo (SUDAH di-gitignore — jangan pernah di-commit!).
#   2. pip install pyjwt cryptography requests
#   3. python3 scripts/deploy-firestore.py
#
# Yang dilakukan:
#   A. Baca rules yang sedang aktif di cloud (diagnosa).
#   B. Deploy firebase/firestore.rules sebagai ruleset baru + pasang release.
#   C. Buat composite indexes dari firebase/firestore.indexes.json
#      (butuh peran datastore.indexAdmin — bila SA ditolak 403,
#      index tetap OPSIONAL: aplikasi tidak punya compound query;
#      buat manual via console bila kelak dibutuhkan).
#   D. Verifikasi akhir (isi rules + daftar index).
# ============================================================
import json, os, sys, time
from pathlib import Path
import jwt  # PyJWT
import requests
from cryptography.hazmat.primitives import serialization

REPO = Path(__file__).resolve().parent.parent
SA_PATH = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", str(REPO / "service-account.json"))
RULES_PATH = REPO / "firebase" / "firestore.rules"
INDEXES_PATH = REPO / "firebase" / "firestore.indexes.json"

ok = lambda m: print("  [PASS] " + m)
fail = lambda m: print("  [FAIL] " + m)
info = lambda m: print("  [INFO] " + m)


def get_token(sa):
    key = serialization.load_pem_private_key(sa["private_key"].encode(), password=None)
    now = int(time.time())
    payload = {
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/cloud-platform",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now, "exp": now + 3600,
    }
    assertion = jwt.encode(payload, key, algorithm="RS256")
    r = requests.post("https://oauth2.googleapis.com/token", data={
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion,
    }, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def H(tok):
    return {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}


def show_current_rules(tok, project):
    print("\n== 1. Rules yang sedang ter-deploy ==")
    try:
        releases = requests.get(f"https://firebaserules.googleapis.com/v1/projects/{project}/releases",
                                headers=H(tok), timeout=30).json().get("releases", [])
        rel = next((x for x in releases if "firestore" in x.get("name", "").lower()), None)
        if not rel:
            fail("Belum ada release firestore di project.")
            return None
        info("Release aktif: " + rel["name"])
        rs_name = rel.get("rulesetName", "")
        content = requests.get(f"https://firebaserules.googleapis.com/v1/{rs_name}",
                               headers=H(tok), timeout=30).json()["source"]["files"][0]["content"]
        has = "interactiveDevices" in content
        (ok if has else fail)("Rules interactive* (v1.6) " + ("SUDAH ada di cloud." if has else "TIDAK ada di cloud -> penyebab 'Missing or insufficient permissions'."))
        return content
    except Exception as e:
        fail(f"Gagal baca rules saat ini: {e}")
        return None


def deploy_rules(tok, project, rules_text):
    print("\n== 2. Deploy rules baru ==")
    FR = f"https://firebaserules.googleapis.com/v1/projects/{project}"
    r = requests.post(f"{FR}/rulesets", headers=H(tok),
                      json={"source": {"files": [{"name": "firestore.rules", "content": rules_text}]}}, timeout=60)
    if r.status_code >= 300:
        fail(f"Gagal buat ruleset ({r.status_code}): {r.text[:500]}")
        return False
    rs = r.json()["name"]
    ok("Ruleset dibuat: " + rs.split("/")[-1])
    releases = requests.get(f"{FR}/releases", headers=H(tok), timeout=30).json().get("releases", [])
    rel = next((x for x in releases if "firestore" in x.get("name", "").lower()), None)
    if rel:
        # rel["name"] sudah berbentuk "projects/{p}/releases/{id}" -> jangan
        # ditambah prefix FR lagi (dobel prefix = 404 HTML dari server).
        r2 = requests.patch(f"https://firebaserules.googleapis.com/v1/{rel['name']}", headers=H(tok),
                            json={"release": {"name": rel["name"], "rulesetName": rs},
                                  "updateMask": "rulesetName"}, timeout=60)
        if r2.status_code >= 300:
            fail(f"Gagal patch release ({r2.status_code}): {r2.text[:400]}")
            return False
        ok(f"Release '{rel['name'].split('/')[-1]}' menunjuk ruleset baru.")
    else:
        r3 = requests.post(f"{FR}/releases", headers=H(tok),
                           json={"name": f"projects/{project}/releases/firebase.firestore", "rulesetName": rs}, timeout=60)
        if r3.status_code >= 300:
            fail(f"Gagal buat release ({r3.status_code}): {r3.text[:400]}")
            return False
        ok("Release 'firebase.firestore' dibuat.")
    return True


def index_signature(ix):
    return (
        ix.get("queryScope", "COLLECTION"),
        tuple((f["fieldPath"], f.get("order") or f.get("arrayConfig")) for f in ix.get("fields", [])),
    )


def deploy_indexes(tok, project):
    print("\n== 3. Composite indexes ==")
    FS = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)"
    spec = json.load(open(INDEXES_PATH))
    results = []
    for ix in spec["indexes"]:
        cg = ix["collectionGroup"]
        sig = index_signature(ix)
        label = f"{cg} [{' + '.join(f['fieldPath'] for f in ix['fields'])}]"
        try:
            existing = requests.get(f"{FS}/collectionGroups/{cg}/indexes",
                                    headers=H(tok), timeout=30).json().get("indexes", [])
        except Exception as e:
            fail(f"{label}: gagal list ({e})")
            results.append((label, "LIST_ERROR"))
            continue
        match_state = None
        for e in existing:
            if index_signature({"queryScope": e.get("queryScope"), "fields": e.get("fields", [])}) == sig:
                match_state = e.get("state", "CREATING")
                break
        if match_state:
            ok(f"{label} sudah ada (state={match_state})")
            results.append((label, match_state))
            continue
        body = {
            "queryScope": ix.get("queryScope", "COLLECTION"),
            "fields": [
                {"fieldPath": f["fieldPath"],
                 **({"order": f["order"]} if "order" in f else {"arrayConfig": f["arrayConfig"]})}
                for f in ix["fields"]
            ],
        }
        r2 = requests.post(f"{FS}/collectionGroups/{cg}/indexes", headers=H(tok), json=body, timeout=60)
        if r2.status_code >= 300:
            msg = r2.json().get("error", {}).get("message", r2.text[:200]) if r2.text.startswith("{") else r2.text[:200]
            if "PERMISSION_DENIED" in msg:
                fail(f"{label}: 403 — SA tidak punya datastore.indexAdmin. Index OPSIONAL "
                     f"(aplikasi tidak menjalankan compound query); bila kelak perlu, buat manual di Console → Firestore → Indexes.")
            else:
                fail(f"{label}: gagal create ({r2.status_code}): {msg}")
            results.append((label, "CREATE_ERROR"))
            continue
        op = r2.json().get("name", "")
        if r2.json().get("done") and not r2.json().get("error"):
            ok(f"{label} dibuat (READY)")
            results.append((label, "READY"))
            continue
        info(f"{label} pembuatan dimulai, menunggu operasi...")
        results.append((label, op or "CREATING"))
    # poll operasi yang berjalan
    deadline = time.time() + 480
    pending = [x for x in results if isinstance(x[1], str) and x[1].startswith("projects/")]
    while pending and time.time() < deadline:
        time.sleep(15)
        still = []
        for label, op in pending:
            try:
                j = requests.get(f"https://firestore.googleapis.com/v1/{op}", headers=H(tok), timeout=30).json()
                if j.get("done"):
                    if j.get("error"):
                        fail(f"{label}: operasi index ERROR: {j['error'].get('message', '')[:200]}")
                        results = [(l, ("ERROR" if l == label else s)) for l, s in results]
                    else:
                        ok(f"{label} READY")
                        results = [(l, ("READY" if l == label else s)) for l, s in results]
                else:
                    still.append((label, op))
            except Exception:
                still.append((label, op))
        pending = still
    return results


def verify(tok, project):
    print("\n== 4. Verifikasi akhir ==")
    FR = f"https://firebaserules.googleapis.com/v1/projects/{project}"
    releases = requests.get(f"{FR}/releases", headers=H(tok), timeout=30).json().get("releases", [])
    rel = next((x for x in releases if "firestore" in x.get("name", "").lower()), None)
    rs = rel.get("rulesetName", "") if rel else ""
    content = requests.get(f"https://firebaserules.googleapis.com/v1/{rs}",
                           headers=H(tok), timeout=30).json()["source"]["files"][0]["content"]
    for c in ["interactiveDevices", "interactiveSessions", "interactiveSettings", "overlayConfigs",
              "presentationState", "publicLeaderboards", "allow read, write: if false"]:
        (ok if c in content else fail)(f"rules berisi: {c}")


def main():
    sa = json.load(open(SA_PATH))
    project = sa["project_id"]
    print(f"Project : {project}")
    print(f"SA      : {sa['client_email']}")
    tok = get_token(sa)
    ok("OAuth2 token didapat (cloud-platform).")
    show_current_rules(tok, project)
    if deploy_rules(tok, project, open(RULES_PATH).read()):
        ok("Security rules dari firebase/firestore.rules kini AKTIF di Firebase.")
    deploy_indexes(tok, project)
    verify(tok, project)
    print("\nSELESAI. Muat ulang halaman admin lalu ulangi aksi yang sebelumnya ditolak.")


if __name__ == "__main__":
    main()

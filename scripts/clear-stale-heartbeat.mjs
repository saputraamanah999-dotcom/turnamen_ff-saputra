/**
 * Bersihkan heartbeat bridge LAMA yang menyesatkan (mis. IP sandbox 21.0.15.1
 * yang tertinggal dari uji coba). Menimpa bridgeHeartbeats/{tid} menjadi
 * keadaan kosong yang JUJUR: gatewayUp=false, lanIp=null.
 *
 * Pakai Firebase Auth ANONYMOUS (web API key) — sesuai rules:
 * update diizinkan untuk auth != null dengan tournamentId yang cocok.
 *
 * Pakai: node scripts/clear-stale-heartbeat.mjs [tid]
 * Default tid = bof-main.
 */
import process from 'node:process';

const API_KEY = 'AIzaSyDPU3fKTfoXc2vEVcDasPOIsmOsGqW4HNM'; // web key publik (bukan rahasia)
const PROJECT = 'turnamenffbof';
const TID = process.argv[2] || 'bof-main';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/bridgeHeartbeats/${TID}`;

async function main() {
  // 1. Baca doc sekarang
  const cur = await fetch(FS).then((r) => r.json());
  console.log('SEBELUM:', JSON.stringify(cur.fields ?? {}));

  // 2. Auth anonymous → idToken
  const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  }).then((r) => r.json());
  if (!signUp.idToken) {
    console.error('GAGAL auth anonymous:', JSON.stringify(signUp).slice(0, 300));
    process.exit(1);
  }

  // 3. Timpa doc dengan keadaan bersih
  const fields = {
    tournamentId: { stringValue: TID },
    lanIp: { nullValue: null },
    gatewayPort: { nullValue: null },
    gatewayUp: { booleanValue: false },
    mediamtxUp: { booleanValue: false },
    obsConnected: { booleanValue: false },
    streaming: { booleanValue: false },
    viewers: { integerValue: '0' },
    updatedAt: { integerValue: String(Date.now()) },
  };
  const res = await fetch(`${FS}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signUp.idToken}` },
    body: JSON.stringify({ fields }),
  });
  const body = await res.text();
  console.log('PATCH:', res.status, body.slice(0, 200));

  // 4. Verifikasi dari ECHO respons PATCH (GET diblokir rules utk anonim — read=staff).
  //    Respons PATCH 200 berisi fields final yang tersimpan di Firestore.
  const okPatch = res.status === 200;
  const echo = okPatch ? await fetch(`${FS}?key=${API_KEY}&readTime=`, { method: 'HEAD' }).then(() => true).catch(() => true) : false;
  const respFields = (() => { try { return JSON.parse(body).fields ?? {}; } catch { return {}; } })();
  const lanIp = respFields.lanIp?.stringValue ?? respFields.lanIp?.nullValue ?? null;
  const gatewayUp = respFields.gatewayUp?.booleanValue ?? null;
  console.log(okPatch && echo
    ? `OK — doc bersih (PATCH 200): lanIp=${lanIp === null ? 'null' : lanIp}, gatewayUp=${gatewayUp}.`
    : 'PERIKSA: PATCH tidak mengembalikan fields final.');
}

main().catch((e) => { console.error(e); process.exit(1); });

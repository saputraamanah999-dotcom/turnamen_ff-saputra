/**
 * Unit tests mode P2P (logika murni) — pemilihan slot penonton, penolakan
 * saat penuh, backoff pemulihan, pemetaan status, ICE servers, validasi
 * payload offer (cermin aturan Firestore), deteksi sesi basi.
 * Jalankan: npx tsx scripts/test-p2p.ts
 */
import assert from "node:assert/strict";
import {
  buildP2PIceServers,
  clampP2pMaxViewers,
  isValidViewerCreatePayload,
  isStaleSession,
  mapP2PStatusToPlayerStatus,
  nextBackoffMs,
  selectAdmittedViewers,
  P2P_MAX_BITRATE_BPS,
  P2P_DEGRADATION_PREFERENCE,
  P2P_MAX_FRAMERATE,
  P2P_MAX_OFFER_CHARS,
  P2P_STALE_SESSION_MS,
} from "../src/services/broadcast/p2p";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log("  ✓", name);
}

console.log("P2P TESTS — logika murni mode siaran tanpa bridge");

// --- Konstanta kualitas (venue Wi-Fi 2.4 GHz) ---
test("kualitas P2P: 3.5 Mbps per penonton, 30 fps, maintain-framerate", () => {
  assert.equal(P2P_MAX_BITRATE_BPS, 3_500_000);
  assert.equal(P2P_MAX_FRAMERATE, 30);
  assert.equal(P2P_DEGRADATION_PREFERENCE, "maintain-framerate");
});

// --- Batas penonton ---
test("clampP2pMaxViewers: default 2, rentang 1–4", () => {
  assert.equal(clampP2pMaxViewers(undefined), 2);
  assert.equal(clampP2pMaxViewers(null), 2);
  assert.equal(clampP2pMaxViewers("bukan angka"), 2);
  assert.equal(clampP2pMaxViewers(NaN), 2);
  assert.equal(clampP2pMaxViewers(2), 2);
  assert.equal(clampP2pMaxViewers(0), 1);
  assert.equal(clampP2pMaxViewers(-3), 1);
  assert.equal(clampP2pMaxViewers(3), 3);
  assert.equal(clampP2pMaxViewers(5), 4);
  assert.equal(clampP2pMaxViewers(99), 4);
});

// --- Backoff pemulihan penonton ---
test("nextBackoffMs: 2 → 4 → 8 → 15 dtk, cap 15 dtk", () => {
  assert.equal(nextBackoffMs(1), 2_000);
  assert.equal(nextBackoffMs(2), 4_000);
  assert.equal(nextBackoffMs(3), 8_000);
  assert.equal(nextBackoffMs(4), 15_000);
  assert.equal(nextBackoffMs(5), 15_000);
  assert.equal(nextBackoffMs(99), 15_000);
  assert.equal(nextBackoffMs(0), 2_000); // clamp bawah
});

// --- Pemilihan slot penonton ---
test("slot: 3 penonton menunggu, maks 2 → 2 terlama dilayani, 1 ditolak", () => {
  const waiting = [
    { viewerId: "c", createdAtMs: 3000 },
    { viewerId: "a", createdAtMs: 1000 },
    { viewerId: "b", createdAtMs: 2000 },
  ];
  const { admit, reject } = selectAdmittedViewers(waiting, [], 2);
  assert.deepEqual(admit.map((w) => w.viewerId), ["a", "b"]);
  assert.deepEqual(reject.map((w) => w.viewerId), ["c"]);
});

test("slot: sesi aktif menghabiskan slot — 1 aktif + maks 2 → hanya 1 menunggu dilayani", () => {
  const waiting = [
    { viewerId: "x", createdAtMs: 1000 },
    { viewerId: "y", createdAtMs: 2000 },
  ];
  const { admit, reject } = selectAdmittedViewers(waiting, ["aktif-1"], 2);
  assert.deepEqual(admit.map((w) => w.viewerId), ["x"]);
  assert.deepEqual(reject.map((w) => w.viewerId), ["y"]);
});

test("slot: penuh total → semua ditolak", () => {
  const waiting = [
    { viewerId: "x", createdAtMs: 1000 },
    { viewerId: "y", createdAtMs: 2000 },
  ];
  const { admit, reject } = selectAdmittedViewers(waiting, ["a1", "a2", "a3"], 2);
  assert.equal(admit.length, 0);
  assert.deepEqual(reject.map((w) => w.viewerId), ["x", "y"]);
});

test("slot: createdAt belum resolve (null) diperlakukan paling baru", () => {
  const waiting = [
    { viewerId: "baru", createdAtMs: null },
    { viewerId: "lama", createdAtMs: 1000 },
  ];
  const { admit } = selectAdmittedViewers(waiting, [], 1);
  assert.deepEqual(admit.map((w) => w.viewerId), ["lama"]);
});

test("slot: maks 1 → hanya satu; urutan seri deterministik", () => {
  const waiting = [
    { viewerId: "b", createdAtMs: 1000 },
    { viewerId: "a", createdAtMs: 1000 },
  ];
  const first = selectAdmittedViewers(waiting, [], 1).admit.map((w) => w.viewerId);
  const second = selectAdmittedViewers(waiting, [], 1).admit.map((w) => w.viewerId);
  assert.deepEqual(first, second); // deterministik
  assert.equal(first.length, 1);
});

// --- Pemetaan status → PlayerStatus UI ---
test("mapP2PStatusToPlayerStatus: pesan jelas slot penuh/menyambung ulang", () => {
  assert.equal(mapP2PStatusToPlayerStatus("live"), "live");
  assert.equal(mapP2PStatusToPlayerStatus("waiting-host"), "connecting");
  assert.equal(mapP2PStatusToPlayerStatus("connecting"), "connecting");
  assert.equal(mapP2PStatusToPlayerStatus("reconnecting"), "reconnecting");
  assert.equal(mapP2PStatusToPlayerStatus("idle"), "idle");
  assert.equal(mapP2PStatusToPlayerStatus("full"), "signal-lost");
  assert.equal(mapP2PStatusToPlayerStatus("closed"), "signal-lost");
  assert.equal(mapP2PStatusToPlayerStatus("unsupported"), "signal-lost");
  assert.equal(mapP2PStatusToPlayerStatus("signal-lost"), "signal-lost");
});

// --- ICE servers ---
test("buildP2PIceServers: STUN Google default", () => {
  const servers = buildP2PIceServers();
  assert.equal(servers.length, 1);
  assert.deepEqual(servers[0].urls, ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]);
});

test("buildP2PIceServers: TURN opsional dari env (tanpa hardcode kredensial)", () => {
  const withTurn = buildP2PIceServers({ url: "turn:host:3478", username: "bof", credential: "rahasia" });
  assert.equal(withTurn.length, 2);
  assert.equal(withTurn[1].urls, "turn:host:3478");
  assert.equal(withTurn[1].username, "bof");
  assert.equal(withTurn[1].credential, "rahasia");
  // TURN tanpa kredensial lengkap → username/credential undefined (tidak error).
  const partial = buildP2PIceServers({ url: "turn:host:3478" });
  assert.equal(partial[1].urls, "turn:host:3478");
  assert.equal(partial[1].username, undefined);
  assert.equal(partial[1].credential, undefined);
  // URL kosong → TURN tidak ditambahkan.
  assert.equal(buildP2PIceServers({ url: "   " }).length, 1);
});

// --- Validasi payload create viewer (cermin aturan Firestore) ---
function baseOffer(sdp = "v=0\r\nm=video ...") {
  return { viewerId: "v1", state: "waiting", offer: { type: "offer", sdp } };
}
test("payload viewer valid lolos", () => {
  const r = isValidViewerCreatePayload(baseOffer(), "v1");
  assert.equal(r.ok, true);
});
test("payload ditolak: viewerId tidak cocok path", () => {
  assert.equal(isValidViewerCreatePayload(baseOffer(), "lain").ok, false);
});
test("payload ditolak: state bukan waiting (antisipasi tulis answer)", () => {
  const p = { ...baseOffer(), state: "answered" };
  assert.equal(isValidViewerCreatePayload(p, "v1").ok, false);
});
test("payload ditolak: offer.type bukan offer", () => {
  const p = baseOffer();
  p.offer.type = "answer";
  assert.equal(isValidViewerCreatePayload(p, "v1").ok, false);
});
test("payload ditolak: SDP kosong / bukan string", () => {
  const p = baseOffer("");
  assert.equal(isValidViewerCreatePayload(p, "v1").ok, false);
  const q = baseOffer();
  (q.offer as unknown as { sdp: unknown }).sdp = 12345;
  assert.equal(isValidViewerCreatePayload(q, "v1").ok, false);
});
test("payload ditolak: SDP > 12000 karakter (batas aturan)", () => {
  const big = "a".repeat(P2P_MAX_OFFER_CHARS + 1);
  assert.equal(isValidViewerCreatePayload(baseOffer(big), "v1").ok, false);
  const exact = "a".repeat(P2P_MAX_OFFER_CHARS);
  assert.equal(isValidViewerCreatePayload(baseOffer(exact), "v1").ok, true);
});

// --- Sesi basi (cleanup admin > 2 menit) ---
test("isStaleSession: waiting/closed > 2 menit basi; answered tidak; tanpa createdAt tidak", () => {
  const now = Date.now();
  assert.equal(isStaleSession({ state: "waiting", createdAtMs: now - P2P_STALE_SESSION_MS - 1 }, now), true);
  assert.equal(isStaleSession({ state: "closed", createdAtMs: now - P2P_STALE_SESSION_MS - 60_000 }, now), true);
  assert.equal(isStaleSession({ state: "waiting", createdAtMs: now - 10_000 }, now), false);
  assert.equal(isStaleSession({ state: "answered", createdAtMs: now - P2P_STALE_SESSION_MS - 1 }, now), false);
  assert.equal(isStaleSession({ state: "waiting", createdAtMs: null }, now), false);
});

console.log(`\nSELESAI: ${passed} test lulus tanpa kegagalan.`);

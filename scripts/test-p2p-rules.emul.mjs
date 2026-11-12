/**
 * Uji aturan Firestore untuk koleksi P2P signaling — dijalankan pada
 * FIRESTORE EMULATOR (tanpa menyentuh database produksi).
 *
 * Cara jalankan:
 *   npx firebase emulators:exec --only firestore \
 *     "node scripts/test-p2p-rules.emul.mjs"
 *
 * Kasus yang diuji (sesuai spesifikasi §5):
 *  - Penonton anonim BOLEH create viewer valid saat mode P2P aktif.
 *  - DITOLAK bila ada field terlarang (answer/reason), SDP terlalu besar,
 *    state/viewerId dipalsukan, atau saat p2pLive/streamMode tidak aktif.
 *  - Penonton TIDAK bisa update dokumen (answer hanya admin), TIDAK bisa list.
 *  - Candidate: penonton hanya 'viewer' ≤2000 char; 'host' hanya admin.
 *  - Admin boleh menjawab/menolak/menghapus; pengaturan broadcast tidak terganggu.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp, Timestamp } from "firebase/firestore";

const PROJECT_ID = "test-p2p-rules";
const RULES = readFileSync(new URL("../firebase/firestore.rules", import.meta.url), "utf8");
const TID = "bof-t1";

const VALID_OFFER = { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n..." };

let env;

async function main() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES },
  });

  // ---------- Seed (hak penuh, melewati rules) ----------
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Peran admin + broadcastSettings aktif P2P.
    await setDoc(doc(db, `adminRoles/super1`), { uid: "super1", email: "s@bof.id", role: "superadmin" });
    await setDoc(doc(db, `adminRoles/op1`), { uid: "op1", email: "o@bof.id", role: "operator" }); // staff, bukan admin
    await setDoc(doc(db, `broadcastSettings/${TID}`), {
      tournamentId: TID,
      streamMode: "p2p",
      p2pLive: true,
      p2pMaxViewers: 2,
    });
    await setDoc(doc(db, `broadcastSettings/bof-off`), {
      tournamentId: "bof-off",
      streamMode: "mediamtx",
      p2pLive: false,
    });
  });

  const anon = env.unauthenticatedContext().firestore();
  const admin = env.authenticatedContext("super1").firestore();
  const staff = env.authenticatedContext("op1").firestore();

  let passed = 0;
  async function t(name, fn) {
    await fn();
    passed++;
    console.log("  ✓", name);
  }

  console.log("P2P RULES TESTS (Firestore emulator)");

  // 1. Create viewer valid — diperbolehkan.
  await t("anon create viewer valid (state waiting, offer kecil)", async () => {
    await assertSucceeds(setDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-1`), {
      viewerId: "viewer-1",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      state: "waiting",
      offer: VALID_OFFER,
    }));
  });

  // 2. Baca dokumen sendiri — publik.
  await t("anon get viewer-1 (listen dokumen sendiri)", async () => {
    await assertSucceeds(getDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-1`)));
  });

  // 3. Field terlarang → ditolak.
  await t("anon create viewer dengan field answer → DITOLAK", async () => {
    await assertFails(setDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-bad1`), {
      viewerId: "viewer-bad1",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      state: "waiting",
      offer: VALID_OFFER,
      answer: { type: "answer", sdp: "palsu" },
    }));
  });

  // 4. State dipalsukan → ditolak.
  await t("anon create viewer state answered → DITOLAK", async () => {
    await assertFails(setDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-bad2`), {
      viewerId: "viewer-bad2",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      state: "answered",
      offer: VALID_OFFER,
    }));
  });

  // 5. viewerId != path → ditolak.
  await t("anon create viewer viewerId != path → DITOLAK", async () => {
    await assertFails(setDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-bad3`), {
      viewerId: "orang-lain",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      state: "waiting",
      offer: VALID_OFFER,
    }));
  });

  // 6. SDP > 12000 → ditolak.
  await t("anon create viewer SDP 12001 karakter → DITOLAK", async () => {
    await assertFails(setDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-bad4`), {
      viewerId: "viewer-bad4",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      state: "waiting",
      offer: { type: "offer", sdp: "a".repeat(12001) },
    }));
  });

  // 7. Signaling mati (mode bukan p2p / p2pLive false) → ditolak (anti-spam).
  await t("anon create viewer saat mode bukan p2p → DITOLAK", async () => {
    await assertFails(setDoc(doc(anon, `p2pSessions/bof-off/viewers/viewer-off`), {
      viewerId: "viewer-off",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      state: "waiting",
      offer: VALID_OFFER,
    }));
  });

  // 8. Penonton tidak bisa update dokumen sendiri (answer hanya admin).
  await t("anon update viewer (menulis answer sendiri) → DITOLAK", async () => {
    await assertFails(setDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-1`), {
      answer: { type: "answer", sdp: "palsu" },
    }, { merge: true }));
  });

  // 9. Penonton tidak bisa list koleksi viewers.
  await t("anon list viewers → DITOLAK", async () => {
    await assertFails(getDocs(collection(anon, `p2pSessions/${TID}/viewers`)));
  });

  // 10. Staff non-admin juga tidak bisa list (hanya admin/superadmin).
  await t("staff (operator) list viewers → DITOLAK", async () => {
    await assertFails(getDocs(collection(staff, `p2pSessions/${TID}/viewers`)));
  });

  // 11. Admin menjawab (answer + answered) — diperbolehkan.
  await t("admin update viewer (answer + state answered)", async () => {
    await assertSucceeds(setDoc(doc(admin, `p2pSessions/${TID}/viewers/viewer-1`), {
      answer: { type: "answer", sdp: "v=0 answer" },
      state: "answered",
    }, { merge: true }));
  });

  // 12. Admin menolak (reason).
  await t("admin update viewer (rejected + reason)", async () => {
    await assertSucceeds(setDoc(doc(admin, `p2pSessions/${TID}/viewers/viewer-1`), {
      state: "rejected",
      reason: "Slot penonton P2P penuh",
    }, { merge: true }));
  });

  // 13. Candidate viewer valid — boleh.
  await t("anon create candidate (from viewer, kecil)", async () => {
    await assertSucceeds(setDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-2/candidates/c1`), {
      from: "viewer",
      candidate: '{"candidate":"candidate:1 1 udp 1 10.0.0.1 5000 typ host","sdpMid":"0"}',
      createdAt: serverTimestamp(),
    }));
  });

  // 14. Candidate viewer memalsukan from=host → ditolak.
  await t("anon create candidate (from host) → DITOLAK", async () => {
    await assertFails(setDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-2/candidates/c2`), {
      from: "host",
      candidate: '{"candidate":"candidate:1 1 udp 1 10.0.0.9 5000 typ host"}',
      createdAt: serverTimestamp(),
    }));
  });

  // 15. Candidate > 2000 karakter → ditolak.
  await t("anon create candidate 2001 karakter → DITOLAK", async () => {
    await assertFails(setDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-2/candidates/c3`), {
      from: "viewer",
      candidate: "c".repeat(2001),
      createdAt: serverTimestamp(),
    }));
  });

  // 16. Admin menulis candidate host — boleh.
  await t("admin create candidate (from host)", async () => {
    await assertSucceeds(setDoc(doc(admin, `p2pSessions/${TID}/viewers/viewer-2/candidates/h1`), {
      from: "host",
      candidate: '{"candidate":"candidate:1 1 udp 1 10.0.0.2 5001 typ host"}',
      createdAt: serverTimestamp(),
    }));
  });

  // 17. Candidate bisa dibaca publik (kedua sisi bertukar ICE).
  await t("anon read candidates", async () => {
    await assertSucceeds(getDocs(collection(anon, `p2pSessions/${TID}/viewers/viewer-2/candidates`)));
  });

  // 18. Admin menghapus sesi (STOP LIVE / cleanup).
  await t("admin delete viewer", async () => {
    await assertSucceeds(deleteDoc(doc(admin, `p2pSessions/${TID}/viewers/viewer-1`)));
  });

  // 19. Anon menghapus sesi → ditolak.
  await t("anon delete viewer → DITOLAK", async () => {
    await assertFails(deleteDoc(doc(anon, `p2pSessions/${TID}/viewers/viewer-2`)));
  });

  // 20. broadcastSettings tidak terpengaruh (tidak ada pelonggaran).
  await t("anon write broadcastSettings → DITOLAK (tidak ada pelonggaran)", async () => {
    await assertFails(setDoc(doc(anon, `broadcastSettings/${TID}`), { p2pLive: true }, { merge: true }));
  });

  console.log(`\nSELESAI: ${passed} test rules lulus tanpa kegagalan.`);
  await env.cleanup();
}

main().catch((e) => {
  console.error("GAGAL:", e);
  process.exitCode = 1;
  if (env) void env.cleanup();
});

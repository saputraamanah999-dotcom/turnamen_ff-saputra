// ============================================================
// Test cepat fungsi murni BOF CASTER (tanpa Firestore/browser).
// Jalankan: node --experimental-strip-types scripts/test-caster.ts
//          (Node ≥22) atau npx tsx scripts/test-caster.ts
// ============================================================
import {
  genPairCode,
  validatePairCode,
  formatPairCodeSafe,
  casterBasePath,
  casterUrl,
  isSessionUsable,
  type CasterSessionInfo,
} from "../src/services/broadcast/caster";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
}

console.log("validatePairCode:");
check("6 digit valid", validatePairCode("528346") === "528346");
check("spasi diterima", validatePairCode("528 346") === "528346");
check("strip diterima", validatePairCode("528-346") === "528346");
check("huruf ditolak", validatePairCode("abc123") === null);
check("kurang digit ditolak", validatePairCode("123") === null);
check("kosong ditolak", validatePairCode("") === null);
check("7 digit ditolak", validatePairCode("1234567") === null);

console.log("genPairCode:");
for (let i = 0; i < 200; i++) {
  const c = genPairCode();
  if (!/^\d{6}$/.test(c) || Number(c) < 100000 || Number(c) > 999999) {
    check("kode selalu 6 digit 100000-999999", false);
    break;
  }
}
check("kode selalu 6 digit 100000-999999", true);

console.log("formatPairCodeSafe:");
check("528346 → 528 346", formatPairCodeSafe("528346") === "528 346");
check("528 → 528", formatPairCodeSafe("528") === "528");
check("karakter asing dibuang", formatPairCodeSafe("a1b2c3d4") === "123 4");

console.log("casterBasePath & casterUrl:");
check("basePath scoped by code", casterBasePath("528346") === "casterSessions/528346");
check("URL memuat /caster?code=", casterUrl("528346", "https://x.test") === "https://x.test/caster?code=528346");

console.log("isSessionUsable:");
const base: CasterSessionInfo = { code: "528346", tid: "T1", active: true, expiresAtMs: null };
check("aktif tanpa expiry → usable", isSessionUsable(base) === true);
check("inactive → tidak usable", isSessionUsable({ ...base, active: false }) === false);
check("tanpa tid → tidak usable", isSessionUsable({ ...base, tid: "" }) === false);
check("kedaluwarsa → tidak usable", isSessionUsable({ ...base, expiresAtMs: Date.now() - 1000 }) === false);
check("null → tidak usable", isSessionUsable(null) === false);

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

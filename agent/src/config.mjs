// ============================================================
// STIKAR BROADCAST AGENT — src/config.mjs
// ------------------------------------------------------------
// Memuat & menormalkan konfigurasi dari config.json.
//  - Jika config.json belum ada → dibuat otomatis dari
//    config.example.json + token admin/viewer ACAK (crypto
//    randomBytes hex) yang dicetak ke console dan DISIMPAN.
//  - Semua nilai di-deep-merge dengan default lalu dinormalkan.
//  - Tidak ada nilai palsu: config invalid → fallback default
//    + warning, bukan diam-diam sukses.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const VERSION = "1.0.0";
export const AGENT_NAME = "STIKAR BROADCAST AGENT";

/** Root folder agent (folder yang berisi package.json). */
export const AGENT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Schema/nilai default lengkap. Urutan field = urutan schema. */
const DEFAULTS = {
  httpPort: 8082,
  adminToken: "",
  viewerToken: "",
  gameTitles: ["Free Fire", "FreeFire", "FF", "Google Play Games"],
  ffmpegPath: "ffmpeg",
  mediaMtxPath: "mediamtx",
  encoder: "libx264", // "libx264" (default, paling kompatibel) atau "h264_nvenc"
  rtspPort: 8554,
  hlsPort: 8888,
  webrtcPort: 8889,
  streamPath: "bof-game",
  quality: "high",
  inputEnabled: false, // SAFE DEFAULT: input selalu mati saat agent baru jalan
  controllerLock: true,
  joystickKeys: { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
  buttonMap: {
    fire: "MouseLeft",
    aim: "MouseRight",
    jump: "Space",
    crouch: "KeyC",
    prone: "KeyZ",
    reload: "KeyR",
    weapon1: "Digit1",
    weapon2: "Digit2",
    weapon3: "Digit3",
    weapon4: "Digit4",
    grenade: "KeyG",
    medkit: "KeyH",
    pickup: "KeyF",
    map: "KeyM",
  },
  maxTouchPerSec: 120,
  logFile: "agent.log",
};

/** Field yang boleh diubah lewat POST /api/config (allowlist keamanan). */
const EDITABLE_KEYS = [
  "quality",
  "inputEnabled",
  "controllerLock",
  "joystickKeys",
  "buttonMap",
  "gameTitles",
];

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Deep-merge: object digabung, array & skalar di-replace (over menang). */
export function deepMerge(base, over) {
  if (!isPlainObject(over)) return Array.isArray(base) ? [...base] : base;
  const out = { ...(isPlainObject(base) ? base : {}) };
  for (const [k, v] of Object.entries(over)) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
    else if (isPlainObject(v)) out[k] = deepMerge({}, v);
    else if (Array.isArray(v)) out[k] = [...v];
    else out[k] = v;
  }
  return out;
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanKeyMap(obj, fallback) {
  const out = {};
  for (const [k, v] of Object.entries(fallback)) {
    const val = obj?.[k];
    out[k] = typeof val === "string" && val.trim() ? val.trim() : fallback[k];
  }
  // tombol tambahan yang di-set operator juga diterima apa adanya
  if (isPlainObject(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (!(k in out) && typeof v === "string" && v.trim()) out[k] = v.trim();
    }
  }
  return out;
}

/** Normalisasi + validasi ringan. Nilai invalid → fallback + tanpa exception. */
export function normalizeConfig(raw) {
  const c = deepMerge(DEFAULTS, isPlainObject(raw) ? raw : {});
  const warn = [];

  c.httpPort = clampInt(c.httpPort, 1, 65535, DEFAULTS.httpPort);
  c.rtspPort = clampInt(c.rtspPort, 1, 65535, DEFAULTS.rtspPort);
  c.hlsPort = clampInt(c.hlsPort, 1, 65535, DEFAULTS.hlsPort);
  c.webrtcPort = clampInt(c.webrtcPort, 1, 65535, DEFAULTS.webrtcPort);
  c.maxTouchPerSec = clampInt(c.maxTouchPerSec, 10, 1000, DEFAULTS.maxTouchPerSec);

  c.adminToken = typeof c.adminToken === "string" ? c.adminToken.trim() : "";
  c.viewerToken = typeof c.viewerToken === "string" ? c.viewerToken.trim() : "";

  c.ffmpegPath = typeof c.ffmpegPath === "string" && c.ffmpegPath.trim() ? c.ffmpegPath.trim() : DEFAULTS.ffmpegPath;
  c.mediaMtxPath = typeof c.mediaMtxPath === "string" && c.mediaMtxPath.trim() ? c.mediaMtxPath.trim() : DEFAULTS.mediaMtxPath;
  c.streamPath = typeof c.streamPath === "string" && c.streamPath.trim() ? c.streamPath.trim().replace(/^\/+|\/+$/g, "") : DEFAULTS.streamPath;

  c.encoder = c.encoder === "h264_nvenc" ? "h264_nvenc" : "libx264";

  c.quality = ["low", "medium", "high"].includes(c.quality) ? c.quality : DEFAULTS.quality;

  c.inputEnabled = c.inputEnabled === true;
  c.controllerLock = c.controllerLock !== false;

  // gameTitles: array string non-kosong, unik, huruf asli dipertahankan
  if (Array.isArray(c.gameTitles)) {
    const seen = new Set();
    c.gameTitles = c.gameTitles
      .filter((t) => typeof t === "string" && t.trim())
      .map((t) => t.trim())
      .filter((t) => (seen.has(t.toLowerCase()) ? false : (seen.add(t.toLowerCase()), true)));
  }
  if (!Array.isArray(c.gameTitles) || c.gameTitles.length === 0) {
    warn.push("gameTitles kosong/invalid — pakai default");
    c.gameTitles = [...DEFAULTS.gameTitles];
  }

  c.joystickKeys = cleanKeyMap(c.joystickKeys, DEFAULTS.joystickKeys);
  c.buttonMap = cleanKeyMap(c.buttonMap, DEFAULTS.buttonMap);

  // logFile: hanya nama file (hindari path escape keluar folder agent)
  if (typeof c.logFile !== "string" || !c.logFile.trim()) c.logFile = DEFAULTS.logFile;
  c.logFile = path.basename(c.logFile.trim()) || DEFAULTS.logFile;

  return { config: c, warnings: warn };
}

/**
 * Muat konfigurasi agent.
 * @returns {{ config: object, path: string, firstRun: boolean, generated: {adminToken?:string, viewerToken?:string},
 *             savePatch(patch): object, save(): void }}
 */
export function loadConfig() {
  const configPath = path.join(AGENT_ROOT, "config.json");
  const examplePath = path.join(AGENT_ROOT, "config.example.json");

  let raw = null;
  let firstRun = false;

  if (fs.existsSync(configPath)) {
    try {
      raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {
      console.error(`[CONFIG] config.json rusak (${e.message}) — mulai dari contoh, lalu ditimpa ulang.`);
      raw = null;
    }
  }
  if (!isPlainObject(raw)) {
    firstRun = !fs.existsSync(configPath);
    try {
      raw = JSON.parse(fs.readFileSync(examplePath, "utf8"));
    } catch {
      raw = {};
    }
  }

  const { config, warnings } = normalizeConfig(raw);

  // Token kosong → generate acak (first run ATAU operator menghapus token).
  const generated = {};
  if (!config.adminToken) {
    config.adminToken = generateToken();
    generated.adminToken = config.adminToken;
  }
  if (!config.viewerToken) {
    config.viewerToken = generateToken();
    generated.viewerToken = config.viewerToken;
  }

  for (const w of warnings) console.warn(`[CONFIG] ${w}`);

  const persist = () => {
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
      return true;
    } catch (e) {
      console.error(`[CONFIG] Gagal menulis ${configPath}: ${e.message}`);
      return false;
    }
  };

  if (firstRun || Object.keys(generated).length > 0) persist();

  if (firstRun) {
    console.log("──────────────────────────────────────────────────────");
    console.log("  FIRST RUN — config.json dibuat otomatis.");
    console.log("  TOKEN (disimpan di config.json — SIMPAN ini!):");
    console.log(`    adminToken  : ${config.adminToken}`);
    console.log(`    viewerToken : ${config.viewerToken}`);
    console.log("  adminToken untuk panel operator (website /admin).");
    console.log("  viewerToken untuk HP penonton (website /live).");
    console.log("──────────────────────────────────────────────────────");
  } else if (Object.keys(generated).length > 0) {
    console.log("[CONFIG] Token kosong di config.json — token baru dibuat & disimpan:");
    for (const [k, v] of Object.entries(generated)) console.log(`  ${k}: ${v}`);
  }

  return {
    config,
    path: configPath,
    firstRun,
    generated,
    /** Patch sebagian field (allowlist) → normalize → persist. Mengembalikan config baru. */
    savePatch(patch) {
      const safe = {};
      for (const k of EDITABLE_KEYS) if (patch && k in patch) safe[k] = patch[k];
      const next = normalizeConfig(deepMerge(config, safe)).config;
      // pertahankan token yang sudah ada (normalizeConfig tidak menyentuh token selain menrim)
      Object.assign(config, next);
      persist();
      return config;
    },
    /** Simpan config saat ini ke disk (dipakai rotate token, dsb). */
    save: persist,
  };
}

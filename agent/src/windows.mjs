// ============================================================
// STIKAR BROADCAST AGENT — src/windows.mjs
// ------------------------------------------------------------
// Deteksi jendela game/desktop dengan DUA strategi (jujur dilaporkan):
//   1) koffi + user32 (Windows x64): enumerasi jendela top-level,
//      GetWindowTextW, GetWindowRect, IsWindowVisible, IsIconic,
//      nama proses via kernel32 QueryFullProcessImageNameW.
//      → hasil lengkap: rect + flag minimized.
//   2) fallback PowerShell (Windows): daftar proses ber-MainWindowTitle
//      yang cocok dengan gameTitles. → TANPA rect, minimized tidak
//      diketahui (dianggap false).
//   Di OS non-Windows: daftar kosong + status jujur "bukan Windows".
// Hasil di-cache (TTL 1s) dan di-refresh oleh tick utama tiap 2 detik.
// ============================================================
import path from "node:path";
import { execFile } from "node:child_process";

// ---------------- Konfigurasi modul ----------------
let gameTitles = ["Free Fire", "FreeFire", "FF", "Google Play Games"];
let logger = console;
const CACHE_TTL_MS = 1000;

export function setGameTitles(titles) {
  if (Array.isArray(titles) && titles.length) gameTitles = titles.map((t) => String(t));
}
export function initWindows({ log }) {
  if (log) logger = log;
}

// ---------------- Cache ----------------
const cache = {
  at: 0,
  windows: [], // [{id,title,kind,process,rect,minimized,visible}]
  strategy: "belum-dipindai", // koffi | powershell | non-windows | error
  note: null,
  error: null,
};
let refreshPromise = null;
let ptrRegistry = new Map(); // id "window:<hwnd>" → HWND pointer (koffi Buffer), untuk input/focus

function logWarnOncePerPeriod(msg, ms = 30000) {
  const key = "__t" + msg;
  const now = Date.now();
  if (!logWarnOncePerPeriod[key] || now - logWarnOncePerPeriod[key] > ms) {
    logWarnOncePerPeriod[key] = now;
    logger.warn(msg);
  }
}

// ---------------- Strategi 1: koffi/user32 ----------------
let koffiApi = null; // {ok, reason?} | {ok:true, koffi, user32, kernel32, fn...}
let koffiPromise = null;

async function ensureKoffi() {
  if (koffiApi) return koffiApi;
  if (!koffiPromise) {
    koffiPromise = (async () => {
      if (process.platform !== "win32") return { ok: false, reason: `bukan Windows (${process.platform})` };
      if (process.arch !== "x64") return { ok: false, reason: `arsitektur tidak didukung (${process.arch}) — butuh Windows x64` };
      try {
        const mod = await import("koffi");
        const koffi = mod.default ?? mod;
        const user32 = koffi.load("user32.dll");
        const kernel32 = koffi.load("kernel32.dll");
        return {
          ok: true,
          koffi,
          user32,
          kernel32,
          GetWindowTextW: user32.func("GetWindowTextW", "int", "void *", "void *", "int"),
          GetWindowRect: user32.func("GetWindowRect", "bool", "void *", "void *"),
          IsWindowVisible: user32.func("IsWindowVisible", "bool", "void *"),
          IsIconic: user32.func("IsIconic", "bool", "void *"),
          GetWindowThreadProcessId: user32.func("GetWindowThreadProcessId", "uint32", "void *", "void *"),
          GetTopWindow: user32.func("GetTopWindow", "void *", "void *"),
          GetWindow: user32.func("GetWindow", "void *", "void *", "uint32"),
          OpenProcess: kernel32.func("OpenProcess", "void *", "uint32", "bool", "uint32"),
          QueryFullProcessImageNameW: kernel32.func("QueryFullProcessImageNameW", "bool", "void *", "uint32", "void *", "void *"),
          CloseHandle: kernel32.func("CloseHandle", "bool", "void *"),
        };
      } catch (e) {
        return { ok: false, reason: e?.code === "ERR_MODULE_NOT_FOUND"
          ? "koffi belum terpasang — lihat README (npm i koffi)"
          : `koffi gagal dimuat: ${e?.message || e}` };
      }
    })();
  }
  koffiApi = await koffiPromise;
  return koffiApi;
}

/** Konversi nilai HWND dari koffi (Buffer/bigint/number) → angka unik. */
function ptrNum(p) {
  if (p == null) return 0;
  if (typeof p === "bigint") return Number(p);
  if (typeof p === "number") return p;
  if (Buffer.isBuffer(p)) {
    try { return Number(p.readBigUInt64LE(0)); } catch { return 0; }
  }
  return 0;
}
function ptrTruthy(p) {
  if (p == null || p === 0 || p === 0n) return false;
  if (Buffer.isBuffer(p)) return ptrNum(p) !== 0;
  return true;
}

/** Nama proses dari PID via OpenProcess + QueryFullProcessImageNameW (opsional). */
function getProcessName(api, pid) {
  try {
    if (!pid) return null;
    const h = api.OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
    if (!ptrTruthy(h)) return null;
    try {
      const nameBuf = Buffer.alloc(2048);
      const sizeBuf = Buffer.alloc(4);
      sizeBuf.writeUInt32LE(1024, 0);
      if (api.QueryFullProcessImageNameW(h, 1024, nameBuf, sizeBuf)) {
        const len = sizeBuf.readUInt32LE(0);
        const full = len > 0 ? nameBuf.toString("utf16le", 0, Math.min(len, 1024) * 2).split("\u0000")[0] : "";
        return full ? path.win32.basename(full) : null;
      }
    } finally {
      try { api.CloseHandle(h); } catch { /* abaikan */ }
    }
  } catch { /* nama proses opsional */ }
  return null;
}

/** Kumpulkan data satu jendela ke array `out`. */
function collectWindow(api, hwndPtr, out) {
  const num = ptrNum(hwndPtr);
  if (!num) return;

  const titleBuf = Buffer.alloc(1024);
  const n = api.GetWindowTextW(hwndPtr, titleBuf, 512);
  const title = n > 0 ? titleBuf.toString("utf16le", 0, Math.min(n, 512) * 2).split("\u0000")[0] : "";
  const visible = !!api.IsWindowVisible(hwndPtr);
  if (!visible || !title) return;
  // buang jendela sistem yang tidak relevan
  if (title === "Program Manager" || title === "Windows Input Experience" || title === "Windows Shell Experience Host") return;

  const rectBuf = Buffer.alloc(16);
  let rect = null;
  try {
    if (api.GetWindowRect(hwndPtr, rectBuf)) {
      rect = {
        x: rectBuf.readInt32LE(0),
        y: rectBuf.readInt32LE(4),
        width: rectBuf.readInt32LE(8),
        height: rectBuf.readInt32LE(12),
      };
    }
  } catch { rect = null; }

  const minimized = !!api.IsIconic(hwndPtr);

  let process = null;
  try {
    const pidBuf = Buffer.alloc(4);
    api.GetWindowThreadProcessId(hwndPtr, pidBuf);
    process = getProcessName(api, pidBuf.readUInt32LE(0));
  } catch { /* opsional */ }

  const id = `window:${num}`;
  ptrRegistry.set(id, hwndPtr);
  out.push({ id, title, kind: "window", process, rect, minimized, visible });
}

/**
 * Enumerasi via EnumWindows + callback koffi.register.
 * Bila API register/proto bermasalah → fallback loop GetTopWindow/GetWindow
 * (tanpa callback). Keduanya dibungkus try/catch; gagal total → throw ke pemanggil.
 */
function enumerateWindowsKoffi(api) {
  const out = [];
  let usedEnumWindows = false;
  try {
    const EnumWindows = api.user32.func("EnumWindows", "bool", "void *", "void *");
    const proto = api.koffi.proto("StikarEnumWindowsCb", "bool", "void *", "void *");
    const cbPtr = api.koffi.register((hwnd, _lparam) => {
      try { collectWindow(api, hwnd, out); } catch { /* satu jendela gagal → lanjut */ }
      return true; // terus enumerasi
    }, proto);
    try {
      EnumWindows(cbPtr, null);
      usedEnumWindows = true;
    } finally {
      try { api.koffi.unregister(cbPtr); } catch { /* abaikan */ }
    }
  } catch (e) {
    logger.debug?.(`EnumWindows callback gagal, pakai loop GetWindow: ${e?.message || e}`);
  }

  if (!usedEnumWindows || out.length === 0) {
    // Fallback tanpa callback: GetTopWindow → GetWindow(GW_HWNDNEXT=2)
    const out2 = [];
    let hwnd = api.GetTopWindow(null);
    let guard = 0;
    while (ptrTruthy(hwnd) && guard++ < 4096) {
      try { collectWindow(api, hwnd, out2); } catch { /* lanjut */ }
      hwnd = api.GetWindow(hwnd, 2);
    }
    if (out2.length > 0 || out.length === 0) return out2.length >= out.length ? out2 : out;
  }
  return out;
}

// ---------------- Strategi 2: PowerShell fallback ----------------
const PS_SCRIPT =
  "$ErrorActionPreference='SilentlyContinue'; " +
  "Get-Process | Where-Object { $_.MainWindowTitle } | " +
  "Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress -Depth 2";

function psListGameWindows() {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_SCRIPT],
      { timeout: 5000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) return reject(err);
        try {
          let data = JSON.parse(stdout || "[]");
          if (!Array.isArray(data)) data = data ? [data] : [];
          const lowerTitles = gameTitles.map((t) => t.toLowerCase());
          const out = [];
          for (const p of data) {
            const title = String(p?.MainWindowTitle || "");
            const procName = p?.ProcessName ? String(p.ProcessName) : null;
            const hay = `${title} ${procName || ""}`.toLowerCase();
            const match = lowerTitles.some((t) => hay.includes(t.toLowerCase()));
            if (title && match) {
              out.push({
                id: `window:ps:${p.Id}`,
                title,
                kind: "window",
                process: procName,
                rect: null, // PowerShell fallback tidak bisa memberi rect — jujur
                minimized: false, // tidak diketahui via pendekatan ini
                visible: true,
              });
            }
          }
          resolve(out);
        } catch (e) {
          reject(new Error(`output PowerShell tidak bisa diparse: ${e.message}`));
        }
      },
    );
  });
}

// ---------------- API publik ----------------

/** Refresh cache daftar jendela (async, dedup bila sedang berjalan). */
export async function refresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    ptrRegistry = new Map();
    const api = await ensureKoffi();
    if (api.ok) {
      try {
        const list = enumerateWindowsKoffi(api);
        cache.windows = list;
        cache.strategy = "koffi";
        cache.note = null;
        cache.error = null;
        cache.at = Date.now();
        return list;
      } catch (e) {
        logWarnOncePerPeriod(`koffi enumerasi gagal → fallback PowerShell: ${e?.message || e}`);
      }
    }
    if (process.platform === "win32") {
      try {
        const list = await psListGameWindows();
        cache.windows = list;
        cache.strategy = "powershell";
        cache.note = api.ok ? null : (api.reason || null);
        cache.error = null;
        cache.at = Date.now();
        return list;
      } catch (e) {
        cache.windows = [];
        cache.strategy = "error";
        cache.note = null;
        cache.error = `deteksi jendela gagal: ${e?.message || e}`;
        cache.at = Date.now();
        logWarnOncePerPeriod(cache.error);
        return [];
      }
    }
    cache.windows = [];
    cache.strategy = "non-windows";
    cache.note = `deteksi jendela hanya tersedia di Windows (platform saat ini: ${process.platform})`;
    cache.error = null;
    cache.at = Date.now();
    return [];
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

/** Daftar jendela ter-cache. Bila cache kadaluarsa → refresh di background. */
export function listWindows() {
  if (Date.now() - cache.at > CACHE_TTL_MS) {
    refresh().catch(() => { /* sudah dilog */ });
  }
  return cache.windows.map((w) => ({
    id: w.id,
    title: w.title,
    kind: w.kind,
    process: w.process ?? null,
    rect: w.rect ?? null,
    minimized: !!w.minimized,
    visible: !!w.visible,
  }));
}

function titleMatches(title, processName) {
  const hay = `${title || ""} ${processName || ""}`.toLowerCase();
  return gameTitles.some((t) => hay.includes(String(t).toLowerCase()));
}

/**
 * Jendela game pertama yang cocok. Preferensi:
 *  1. judul mengandung "free fire"
 *  2. visible & tidak minimize
 *  3. judul terpanjang (lebih spesifik)
 */
export function findGameWindow() {
  const list = listWindows();
  const candidates = list.filter((w) => w.kind === "window" && titleMatches(w.title, w.process));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const s = (w) =>
      (w.title.toLowerCase().includes("free fire") ? 4 : 0) +
      (w.visible && !w.minimized ? 2 : 0);
    return s(b) - s(a) || b.title.length - a.title.length;
  });
  return candidates[0];
}

/** Pointer HWND asli (koffi Buffer) untuk sebuah window id — dipakai input/focus. */
export function getWindowPointer(id) {
  return ptrRegistry.get(id) ?? null;
}

/** Entry sumber desktop (gdigrab `-i desktop` = layar utama penuh). */
export function getDesktopSource(n = 0) {
  return {
    id: `desktop:${n}`,
    title: n === 0 ? "Seluruh Desktop (layar utama)" : `Desktop ${n}`,
    kind: "desktop",
    process: null,
    rect: null,
    minimized: false,
    visible: true,
  };
}

/** Info strategi deteksi — untuk status jujur di dashboard/website. */
export function getDetectionInfo() {
  return {
    strategy: cache.strategy,
    note: cache.note,
    error: cache.error,
    count: cache.windows.length,
    scannedAt: cache.at || null,
  };
}

export default {
  refresh,
  listWindows,
  findGameWindow,
  getWindowPointer,
  getDesktopSource,
  getDetectionInfo,
  setGameTitles,
  initWindows,
};

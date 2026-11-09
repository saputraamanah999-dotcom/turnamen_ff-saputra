// ============================================================
// STIKAR BROADCAST AGENT — src/logger.mjs
// ------------------------------------------------------------
// Logger: console berwarna + file log (agent.log).
// Termasuk sanitize(obj) yang menyamarkan string token agar
// token tidak pernah bocor ke log.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import util from "node:util";

// Warna ANSI (tanpa biru/indigo — palet hijau/kuning/merah/cyan/magenta)
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};

let filePath = null; // path file log aktif (null = belum init)
const DEBUG = /^(1|true|yes)$/i.test(process.env.STIKAR_DEBUG || "");

function ts() {
  return new Date().toISOString();
}
function hhmmss() {
  return new Date().toTimeString().slice(0, 8);
}

function appendFile(line) {
  if (!filePath) return;
  try {
    // strip ANSI sebelum masuk file agar log mudah dibaca
    fs.appendFileSync(filePath, line.replace(/\x1b\[[0-9;]*m/g, "") + "\n", "utf8");
  } catch {
    /* jangan pernah crash karena log */
  }
}

function fmtArg(a) {
  if (typeof a === "string") return a;
  try {
    return util.inspect(a, { depth: 3, breakLength: 120, maxArrayLength: 20 });
  } catch {
    return String(a);
  }
}

function emit(level, color, tag, msg, ...rest) {
  const body = [msg, ...rest].map(fmtArg).join(" ");
  const consoleLine = `${C.gray}${hhmmss()}${C.reset} ${color}${C.bold}[${tag}]${C.reset} ${body}`;
  if (level === "error") console.error(consoleLine);
  else console.log(consoleLine);
  appendFile(`[${ts()}] [${tag}] ${body}`);
}

export function initLogger({ agentRoot, logFile }) {
  filePath = path.join(agentRoot, path.basename(String(logFile || "agent.log")));
  try {
    // tulis header rotasi sederhana setiap start
    fs.appendFileSync(filePath, `\n${"=".repeat(60)}\n[${ts()}] ===== Agent start =====\n`, "utf8");
  } catch {
    filePath = null; // file log gagal → tetap jalan, console saja (jujur dilaporkan)
  }
  return filePath;
}

export const log = {
  info: (msg, ...rest) => emit("info", C.cyan, "INFO", msg, ...rest),
  ok: (msg, ...rest) => emit("ok", C.green, "OK", msg, ...rest),
  warn: (msg, ...rest) => emit("warn", C.yellow, "WARN", msg, ...rest),
  error: (msg, ...rest) => emit("error", C.red, "ERROR", msg, ...rest),
  debug: (msg, ...rest) => { if (DEBUG) emit("debug", C.magenta, "DEBUG", msg, ...rest); },
  /** Banner besar tanpa timestamp (untuk startup). */
  banner(lines) {
    const rule = "─".repeat(58);
    const out = [rule, ...lines, rule].join("\n");
    console.log(out);
    appendFile(out);
  },
  /** Path file log (atau null bila gagal). */
  filePath: () => filePath,
};

/**
 * Klon objek dengan menyamarkan nilai field yang berbau token/secret.
 * - key cocok /token|secret|password|authorization/i + nilai string → "abcd***"
 * - aman terhadap circular reference (WeakSet) dan depth terbatas.
 */
export function sanitize(obj, _depth = 0, _seen = new WeakSet()) {
  if (obj === null || typeof obj !== "object") return obj;
  if (_depth > 8 || _seen.has(obj)) return "[circular]";
  _seen.add(obj);
  if (Array.isArray(obj)) return obj.map((v) => sanitize(v, _depth + 1, _seen));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/token|secret|password|authorization/i.test(k) && typeof v === "string") {
      out[k] = v.length > 4 ? v.slice(0, 4) + "***" : "***";
    } else if (typeof v === "string" && /^Bearer\s+/i.test(v)) {
      out[k] = "Bearer ***";
    } else {
      out[k] = sanitize(v, _depth + 1, _seen);
    }
  }
  return out;
}

export default log;

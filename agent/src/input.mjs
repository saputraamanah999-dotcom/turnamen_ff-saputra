// ============================================================
// STIKAR BROADCAST AGENT — src/input.mjs
// ------------------------------------------------------------
// InputForwarder: meneruskan input remote (touch/joystick/tombol)
// ke jendela game via OS-level SendInput (koffi FFI → user32.dll).
//
// PENTING (desain aman & jujur):
//  - HANYA event input OS biasa (mouse/keyboard) — sama seperti
//    manusia menekan mouse/keyboard. TIDAK ada memory injection,
//    TIDAK ada anti-cheat bypass, TIDAK ada macro/bot.
//  - Jika koffi tidak terpasang / bukan Windows → available=false
//    dan SETIAP panggilan dihitung rejectedCount. Status tetap
//    jujur: tidak ada input yang "seolah" terkirim.
//  - releaseAll() dipanggil saat estop / controller ganti /
//    client disconnect → tidak ada tombol yang "nyangkut".
// ============================================================

const IS64 = process.arch === "x64";
const INPUT_SIZE = IS64 ? 40 : 28; // sizeof(INPUT) Windows
const UNION_OFF = IS64 ? 8 : 4;    // offset union MOUSEINPUT/KEYBDINPUT di struct INPUT

// ---------- MOUSEEVENTF_* flags ----------
const MOUSEEVENTF = {
  MOVE: 0x0001,
  LEFTDOWN: 0x0002,
  LEFTUP: 0x0004,
  RIGHTDOWN: 0x0008,
  RIGHTUP: 0x0010,
  MIDDLEDOWN: 0x0020,
  MIDDLEUP: 0x0040,
  WHEEL: 0x0800,
  ABSOLUTE: 0x8000,
};
const KEYEVENTF_KEYUP = 0x0002;

// ---------- Peta tombol → virtual-key (VK) ----------
// Nama mengikuti DOM KeyboardEvent.code (KeyW, Digit1, Space, ...) —
// sama dengan yang dipakai website (buttonMap/joystickKeys).
const VK = {};
for (let i = 0; i < 26; i++) VK["Key" + String.fromCharCode(65 + i)] = 0x41 + i; // KeyA..KeyZ
for (let i = 0; i < 10; i++) VK["Digit" + i] = 0x30 + i;                          // Digit0..Digit9
for (let i = 1; i <= 12; i++) VK["F" + i] = 0x6f + i;                             // F1..F12 → 0x70..0x7B
for (let i = 0; i < 10; i++) VK["Numpad" + i] = 0x60 + i;                         // Numpad0..9
Object.assign(VK, {
  Space: 0x20,
  Enter: 0x0d,
  Escape: 0x1b,
  Tab: 0x09,
  Backspace: 0x08,
  CapsLock: 0x14,
  ShiftLeft: 0xa0, ShiftRight: 0xa1,
  ControlLeft: 0xa2, ControlRight: 0xa3,
  AltLeft: 0x12, AltRight: 0xa5,
  ArrowUp: 0x26, ArrowDown: 0x28, ArrowLeft: 0x25, ArrowRight: 0x27,
  Insert: 0x2d, Delete: 0x2e, Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
  PrintScreen: 0x2c, ScrollLock: 0x91, Pause: 0x13,
  NumpadAdd: 0x6b, NumpadSubtract: 0x6d, NumpadMultiply: 0x6a, NumpadDivide: 0x6f,
  NumpadDecimal: 0x6e, NumpadEnter: 0x0d,
  Minus: 0xbd, Equal: 0xbb, BracketLeft: 0xdb, BracketRight: 0xdd, Backslash: 0xdc,
  Semicolon: 0xba, Quote: 0xde, Comma: 0xbc, Period: 0xbe, Slash: 0xbf, Backquote: 0xc0,
});

// Tombol mouse yang dikenali (nama dari website).
const MOUSE_BTNS = {
  MouseLeft: { down: MOUSEEVENTF.LEFTDOWN, up: MOUSEEVENTF.LEFTUP },
  MouseRight: { down: MOUSEEVENTF.RIGHTDOWN, up: MOUSEEVENTF.RIGHTUP },
  MouseMiddle: { down: MOUSEEVENTF.MIDDLEDOWN, up: MOUSEEVENTF.MIDDLEUP },
};

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function clamp01(v) { return clamp(Number(v) || 0, 0, 1); }

/**
 * class InputForwarder
 * Satu instance untuk seluruh agent. Model: HANYA SATU controller aktif
 * pada satu waktu (dikelola ws.mjs), sehingga held-set cukup satu.
 */
export class InputForwarder {
  /** @param {object} config config agent (untuk deadzone/maxTouch) @param {object} log logger */
  constructor(config, log) {
    this.cfg = config || {};
    this.log = log || console;
    this.available = false;
    this.unavailableReason = "belum diinisialisasi";
    this.koffi = null;
    this.user32 = null;
    this.SendInput = null;
    this.MapVirtualKeyW = null;
    this.GetSystemMetrics = null;
    this.GetForegroundWindow = null;
    this.SetForegroundWindow = null;
    this.screenW = 0;
    this.screenH = 0;

    // state tombol yang sedang ditahan (untuk releaseAll)
    this.heldKeys = new Set();  // nama key (mis. "KeyW")
    this.heldMouse = new Set(); // "MouseLeft" | "MouseRight" | "MouseMiddle"
    this.joyHeld = new Set();   // nama key joystick yang ditahan oleh vektor joystick
    this.touches = new Map();   // touch id → {x,y}

    // statistik jujur
    this.stats = { forwarded: 0, rejected: 0, errors: 0 };
    this._unknownKeysLogged = new Set();
    this._lastSendErrAt = 0;
  }

  /** Muat koffi + bind user32. Dipanggil sekali oleh index.mjs (await). */
  async init() {
    if (process.platform !== "win32") {
      this.unavailableReason = `forwarding input hanya tersedia di Windows (platform saat ini: ${process.platform})`;
      this.log.warn(`[INPUT] ${this.unavailableReason}`);
      return;
    }
    try {
      const mod = await import("koffi");
      const koffi = mod.default ?? mod;
      this.koffi = koffi;
      this.user32 = koffi.load("user32.dll");
      // Semua parameter pointer dideklarasikan 'void *' + Buffer manual
      // agar perilaku koffi pasti (Buffer = pointer mentah).
      this.SendInput = this.user32.func("SendInput", "uint32", "uint32", "void *", "int");
      this.MapVirtualKeyW = this.user32.func("MapVirtualKeyW", "uint32", "uint32", "uint32");
      this.GetSystemMetrics = this.user32.func("GetSystemMetrics", "int", "int");
      this.GetForegroundWindow = this.user32.func("GetForegroundWindow", "void *");
      this.SetForegroundWindow = this.user32.func("SetForegroundWindow", "bool", "void *");

      const sw = this.GetSystemMetrics(0); // SM_CXSCREEN
      const sh = this.GetSystemMetrics(1); // SM_CYSCREEN
      if (sw > 0 && sh > 0) { this.screenW = sw; this.screenH = sh; }

      this.available = true;
      this.unavailableReason = null;
      this.log.ok(`[INPUT] Forwarding input siap (koffi/SendInput, layar ${this.screenW}x${this.screenH}).`);
    } catch (e) {
      this.available = false;
      this.unavailableReason = e?.code === "ERR_MODULE_NOT_FOUND"
        ? "koffi belum terpasang — lihat README (npm i koffi)"
        : `koffi/user32 gagal dimuat: ${e?.message || e}`;
      this.log.warn(`[INPUT] Input DINONAKTIFKAN — ${this.unavailableReason}`);
    }
  }

  // ---------------- Bangun struct INPUT (Buffer mentah) ----------------

  /** INPUT_MOUSE: dx,dy sudah dalam koordinat absolut 0..65535 (bila ABSOLUTE). */
  _mouseBuf(flags, dx, dy, mouseData) {
    const b = Buffer.alloc(INPUT_SIZE);
    b.writeUInt32LE(0, 0); // type = INPUT_MOUSE
    const o = UNION_OFF;
    b.writeInt32LE(dx | 0, o);          // dx
    b.writeInt32LE(dy | 0, o + 4);      // dy
    b.writeUInt32LE((mouseData | 0) >>> 0, o + 8); // mouseData (wheel dy signed → bit pattern)
    b.writeUInt32LE(flags >>> 0, o + 12);          // dwFlags
    b.writeUInt32LE(0, o + 16);                    // time
    return b;
  }

  /** INPUT_KEYBOARD: wVk + scan code. dwFlags=0 → keydown, KEYEVENTF_KEYUP → keyup. */
  _keyBuf(vk, up) {
    const b = Buffer.alloc(INPUT_SIZE);
    b.writeUInt32LE(1, 0); // type = INPUT_KEYBOARD
    const o = UNION_OFF;
    b.writeUInt16LE(vk & 0xffff, o); // wVk
    let scan = 0;
    try { scan = this.MapVirtualKeyW ? this.MapVirtualKeyW(vk, 0 /* MAPVK_VK_TO_VSC */) & 0xffff : 0; } catch { scan = 0; }
    b.writeUInt16LE(scan, o + 2);                       // wScan
    b.writeUInt32LE(up ? KEYEVENTF_KEYUP : 0, o + 4);   // dwFlags
    b.writeUInt32LE(0, o + 8);                          // time
    return b;
  }

  /** Kirim satu event; hitung error bila SendInput menolak. */
  _send(buf, what) {
    try {
      const sent = this.SendInput(1, buf, INPUT_SIZE);
      if (sent !== 1) {
        this.stats.errors++;
        if (Date.now() - this._lastSendErrAt > 5000) {
          this._lastSendErrAt = Date.now();
          this.log.warn(`[INPUT] SendInput menolak event ${what} (sent=${sent})`);
        }
        return false;
      }
      return true;
    } catch (e) {
      this.stats.errors++;
      if (Date.now() - this._lastSendErrAt > 5000) {
        this._lastSendErrAt = Date.now();
        this.log.warn(`[INPUT] SendInput error: ${e?.message || e}`);
      }
      return false;
    }
  }

  _guard() {
    if (!this.available) {
      this.stats.rejected++;
      return false;
    }
    return true;
  }

  _warnUnknownKey(key) {
    if (!this._unknownKeysLogged.has(key)) {
      this._unknownKeysLogged.add(key);
      this.log.warn(`[INPUT] Key tidak dikenal: "${key}" — diabaikan (cek buttonMap/joystickKeys di config)`);
    }
  }

  // ---------------- Keyboard ----------------

  keyboardDown(key) {
    if (!this._guard()) return false;
    const vk = VK[key];
    if (vk == null) { this._warnUnknownKey(key); this.stats.rejected++; return false; }
    const ok = this._send(this._keyBuf(vk, false), `keydown ${key}`);
    if (ok) { this.heldKeys.add(key); this.stats.forwarded++; }
    return ok;
  }

  keyboardUp(key) {
    if (!this._guard()) return false;
    const vk = VK[key];
    if (vk == null) { this._warnUnknownKey(key); this.stats.rejected++; return false; }
    const ok = this._send(this._keyBuf(vk, true), `keyup ${key}`);
    this.heldKeys.delete(key);
    if (ok) this.stats.forwarded++;
    return ok;
  }

  /** Tombol dari website: bisa key ("KeyR"/"Space") atau mouse ("MouseLeft"). */
  button(key, phase) {
    if (!MOUSE_BTNS[key]) {
      return phase === "down" ? this.keyboardDown(key) : this.keyboardUp(key);
    }
    return phase === "down" ? this.mouseDown(key) : this.mouseUp(key);
  }

  // ---------------- Mouse ----------------

  mouseDown(btn) {
    if (!this._guard()) return false;
    const m = MOUSE_BTNS[btn];
    if (!m) { this._warnUnknownKey(btn); this.stats.rejected++; return false; }
    const ok = this._send(this._mouseBuf(m.down, 0, 0, 0), `mousedown ${btn}`);
    if (ok) { this.heldMouse.add(btn); this.stats.forwarded++; }
    return ok;
  }

  mouseUp(btn) {
    if (!this._guard()) return false;
    const m = MOUSE_BTNS[btn];
    if (!m) { this._warnUnknownKey(btn); this.stats.rejected++; return false; }
    const ok = this._send(this._mouseBuf(m.up, 0, 0, 0), `mouseup ${btn}`);
    this.heldMouse.delete(btn);
    if (ok) this.stats.forwarded++;
    return ok;
  }

  /**
   * Gerak mouse ke posisi ternormalisasi (0..1) relatif jendela game.
   * Tanpa rect → posisi relatif layar. Koordinat absolut dikirim via
   * MOUSEEVENTF_ABSOLUTE (0..65535 pada layar utama).
   */
  mouseMoveToNormalized(nx, ny, windowRect) {
    if (!this._guard()) return false;
    const sw = this.screenW || 1;
    const sh = this.screenH || 1;
    let ax, ay;
    if (windowRect && windowRect.width > 0 && windowRect.height > 0) {
      ax = windowRect.x + clamp01(nx) * windowRect.width;
      ay = windowRect.y + clamp01(ny) * windowRect.height;
    } else {
      ax = clamp01(nx) * sw;
      ay = clamp01(ny) * sh;
    }
    ax = clamp(ax, 0, sw - 1);
    ay = clamp(ay, 0, sh - 1);
    const fx = Math.round((ax / sw) * 65535);
    const fy = Math.round((ay / sh) * 65535);
    const ok = this._send(this._mouseBuf(MOUSEEVENTF.MOVE | MOUSEEVENTF.ABSOLUTE, fx, fy, 0), "mousemove");
    if (ok) this.stats.forwarded++;
    return ok;
  }

  /** Scroll wheel: dy > 0 = maju. */
  wheel(dy) {
    if (!this._guard()) return false;
    const d = clamp(Math.round(Number(dy) || 0), -10000, 10000);
    const ok = this._send(this._mouseBuf(MOUSEEVENTF.WHEEL, 0, 0, d), "wheel");
    if (ok) this.stats.forwarded++;
    return ok;
  }

  // ---------------- Touch (map ke pointer mouse) ----------------

  /**
   * Sentuh → pointer: down/move = gerak ke titik (+klik kiri saat down),
   * up = lepas tombol. Membutuhkan rect jendela game; tanpa rect →
   * ditolak + dihitung rejected (jujur, tidak "ditembak" sembarangan).
   */
  touch(id, phase, nx, ny, windowRect) {
    if (!this._guard()) return false;
    if (!windowRect || windowRect.width <= 0 || windowRect.height <= 0) {
      this.stats.rejected++; // touch tanpa rect jendela tidak bisa dipetakan
      return false;
    }
    if (phase === "down") {
      this.touches.set(id, { x: clamp01(nx), y: clamp01(ny) });
      this.mouseMoveToNormalized(nx, ny, windowRect);
      this.mouseDown("MouseLeft");
    } else if (phase === "move") {
      this.touches.set(id, { x: clamp01(nx), y: clamp01(ny) });
      this.mouseMoveToNormalized(nx, ny, windowRect);
    } else if (phase === "up") {
      this.touches.delete(id);
      // up = release tombol; hanya saat tidak ada jari lain di layar
      if (this.touches.size === 0) this.mouseUp("MouseLeft");
    }
    return true;
  }

  // ---------------- Joystick virtual → tombol WASD ----------------

  /**
   * Joystick (x,y dalam -1..1, y positif = ke bawah) → tahan/lepas tombol
   * arah (config.joystickKeys). Deadzone 0.35 + histeresis 0.25 agar
   * tidak "chatter" di sekitar ambang.
   */
  joystick(x, y, active, keys) {
    if (!this._guard()) return false;
    const ENGAGE = 0.35;
    const RELEASE = 0.25;
    const K = keys || this.cfg.joystickKeys || { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" };

    const desired = new Set();
    if (active) {
      const axes = { up: -Number(y) || 0, down: Number(y) || 0, left: -Number(x) || 0, right: Number(x) || 0 };
      for (const [dir, v] of Object.entries(axes)) {
        const held = this.joyHeld.has(K[dir]);
        if (v >= ENGAGE || (held && v >= RELEASE)) desired.add(dir);
      }
    }

    for (const dir of ["up", "down", "left", "right"]) {
      const key = K[dir];
      if (!key) continue;
      const isHeld = this.joyHeld.has(key);
      if (desired.has(dir) && !isHeld) {
        if (this.keyboardDown(key)) this.joyHeld.add(key);
      } else if (!desired.has(dir) && isHeld) {
        this.keyboardUp(key);
        this.joyHeld.delete(key);
      }
    }
    return true;
  }

  // ---------------- Pembersihan ----------------

  /**
   * Lepas SEMUA tombol/mouse yang sedang ditahan (estop, controller
   * berganti, client disconnect). Ini kunci agar tidak ada key "nyangkut".
   */
  releaseAll() {
    for (const k of [...this.heldKeys]) this.keyboardUp(k);
    for (const b of [...this.heldMouse]) this.mouseUp(b);
    this.joyHeld.clear();
    this.touches.clear();
  }

  // ---------------- Fokus jendela game (best-effort) ----------------

  /**
   * Coba bawa jendela game ke foreground supaya SendInput mengenai game.
   * Dipanggil saat controller berhasil claim & saat capture dimulai —
   * TIDAK dipanggil tiap event (jangan mencuri fokus operator).
   * @param {object|null} hwndPtr pointer HWND dari windows.getWindowPointer()
   * @param {number} hwndNum angka hwnd untuk perbandingan
   */
  ensureForeground(hwndPtr, hwndNum) {
    if (!this.available || !hwndPtr || !hwndNum) return false;
    try {
      const cur = ptrNumSafe(this.GetForegroundWindow());
      if (cur === hwndNum) return true;
      return !!this.SetForegroundWindow(hwndPtr);
    } catch {
      return false;
    }
  }

  // ---------------- Status ----------------

  /** Snapshot status input — SEMUA angka ini jujur (bukan perkiraan sukses). */
  statusSnapshot() {
    return {
      available: this.available,
      reason: this.available ? null : this.unavailableReason,
      heldKeys: [...this.heldKeys],
      heldMouse: [...this.heldMouse],
      forwarded: this.stats.forwarded,
      rejected: this.stats.rejected,
      errors: this.stats.errors,
    };
  }
}

function ptrNumSafe(p) {
  if (p == null) return 0;
  if (typeof p === "bigint") return Number(p);
  if (typeof p === "number") return p;
  if (Buffer.isBuffer(p)) { try { return Number(p.readBigUInt64LE(0)); } catch { return 0; } }
  return 0;
}

export default InputForwarder;

// ============================================================
// STIKAR BROADCAST AGENT — src/ws.mjs
// ------------------------------------------------------------
// WebSocket hub (library "ws") yang menempel di HTTP server utama
// pada path /ws. Satu port untuk semua (HTTP API + WS).
//
// AUTH (saat upgrade, timing-safe):
//   /ws?token=...  → token == adminToken → role "admin"
//                  → token == viewerToken → role "viewer"
//                  → selain itu → 401 ditolak.
//   Token kosong di config → SEMUA koneksi ditolak (tidak ada akses terbuka).
//
// PROTOCOL (JSON text frames) — kontrak sama persis dengan
// src/services/agent/client.ts (AgentInputChannel):
//   client→server: hello{device,role} | ping{ts} | claim | release | estop(admin)
//                  | touch{id,phase,x,y} | joy{x,y,active} | btn{key,phase}
//                  | key{key,phase} | wheel{dy}
//   server→client: welcome | state{status} | granted{controller} | denied{reason}
//                  | pong{ts} | error{message}
//
// RATE LIMIT:
//   - Pesan KONTROL (semua kecuali touch/joy/btn/key/wheel): 30 msg/s;
//     pelanggaran >10 → disconnect (1008).
//   - Pesan INPUT punya budget terpisah jauh lebih besar
//     (max(360, maxTouchPerSec*3)/s) karena touch drag bisa 60-120 Hz;
//     kelebihan di-DROP (tidak memutus). touch khusus dibatasi
//     config.maxTouchPerSec per detik.
// ============================================================
import crypto from "node:crypto";
import wsPkg from "ws";
const { WebSocketServer } = wsPkg;

const CONTROL_LIMIT_PER_SEC = 30;
const CONTROL_MAX_VIOLATIONS = 10;
const MSG_MAX_BYTES = 64 * 1024; // konsisten dengan maxPayload WSS

function hashToken(t) {
  return crypto.createHash("sha256").update(String(t ?? "")).digest();
}
/** Perbandingan timing-safe untuk string apa pun (hash dulu agar panjang sama). */
function safeEqual(a, b) {
  return crypto.timingSafeEqual(hashToken(a), hashToken(b));
}
function uuid() {
  return crypto.randomUUID();
}
function clamp01(v) { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0; }
function clampVec(v) { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(-1, n)) : 0; }

/** Tipe pesan input (di-exempt dari limit kontrol 30/s, pakai budget input). */
const INPUT_TYPES = new Set(["touch", "joy", "btn", "key", "wheel"]);

export class AgentWsHub {
  /**
   * @param {object} deps {
   *   log, getConfig():object, getStatus():AgentStatus, input:InputForwarder,
   *   windows:windows module
   * }
   */
  constructor(deps) {
    this.deps = deps;
    this.log = deps.log || console;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MSG_MAX_BYTES });
    this.clients = new Set();
    this.controller = null;   // client object yang memegang kontrol
    this.estopped = false;    // sticky — hanya lewat /api/input enabled:true
    this._closed = false;

    this.wss.on("connection", (ws, req, auth) => this._onConnection(ws, auth));
  }

  /** Pasang handler upgrade ke http server. */
  attach(server) {
    server.on("upgrade", (req, socket, head) => {
      let url;
      try {
        url = new URL(req.url || "/", "http://localhost");
      } catch {
        socket.destroy();
        return;
      }
      if (url.pathname !== "/ws") {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      const cfg = this.deps.getConfig();
      const token = url.searchParams.get("token") ?? "";
      // fallback: header Authorization (untuk klien non-browser)
      const hdr = /^Bearer\s+(.+)$/i.exec(req.headers["authorization"] || "");
      const tok = token || (hdr ? hdr[1] : "");

      let role = null;
      if (cfg.adminToken && safeEqual(tok, cfg.adminToken)) role = "admin";
      else if (cfg.viewerToken && safeEqual(tok, cfg.viewerToken)) role = "viewer";

      if (!role) {
        // jujur + aman: token kosong/salah → tolak
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n{\"error\":\"Token tidak valid — butuh viewerToken atau adminToken di ?token=\"}");
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit("connection", ws, req, { role });
      });
    });
  }

  // ================= Koneksi =================

  _onConnection(ws, auth) {
    const client = {
      id: uuid(),
      ws,
      role: auth.role,
      device: null,          // {name,type} dari hello
      controller: false,
      controllerSince: null,
      alive: true,
      missedPings: 0,
      // rate limiter per detik
      rl: { sec: Math.floor(Date.now() / 1000), control: 0, input: 0, touch: 0, violations: 0, droppedInput: 0 },
    };
    this.clients.add(client);

    const ip = ws._socket?.remoteAddress || "?";
    this.log.info(`[WS] terhubung: ${client.id.slice(0, 8)} role=${client.role} ip=${ip}`);

    ws.on("pong", () => { client.alive = true; client.missedPings = 0; });

    ws.on("message", (data, isBinary) => {
      if (isBinary) return; // protocol = JSON text frames saja
      this._onMessage(client, data);
    });

    ws.on("close", () => this._onClose(client));
    ws.on("error", () => { try { ws.terminate(); } catch { /* abaikan */ } });

    // heartbeat: ping tiap 20 detik; 2x tanpa balasan → terminate
    client._hb = setInterval(() => {
      if (this._closed) return;
      if (!client.alive) {
        client.missedPings++;
        if (client.missedPings >= 2) { try { ws.terminate(); } catch { /* abaikan */ } return; }
      }
      client.alive = false;
      try { ws.ping(); } catch { /* abaikan */ }
    }, 20000);

    // kirim welcome SETELAH hello (sesuai kontrak client.ts) —
    // tapi jika hello tidak kunjung, kirim welcome ringan setelah 1.5s agar tidak menggantung? TIDAK:
    // kontrak eksplisit: welcome dibalas atas hello. Koneksi tanpa hello hanya menunggu.
  }

  _onClose(client) {
    if (client._hb) { clearInterval(client._hb); client._hb = null; }
    this.clients.delete(client);
    if (this.controller === client) {
      this.log.info(`[WS] controller keluar: ${client.id.slice(0, 8)} — lepas semua input yang ditahan`);
      this._releaseHeldInputs();
      this.controller = null;
      this.broadcastState();
    }
    this.log.info(`[WS] terputus: ${client.id.slice(0, 8)} role=${client.role}`);
  }

  // ================= Pesan =================

  _send(client, obj) {
    try {
      if (client.ws.readyState === 1 /* OPEN */) client.ws.send(JSON.stringify(obj));
    } catch { /* abaikan */ }
  }

  _onMessage(client, data) {
    // batas ukuran eksplisit (WSS maxPayload juga menjaga, ini lapis kedua)
    if (data.length > MSG_MAX_BYTES) {
      this._send(client, { t: "error", message: "Pesan terlalu besar (maks 64KB)" });
      try { client.ws.close(1009, "message too big"); } catch { /* abaikan */ }
      return;
    }

    let msg;
    try { msg = JSON.parse(data.toString("utf8")); } catch { return; } // JSON invalid → abaikan
    if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return;

    // ---- rate limiter per detik ----
    const sec = Math.floor(Date.now() / 1000);
    const rl = client.rl;
    if (rl.sec !== sec) { rl.sec = sec; rl.control = 0; rl.input = 0; rl.touch = 0; }
    if (INPUT_TYPES.has(msg.t)) {
      rl.input++;
      const cfg = this.deps.getConfig();
      const inputBudget = Math.max(360, (cfg.maxTouchPerSec || 120) * 3);
      if (rl.input > inputBudget) { rl.droppedInput++; return; } // drop diam-diam, TIDAK disconnect
    } else {
      rl.control++;
      if (rl.control > CONTROL_LIMIT_PER_SEC) {
        rl.violations++;
        if (rl.violations > CONTROL_MAX_VIOLATIONS) {
          this.log.warn(`[WS] rate limit kontrol dilanggar berlebihan → disconnect ${client.id.slice(0, 8)}`);
          this._send(client, { t: "error", message: "Rate limit dilanggar — koneksi ditutup" });
          try { client.ws.close(1008, "rate limit"); } catch { /* abaikan */ }
          return;
        }
        return; // kelebihan kontrol: buang pesan ini
      }
    }

    switch (msg.t) {
      case "hello": {
        client.device = {
          name: typeof msg.device?.name === "string" && msg.device.name.trim() ? msg.device.name.trim().slice(0, 64) : "Perangkat",
          type: ["phone", "laptop", "tv", "other"].includes(msg.device?.type) ? msg.device.type : "other",
        };
        this._send(client, this._buildWelcome(client));
        this.broadcastState();
        break;
      }
      case "ping":
        this._send(client, { t: "pong", ts: Number(msg.ts) || 0 });
        break;
      case "claim":
        this._onClaim(client);
        break;
      case "release":
        if (this.controller === client) this._revokeController("lepas sukarela");
        this._send(client, { t: "granted", controller: false });
        break;
      case "estop":
        if (client.role === "admin") this.triggerEstop(`admin WS ${client.device?.name || client.id.slice(0, 8)}`);
        break;
      case "touch": {
        if (this.controller !== client) return; // hanya controller — sisanya diabaikan
        const cfg = this.deps.getConfig();
        rl.touch++;
        if (rl.touch > (cfg.maxTouchPerSec || 120)) { rl.droppedInput++; return; }
        const gw = this.deps.windows.findGameWindow();
        const rect = gw && !gw.minimized && gw.rect ? gw.rect : null;
        this.deps.input.touch(Math.round(Number(msg.id)) || 0, String(msg.phase), clamp01(msg.x), clamp01(msg.y), rect);
        break;
      }
      case "joy": {
        if (this.controller !== client) return;
        this.deps.input.joystick(clampVec(msg.x), clampVec(msg.y), !!msg.active, this.deps.getConfig().joystickKeys);
        break;
      }
      case "btn": {
        if (this.controller !== client) return;
        if (typeof msg.key !== "string") return;
        this.deps.input.button(msg.key, msg.phase === "down" ? "down" : "up");
        break;
      }
      case "key": {
        if (this.controller !== client) return;
        if (typeof msg.key !== "string") return;
        if (msg.phase === "down") this.deps.input.keyboardDown(msg.key);
        else this.deps.input.keyboardUp(msg.key);
        break;
      }
      case "wheel": {
        if (this.controller !== client) return;
        this.deps.input.wheel(Number(msg.dy) || 0);
        break;
      }
      default:
        // tipe tidak dikenal → abaikan (jangan crash)
        break;
    }
  }

  // ================= Controller & grant =================

  _isInputUsable() {
    return !!this.deps.input.available;
  }

  _onClaim(client) {
    const cfg = this.deps.getConfig();
    const DENY_INPUT_OFF = "Input dinonaktifkan operator";
    const DENY_LOCK = "Controller lock: perangkat lain sedang mengendalikan (ADMIN bisa paksa lewat panel)";
    const DENY_KOFFI = "koffi belum terpasang — lihat README";
    const DENY_ESTOP = "E-STOP aktif — minta operator mengaktifkan input kembali";

    if (!this._isInputUsable()) return this._send(client, { t: "denied", reason: DENY_KOFFI });
    if (this.estopped) return this._send(client, { t: "denied", reason: DENY_ESTOP });
    if (!cfg.inputEnabled) return this._send(client, { t: "denied", reason: DENY_INPUT_OFF });

    if (this.controller === client) {
      return this._send(client, { t: "granted", controller: true }); // sudah controller
    }
    if (cfg.controllerLock && this.controller && client.role !== "admin") {
      return this._send(client, { t: "denied", reason: DENY_LOCK });
    }
    // admin melewati controllerLock (tapi TIDAK melewati inputEnabled/estop — keselamatan)
    this._takeOver(client);
  }

  _takeOver(client) {
    const prev = this.controller;
    if (prev && prev !== client) {
      this._send(prev, { t: "granted", controller: false });
      this._releaseHeldInputs(); // input controller lama dilepas bersih
    }
    this.controller = client;
    client.controller = true;
    client.controllerSince = Date.now();

    // best-effort: bawa jendela game ke foreground agar SendInput mengenai game
    const gw = this.deps.windows.findGameWindow();
    if (gw && gw.id.startsWith("window:")) {
      const ptr = this.deps.windows.getWindowPointer(gw.id);
      const num = Number(String(gw.id).slice("window:".length)) || 0;
      if (ptr) this.deps.input.ensureForeground(ptr, num);
    }

    this._send(client, { t: "granted", controller: true });
    this.log.info(`[WS] controller: ${client.device?.name || "?"} (${client.id.slice(0, 8)}${client.role === "admin" ? ", admin" : ""})`);
    this.broadcastState();
  }

  /** Cabut controller aktif (+ lepas input yang ditahan). */
  _revokeController(reason) {
    const prev = this.controller;
    if (!prev) return;
    this._releaseHeldInputs();
    prev.controller = false;
    prev.controllerSince = null;
    this._send(prev, { t: "granted", controller: false });
    this.controller = null;
    this.log.info(`[WS] controller dicabut (${reason || "-"}): ${prev.id.slice(0, 8)}`);
    this.broadcastState();
  }

  _releaseHeldInputs() {
    this.deps.input.releaseAll();
  }

  // ================= Aksi dari REST (httpapi.mjs) =================

  /** Paksa grant controller ke clientId tertentu. Return string error atau null. */
  forceGrant(clientId) {
    if (!this._isInputUsable()) return "koffi belum terpasang — input tidak bisa diforward (lihat README)";
    const target = [...this.clients].find((c) => c.id === clientId);
    if (!target) return "clientId tidak ditemukan — perangkat sudah terputus?";
    this._takeOver(target);
    return null;
  }

  /** Cabut controller (clientId opsional; tanpa clientId → controller aktif). */
  forceRevoke(clientId, reason) {
    if (clientId) {
      const target = [...this.clients].find((c) => c.id === clientId);
      if (!target) return "clientId tidak ditemukan";
      if (this.controller === target) this._revokeController(reason || "direvoke operator");
      else this._send(target, { t: "granted", controller: false });
      return null;
    }
    if (!this.controller) return "tidak ada controller aktif";
    this._revokeController(reason || "direvoke operator");
    return null;
  }

  /** E-STOP: lepas semua input, cabut controller, sticky estopped. */
  triggerEstop(by) {
    this.estopped = true;
    this._releaseHeldInputs();
    if (this.controller) this._revokeController("E-STOP");
    this.log.warn(`[ESTOP] Dipicu oleh: ${by || "tidak diketahui"} — semua input dilepas, controller dicabut (sticky).`);
    this.broadcastState();
  }

  /** Buka kunci estop (via /api/input enabled:true). */
  clearEstop() {
    if (this.estopped) {
      this.estopped = false;
      this.log.ok("[ESTOP] Kondisi E-STOP dihapus oleh operator (input diaktifkan).");
      this.broadcastState();
    }
  }

  /** Input dimatikan operator → lepas input + cabut controller. */
  disableInput() {
    this._releaseHeldInputs();
    if (this.controller) this._revokeController("input dimatikan operator");
    this.broadcastState();
  }

  // ================= Broadcast =================

  _buildWelcome(client) {
    const st = this.deps.getStatus();
    const cfg = this.deps.getConfig();
    return {
      t: "welcome",
      you: { id: client.id, role: client.role, controller: this.controller === client },
      controller: {
        id: this.controller?.id ?? null,
        device: this.controller?.device?.name ?? null,
      },
      inputEnabled: cfg.inputEnabled,
      quality: cfg.quality,
      game: st.game,
      capture: st.capture,
      mediamtx: st.mediamtx,
      viewers: this._counts().viewers,
      estopped: this.estopped,
    };
  }

  /** Broadcast {t:"state", status} — bentuk SAMA dengan /api/status minus `ok`. */
  broadcastState() {
    if (this._closed) return;
    const st = this.deps.getStatus();
    const { ok: _ok, ...statusNoOk } = st;
    const payload = JSON.stringify({ t: "state", status: statusNoOk });
    for (const c of this.clients) {
      try {
        if (c.ws.readyState === 1) c.ws.send(payload);
      } catch { /* abaikan */ }
    }
  }

  _counts() {
    let viewers = 0;
    for (const c of this.clients) if (c.role === "viewer") viewers++;
    return { clients: this.clients.size, viewers };
  }

  // ================= Info untuk status =================

  getControllerInfo() {
    return {
      id: this.controller?.id ?? null,
      device: this.controller?.device?.name ?? null,
      since: this.controller?.controllerSince ?? null,
    };
  }
  getCounts() { return this._counts(); }
  isEstopped() { return this.estopped; }

  // ================= Shutdown =================

  stop() {
    this._closed = true;
    for (const c of [...this.clients]) {
      try { c._hb && clearInterval(c._hb); } catch { /* abaikan */ }
      try { c.ws.close(1001, "agent shutdown"); } catch { /* abaikan */ }
      try { c.ws.terminate(); } catch { /* abaikan */ }
    }
    this.clients.clear();
    this.controller = null;
    try { this.wss.close(); } catch { /* abaikan */ }
  }
}

export default AgentWsHub;

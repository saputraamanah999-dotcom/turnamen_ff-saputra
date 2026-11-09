// ============================================================
// STIKAR BROADCAST AGENT — src/httpapi.mjs
// ------------------------------------------------------------
// HTTP server (node:http) — SEMUA di SATU port (httpPort, default 8082):
//   GET  /api/health        → liveness (tanpa auth)
//   GET  /api/status        → AgentStatus penuh (tanpa auth; tanpa token apa pun)
//   GET  /api/network       → IP + port + URL stream (tanpa token, TANPA token auth)
//   GET  /api/sources       → daftar sumber (ADMIN)
//   POST /api/capture/start → mulai capture {sourceId, quality} (ADMIN)
//   POST /api/capture/stop  → hentikan capture (ADMIN)
//   POST /api/quality       → ubah kualitas (restart capture bila aktif) (ADMIN)
//   GET/POST /api/config    → baca/patch config (ADMIN, token disamarkan)
//   POST /api/input         → toggle input/controllerLock (ADMIN; enable menghapus estop)
//   POST /api/grant         → paksa controller grant/revoke/release (ADMIN)
//   POST /api/estop         → E-STOP: lepas semua input + sticky (ADMIN)
//   POST /api/pair/rotate   → token viewer baru + URL pairing (ADMIN)
//   *    /whep[/...]        → proxy WHEP (SDP) ke MediaMTX — jaminan CORS browser
//   GET  /hls/*             → proxy HLS ke MediaMTX
//   GET  /                  → dashboard status (HTML gelap, auto-refresh 2s, tanpa dependensi)
//
// CORS: Access-Control-Allow-Origin * (LAN terpercaya; keamanan lewat token).
// ============================================================
import http from "node:http";
import { Readable } from "node:stream";
import crypto from "node:crypto";
import { sanitize } from "./logger.mjs";
import { AGENT_NAME, VERSION } from "./config.mjs";
import { dashboardHtml } from "./dashboard.mjs.html?raw" with { type: "text" }; // fallback di bawah

// Fungsi hash & compare yang sama dengan ws.mjs (timing-safe).
function hashToken(t) {
  return crypto.createHash("sha256").update(String(t ?? "")).digest();
}
function safeEqual(a, b) {
  return crypto.timingSafeEqual(hashToken(a), hashToken(b));
}

const BODY_LIMIT = 512 * 1024; // 512KB cukup untuk SDP + JSON config

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Type,Location,ETag");
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error("body terlalu besar"), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Buat HTTP server.
 * @param {object} ctx {
 *   log, getConfig(), saveConfigPatch(patch), saveConfig(), capture, mediamtx,
 *   windows, wsHub, input, buildStatus()
 * }
 */
export function createHttpServer(ctx) {
  const { log, getConfig } = ctx;

  function isAdmin(req) {
    const cfg = getConfig();
    const m = /^Bearer\s+(.+)$/i.exec(req.headers["authorization"] || "");
    if (!m) return false;
    if (!cfg.adminToken) return false; // token kosong → tidak ada akses admin (jujur & aman)
    return safeEqual(m[1], cfg.adminToken);
  }

  async function handle(req, res) {
    const u = new URL(req.url || "/", "http://localhost");
    const p = u.pathname.replace(/\/+$/, "") || "/";
    const method = req.method || "GET";

    setCors(res);
    if (method === "OPTIONS") {
      res.writeHead(204, { Allow: "GET,POST,OPTIONS" });
      res.end();
      return;
    }

    const cfg = getConfig();

    // ---------- Proksi MediaMTX (tanpa auth — LAN; auth tetap di REST/WS) ----------
    if (p === "/whep" || p.startsWith("/whep/")) return proxyWhep(req, res, p, cfg);
    if (p === "/hls" || p.startsWith("/hls/")) return proxyHls(req, res, p, cfg);

    // ---------- Publik ----------
    if (p === "/" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(dashboardHtml());
      return;
    }
    if (p === "/api/health") {
      return sendJson(res, 200, { ok: true, agent: AGENT_NAME, version: VERSION });
    }
    if (p === "/api/status") {
      return sendJson(res, 200, ctx.buildStatus());
    }
    if (p === "/api/network") {
      const ips = ctx.getLanIps();
      const ip = ips[0] || "127.0.0.1";
      return sendJson(res, 200, {
        ips,
        httpPort: cfg.httpPort,
        webrtcPort: cfg.webrtcPort,
        hlsPort: cfg.hlsPort,
        rtspPort: cfg.rtspPort,
        whepUrl: `http://${ip}:${cfg.webrtcPort}/${cfg.streamPath}`,
        hlsUrl: `http://${ip}:${cfg.hlsPort}/${cfg.streamPath}/index.m3u8`,
      });
    }

    // ---------- Admin ----------
    if (p.startsWith("/api/") && !isAdmin(req)) {
      return sendJson(res, 401, { error: "Butuh token admin — kirim header: Authorization: Bearer <adminToken>" });
    }

    if (p === "/api/sources" && method === "GET") {
      await ctx.windows.refresh();
      const current = ctx.capture.publicInfo().sourceId;
      const sources = [
        ...ctx.windows.listWindows().map((w) => ({ id: w.id, title: w.title, kind: w.kind, process: w.process, selected: w.id === current })),
        { ...ctx.windows.getDesktopSource(0), selected: current === "desktop:0" },
      ];
      return sendJson(res, 200, { sources });
    }

    if (p === "/api/capture/start" && method === "POST") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch { return sendJson(res, 400, { error: "Body JSON tidak valid" }); }
      if (!body.sourceId || typeof body.sourceId !== "string") {
        return sendJson(res, 400, { error: "Field sourceId wajib (dari /api/sources)" });
      }
      const result = await ctx.capture.start(body.sourceId, body.quality || cfg.quality);
      if (!result.ok) {
        // bedakan kesalahan user (400) vs lingkungan (500)
        const isUserErr = /minimize|Sumber tidak ditemukan/i.test(result.error || "");
        return sendJson(res, isUserErr ? 400 : 500, { error: result.error });
      }
      return sendJson(res, 200, { ok: true, status: ctx.buildStatus() });
    }

    if (p === "/api/capture/stop" && method === "POST") {
      await ctx.capture.stop("api");
      return sendJson(res, 200, { ok: true });
    }

    if (p === "/api/quality" && method === "POST") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch { return sendJson(res, 400, { error: "Body JSON tidak valid" }); }
      if (!["low", "medium", "high"].includes(body.quality)) {
        return sendJson(res, 400, { error: "quality harus low|medium|high" });
      }
      ctx.saveConfigPatch({ quality: body.quality });
      if (ctx.capture.publicInfo().active) {
        await ctx.capture.restartWithQuality(body.quality);
      }
      return sendJson(res, 200, { ok: true, quality: body.quality });
    }

    if (p === "/api/config" && method === "GET") {
      return sendJson(res, 200, sanitize(cfg));
    }
    if (p === "/api/config" && method === "POST") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch { return sendJson(res, 400, { error: "Body JSON tidak valid" }); }
      const next = ctx.saveConfigPatch(body);
      log.info("[API] config diperbarui via REST:", Object.keys(body).join(", ") || "(kosong)");
      return sendJson(res, 200, sanitize(next));
    }

    if (p === "/api/input" && method === "POST") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch { return sendJson(res, 400, { error: "Body JSON tidak valid" }); }
      if (typeof body.enabled === "boolean") {
        cfg.inputEnabled = body.enabled;
        if (body.enabled) {
          ctx.wsHub.clearEstop(); // mengaktifkan input menghapus kondisi E-STOP
          log.ok("[API] input DIAKTIFKAN oleh operator");
        } else {
          ctx.wsHub.disableInput();
          log.warn("[API] input DIMATIKAN oleh operator — semua input dilepas");
        }
      }
      if (typeof body.controllerLock === "boolean") {
        cfg.controllerLock = body.controllerLock;
        log.info(`[API] controllerLock = ${cfg.controllerLock}`);
      }
      ctx.wsHub.broadcastState();
      return sendJson(res, 200, { ok: true, input: ctx.buildStatus().input });
    }

    if (p === "/api/grant" && method === "POST") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch { return sendJson(res, 400, { error: "Body JSON tidak valid" }); }
      const action = body.action;
      const clientId = body.clientId || null;
      if (!["grant", "revoke", "release"].includes(action)) {
        return sendJson(res, 400, { error: "action harus grant|revoke|release" });
      }
      let err = null;
      if (action === "grant") {
        if (!clientId) return sendJson(res, 400, { error: "action grant butuh clientId perangkat tujuan" });
        err = ctx.wsHub.forceGrant(clientId);
      } else if (action === "revoke") {
        err = ctx.wsHub.forceRevoke(clientId, "direvoke operator");
      } else {
        err = ctx.wsHub.forceRevoke(clientId, "direlease operator");
      }
      if (err) return sendJson(res, 400, { error: err });
      return sendJson(res, 200, { ok: true });
    }

    if (p === "/api/estop" && method === "POST") {
      ctx.wsHub.triggerEstop("REST /api/estop");
      return sendJson(res, 200, { ok: true });
    }

    if (p === "/api/pair/rotate" && method === "POST") {
      const newToken = crypto.randomBytes(24).toString("hex");
      cfg.viewerToken = newToken;
      ctx.saveConfig();
      const ips = ctx.getLanIps();
      const ip = ips[0] || "127.0.0.1";
      const connectUrl = `http://${ip}:${cfg.httpPort}`;
      log.banner([
        "  TOKEN VIEWER BARU (pairing di-rotate)",
        `  viewerToken : ${newToken}`,
        `  Hubungkan HP (satu Wi-Fi): buka ${connectUrl} di browser`,
        "  → website /live/interactive → masukkan token di atas",
      ]);
      return sendJson(res, 200, { viewerToken: newToken, connectUrl });
    }

    return sendJson(res, 404, { error: "Endpoint tidak ditemukan: " + p });
  }

  // ---------------- Proksi WHEP (SDP) → MediaMTX ----------------
  async function proxyWhep(req, res, pathname, cfg) {
    const tail = pathname === "/whep" ? "" : pathname.slice("/whep".length);
    const upstream = `http://127.0.0.1:${cfg.webrtcPort}/${cfg.streamPath}/whep${tail}`;
    try {
      let body;
      if (!["GET", "HEAD"].includes(req.method)) body = await readBody(req);
      const headers = {};
      if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];
      if (req.headers["etag"]) headers["If-Match"] = req.headers["etag"];
      const r = await fetch(upstream, { method: req.method, headers, body });
      const outHeaders = {
        "Content-Type": r.headers.get("content-type") || "application/sdp",
        "Cache-Control": "no-store",
      };
      const loc = r.headers.get("location");
      if (loc) outHeaders["Location"] = loc;
      const etag = r.headers.get("etag");
      if (etag) outHeaders["ETag"] = etag;
      res.writeHead(r.status, outHeaders);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch {
      sendJson(res, 502, { error: "MediaMTX tidak merespons di port " + cfg.webrtcPort + " — WebRTC belum siap (cek status MediaMTX di dashboard agent)" });
    }
  }

  // ---------------- Proksi HLS → MediaMTX ----------------
  async function proxyHls(req, res, pathname, cfg) {
    const rest = pathname.replace(/^\/hls\/?/, "");
    const upstream = `http://127.0.0.1:${cfg.hlsPort}/${rest}${u2search(req)}`;
    function u2search(r) { try { return new URL(r.url, "http://x").search; } catch { return ""; } }
    try {
      const headers = {};
      if (req.headers["range"]) headers["Range"] = req.headers["range"];
      const r = await fetch(upstream, { method: req.method === "POST" ? "GET" : req.method, headers });
      const outHeaders = {
        "Content-Type": r.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "no-store",
      };
      const clen = r.headers.get("content-length");
      if (clen) outHeaders["Content-Length"] = clen;
      const crange = r.headers.get("content-range");
      if (crange) outHeaders["Content-Range"] = crange;
      res.writeHead(r.status, outHeaders);
      if (r.body) Readable.fromWeb(r.body).pipe(res);
      else res.end();
    } catch {
      sendJson(res, 502, { error: "MediaMTX tidak merespons di port " + cfg.hlsPort + " — HLS belum siap (cek status MediaMTX di dashboard agent)" });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      log.error("[HTTP] error:", e?.message || e);
      try {
        sendJson(res, 500, { error: "Kesalahan internal agent: " + (e?.message || String(e)) });
      } catch { /* header sudah terkirim */ }
    });
  });
  server.keepAliveTimeout = 15000;
  return server;
}

export default createHttpServer;

#!/usr/bin/env node
// ============================================================
// Harness visual tema: render markup representatif BOF dengan CSS
// produksi hasil build, screenshot 8 tema (R-34 antislop).
// Output: /tmp/theme-shots/<theme>.png
// ============================================================
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const cssDir = resolve(ROOT, ".next/static/chunks");
const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith(".css"));
if (!cssFiles.length) { console.error("Tidak ada CSS hasil build — jalankan npm run build dulu."); process.exit(1); }
const css = cssFiles.map((f) => readFileSync(resolve(cssDir, f), "utf8")).join("\n");

const html = `<!doctype html><html lang="id" data-theme="firestorm"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head>
<body class="bg-fs-bg text-fs-text" style="font-family:system-ui,sans-serif">
<div class="fs-arena-bg min-h-screen p-6 space-y-4">
  <div class="flex items-center gap-3">
    <span class="bo-kicker">Live Standings</span>
    <span class="bo-badge">Group A</span>
    <span class="fs-live-badge inline-flex items-center gap-1.5 bg-fs-err px-2.5 py-1 text-xs font-black uppercase tracking-[0.2em] text-white">LIVE</span>
  </div>
  <h1 class="bo-title">Battle Off Friends</h1>
  <div class="bo-card p-4 space-y-3">
    <div class="flex flex-wrap gap-2">
      <button class="bo-btn bo-btn-primary">Mulai Sesi</button>
      <button class="bo-btn bo-btn-gold">Ganti Kode</button>
      <button class="bo-btn bo-btn-cyan">Salin Link</button>
      <button class="bo-btn bo-btn-danger">Matikan</button>
      <button class="bo-btn">Netral</button>
    </div>
    <input class="bo-input max-w-xs" placeholder="Label sumber" />
    <p class="text-xs font-semibold text-fs-muted">Teks muted di atas panel: kontras, badge &amp; baris data.</p>
    <div class="border border-fs-edge p-3">
      <p class="text-[10px] font-black uppercase tracking-widest text-fs-muted">Kode Pairing</p>
      <p class="font-stat text-4xl font-black tracking-widest text-fs-cyan tabular-nums">528 346</p>
      <p class="text-sm font-bold text-fs-gold">Team Alpha · 62 poin</p>
    </div>
    <div class="grid grid-cols-4 gap-2">
      ${["#080B10","#FF5A1F","#FFC247","#35D6FF"].map((c) => `<span style="background:${c}" class="h-5 block"></span>`).join("")}
    </div>
    <div class="bo-stripe h-3 w-40"></div>
  </div>
  <div class="fs-holo inline-block p-3 text-xs font-black uppercase tracking-widest">Panel Holografik</div>
</div>
</body></html>`;

mkdirSync("/tmp/theme-shots", { recursive: true });
writeFileSync("/tmp/theme-shots/harness.html", html);

const { chromium } = await import("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.goto("file:///tmp/theme-shots/harness.html");
const themes = ["firestorm", "obsidian-gold", "cyber-blue", "purple-arena", "black-championship", "red-combat", "toxic-green", "frost-glass"];
for (const t of themes) {
  await page.evaluate((id) => { document.documentElement.dataset.theme = id; }, t);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `/tmp/theme-shots/${t}.png` });
  console.log("shot:", t);
}
await browser.close();

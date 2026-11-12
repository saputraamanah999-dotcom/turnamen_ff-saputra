// ============================================================
// STIKAR ESPORTS — SERTIFIKAT JUARA OTOMATIS (canvas, tanpa server)
// Menghasilkan PNG 2000×1414 (rasio A4 landscape) berisi:
//   - Logo SMK TI Bali Global Karangasem (aset resmi panitia)
//   - Penyelenggara: SMK TI BALI GLOBAL KARANGASEM × OSIS
//   - Nama tim juara 1/2/3 + poin & kill (dari klasemen resmi)
//   - Tanda tangan digital "S" (kurva bezier) atas nama
//     I KOMANG EDI SAPUTRA — Ketua Panitia
// Dipakai komponen ChampionCertificates di halaman /leaderboard publik.
// ============================================================

export const CERT_WIDTH = 2000;
export const CERT_HEIGHT = 1414;

export interface CertificateData {
  rank: 1 | 2 | 3;
  teamName: string;
  teamTag?: string;
  kills: number;
  points: number;
  tournamentName: string;
}

export const MEDAL = {
  1: { name: "JUARA 1", color: "#FFC247", dark: "#B97E14", light: "#FFF3C4", glow: "rgba(255,194,71,.55)" },
  2: { name: "JUARA 2", color: "#C0C8D4", dark: "#8B94A3", light: "#EEF2F8", glow: "rgba(192,200,212,.45)" },
  3: { name: "JUARA 3", color: "#C98A4B", dark: "#8F5D2C", light: "#F2D9BD", glow: "rgba(201,138,75,.45)" },
} as const;

const INK = "#F5EBC8"; // warna tinta tanda tangan (krem emas)
const ORGANIZER = "SMK TI BALI GLOBAL KARANGASEM";
const SIGNER_NAME = "I KOMANG EDI SAPUTRA";
const SIGNER_ROLE = "Ketua Panitia · STIKAR ESPORTS";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Muat logo (PNG transparan resmi panitia) — resolve null bila gagal. */
function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Tanda tangan digital "S" — kurva bezier bergaya pulpen + garis flores. */
function drawSignature(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const path = new Path2D();
  //Huruf "S" kursif
  path.moveTo(168, 18);
  path.bezierCurveTo(152, 0, 116, 2, 98, 24);
  path.bezierCurveTo(78, 48, 84, 80, 106, 102);
  path.bezierCurveTo(132, 128, 140, 158, 116, 184);
  path.bezierCurveTo(94, 208, 60, 208, 48, 182);
  path.bezierCurveTo(40, 164, 50, 150, 68, 149);
  //Flores (coretan bawah khas tanda tangan)
  path.moveTo(36, 202);
  path.bezierCurveTo(92, 216, 152, 198, 198, 168);

  //Lapisan utama + sentuhan "tinta" kedua agar terlihat seperti tulisan tangan
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7.5;
  ctx.stroke(path);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.translate(-1, -1.5);
  ctx.stroke(path);
  ctx.restore();
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  } catch { /* browser lama — abaikan */ }
}

function centerText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number) {
  ctx.textAlign = "center";
  ctx.fillText(text, cx, y);
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, base: number, weight = 900, family = "'Arial Black','Segoe UI',sans-serif") {
  let size = base;
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxW || size <= 34) break;
    size -= 4;
  }
  return size;
}

/** Bangun kanvas sertifikat lengkap. opts.width untuk skala preview (default penuh 2000px). */
export async function buildCertificateCanvas(data: CertificateData, opts: { width?: number } = {}): Promise<HTMLCanvasElement> {
  const target = Math.max(320, Math.min(CERT_WIDTH, opts.width ?? CERT_WIDTH));
  const k = target / CERT_WIDTH;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(CERT_WIDTH * k);
  canvas.height = Math.round(CERT_HEIGHT * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung browser ini.");
  ctx.scale(k, k);

  const W = CERT_WIDTH;
  const H = CERT_HEIGHT;
  const CX = W / 2;
  const medal = MEDAL[data.rank];

  // ---------- Latar ----------
  ctx.fillStyle = "#0A0E15";
  ctx.fillRect(0, 0, W, H);
  const vig = ctx.createRadialGradient(CX, H * 0.42, 120, CX, H * 0.42, 1250);
  vig.addColorStop(0, "rgba(30,41,59,.55)");
  vig.addColorStop(1, "rgba(6,9,14,.98)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  // Garis diagonal halus (tekstur esports)
  ctx.save();
  ctx.globalAlpha = 0.028;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  for (let x = -H; x < W; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  ctx.restore();

  // Watermark raksasa
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 470px 'Arial Black','Segoe UI',sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("BOF", CX, H * 0.62);
  ctx.restore();

  // ---------- Bingkai emas ----------
  const gold = ctx.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, "#8A5F12");
  gold.addColorStop(0.25, "#FFC247");
  gold.addColorStop(0.5, "#FFF3C4");
  gold.addColorStop(0.75, "#FFC247");
  gold.addColorStop(1, "#8A5F12");
  ctx.strokeStyle = gold;
  ctx.lineWidth = 12;
  ctx.strokeRect(38, 38, W - 76, H - 76);
  ctx.strokeStyle = "rgba(255,194,71,.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(66, 66, W - 132, H - 132);
  // Aksen sudut
  ctx.strokeStyle = gold;
  ctx.lineWidth = 6;
  const cLen = 90;
  const corners: [number, number, number, number][] = [
    [38, 38, 1, 1], [W - 38, 38, -1, 1], [38, H - 38, 1, -1], [W - 38, H - 38, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * cLen, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * cLen);
    ctx.stroke();
  }

  // ---------- Logo sekolah (medali putih + cincin emas) ----------
  const logo = await loadLogo("/logos/smk-ti-bali-global.png");
  const lr = 118;
  ctx.save();
  ctx.shadowColor = "rgba(255,194,71,.5)";
  ctx.shadowBlur = 34;
  ctx.beginPath();
  ctx.arc(CX, 225, lr, 0, Math.PI * 2);
  ctx.fillStyle = "#F5F7FA";
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(CX, 225, lr + 8, 0, Math.PI * 2);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 7;
  ctx.stroke();
  if (logo) {
    // contain-fit di dalam lingkaran
    const box = lr * 1.5;
    const ratio = Math.min(box / logo.width, box / logo.height);
    const iw = logo.width * ratio;
    const ih = logo.height * ratio;
    ctx.drawImage(logo, CX - iw / 2, 225 - ih / 2, iw, ih);
  } else {
    ctx.fillStyle = "#0B0E14";
    ctx.font = "900 44px 'Arial Black','Segoe UI',sans-serif";
    centerText(ctx, "SMK", CX, 218);
    centerText(ctx, "TI BALI", CX, 268);
  }

  // ---------- Judul ----------
  ctx.fillStyle = "#9FB0C8";
  setLetterSpacing(ctx, 9);
  ctx.font = "700 30px 'Segoe UI',Arial,sans-serif";
  centerText(ctx, "SERTIFIKAT PENGHARGAAN ESPORT", CX, 408);
  setLetterSpacing(ctx, 0);

  const titleGrad = ctx.createLinearGradient(CX - 500, 0, CX + 500, 0);
  titleGrad.addColorStop(0, "#B97E14");
  titleGrad.addColorStop(0.35, "#FFC247");
  titleGrad.addColorStop(0.55, "#FFF3C4");
  titleGrad.addColorStop(0.8, "#FFC247");
  titleGrad.addColorStop(1, "#B97E14");
  setLetterSpacing(ctx, 14);
  ctx.font = "900 116px 'Arial Black','Segoe UI',sans-serif";
  ctx.shadowColor = "rgba(255,194,71,.35)";
  ctx.shadowBlur = 26;
  ctx.fillStyle = titleGrad;
  centerText(ctx, "SERTIFIKAT JUARA", CX, 522);
  ctx.shadowBlur = 0;
  setLetterSpacing(ctx, 0);

  ctx.fillStyle = "rgba(230,237,247,.82)";
  setLetterSpacing(ctx, 6);
  ctx.font = "800 30px 'Segoe UI',Arial,sans-serif";
  centerText(ctx, (data.tournamentName || "BATTLE OFF FRIENDS").toUpperCase(), CX, 578);
  setLetterSpacing(ctx, 0);

  // ---------- Penerima ----------
  ctx.fillStyle = "#9FB0C8";
  setLetterSpacing(ctx, 8);
  ctx.font = "700 30px 'Segoe UI',Arial,sans-serif";
  centerText(ctx, "DENGAN BANGGA DIBERIKAN KEPADA", CX, 672);
  setLetterSpacing(ctx, 0);

  const teamText = data.teamName.toUpperCase();
  const teamSize = fitFont(ctx, teamText, 1560, 122);
  ctx.font = `900 ${teamSize}px 'Arial Black','Segoe UI',sans-serif`;
  ctx.shadowColor = "rgba(255,255,255,.28)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#FFFFFF";
  centerText(ctx, teamText, CX, 780);
  ctx.shadowBlur = 0;

  ctx.fillStyle = medal.color;
  setLetterSpacing(ctx, 6);
  ctx.font = "800 32px 'Segoe UI',Arial,sans-serif";
  const tagPart = data.teamTag ? `[${data.teamTag}] · ` : "";
  centerText(ctx, `${tagPart}${data.points} POIN · ${data.kills} KILL`, CX, 838);
  setLetterSpacing(ctx, 0);

  // ---------- Badge JUARA ----------
  ctx.fillStyle = "#9FB0C8";
  setLetterSpacing(ctx, 10);
  ctx.font = "700 24px 'Segoe UI',Arial,sans-serif";
  centerText(ctx, "SEBAGAI", CX, 906);
  setLetterSpacing(ctx, 0);

  const bw = 380;
  const bh = 84;
  ctx.save();
  ctx.shadowColor = medal.glow;
  ctx.shadowBlur = 30;
  const badgeGrad = ctx.createLinearGradient(CX - bw / 2, 0, CX + bw / 2, 0);
  badgeGrad.addColorStop(0, medal.dark);
  badgeGrad.addColorStop(0.5, medal.color);
  badgeGrad.addColorStop(1, medal.dark);
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, CX - bw / 2, 930, bw, bh, 14);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,.5)";
  ctx.lineWidth = 2;
  roundRect(ctx, CX - bw / 2, 930, bw, bh, 14);
  ctx.stroke();
  ctx.fillStyle = "#0B0E14";
  setLetterSpacing(ctx, 10);
  ctx.font = "900 46px 'Arial Black','Segoe UI',sans-serif";
  centerText(ctx, medal.name, CX, 986);
  setLetterSpacing(ctx, 0);

  // ---------- Penyelenggara ----------
  ctx.fillStyle = "#9FB0C8";
  ctx.font = "600 26px 'Segoe UI',Arial,sans-serif";
  centerText(ctx, "Turnamen diselenggarakan oleh", CX, 1076);
  ctx.fillStyle = "#E6EDF7";
  setLetterSpacing(ctx, 4);
  ctx.font = "900 34px 'Arial Black','Segoe UI',sans-serif";
  centerText(ctx, `${ORGANIZER} × OSIS`, CX, 1122);
  setLetterSpacing(ctx, 0);

  // ---------- Tanggal & kota (kiri bawah) ----------
  const dateText = `Karangasem, ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#E6EDF7";
  ctx.font = "700 30px 'Segoe UI',Arial,sans-serif";
  ctx.fillText(dateText, 150, 1198);
  ctx.fillStyle = "#9FB0C8";
  ctx.font = "600 24px 'Segoe UI',Arial,sans-serif";
  ctx.fillText("Panitia Penyelenggara Turnamen", 150, 1236);
  // Garis kosong untuk tanda tangan manual panitia (opsional)
  ctx.strokeStyle = "rgba(159,176,200,.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(150, 1300);
  ctx.lineTo(470, 1300);
  ctx.stroke();
  ctx.fillStyle = "#9FB0C8";
  ctx.font = "600 20px 'Segoe UI',Arial,sans-serif";
  ctx.fillText("Tanda tangan panitia (opsional)", 150, 1330);

  // ---------- Tanda tangan digital (kanan bawah) ----------
  drawSignature(ctx, 1470, 1000, 1.15);
  ctx.strokeStyle = "rgba(159,176,200,.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1450, 1268);
  ctx.lineTo(1810, 1268);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 30px 'Segoe UI',Arial,sans-serif";
  centerText(ctx, SIGNER_NAME, 1630, 1306);
  ctx.fillStyle = "#9FB0C8";
  ctx.font = "600 22px 'Segoe UI',Arial,sans-serif";
  centerText(ctx, SIGNER_ROLE, 1630, 1336);
  ctx.textAlign = "left";

  // ---------- Serial ----------
  ctx.fillStyle = "#6B7A92";
  ctx.font = "600 20px 'Consolas','Courier New',monospace";
  centerText(ctx, `${certificateSerial(data)} · STIKAR ESPORTS · DEVELOPED BY SAPUTRA DEVELOPER`, CX, 1344);
  ctx.textAlign = "left";

  return canvas;
}

/** Serial deterministik per tim+rank — mis. BOF-2026-J1-K3F2M9. */
export function certificateSerial(data: CertificateData): string {
  let hash = 0;
  const key = `${data.tournamentName}|${data.teamName}|${data.rank}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return `BOF-${new Date().getFullYear()}-J${data.rank}-${hash.toString(36).toUpperCase().slice(0, 6)}`;
}

/** URL dataURL untuk preview (skala kecil). */
export async function certificatePreviewUrl(data: CertificateData, width = 720): Promise<string> {
  const canvas = await buildCertificateCanvas(data, { width });
  return canvas.toDataURL("image/png");
}

/** Unduh sertifikat ukuran penuh (PNG 2000×1414). */
export async function downloadChampionCertificate(data: CertificateData): Promise<void> {
  const canvas = await buildCertificateCanvas(data);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  const safe = data.teamName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toUpperCase() || "TIM";
  const filename = `Sertifikat-${MEDAL[data.rank].name.replace(" ", "")}-${safe}-BOF.png`;
  const url = URL.createObjectURL(blob ?? new Blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ============================================================
// Generator papan skor Free Fire SINTETIS untuk uji OCR v4.
// 3 varian: 1 kolom (10 tim), 2 kolom (5+5), badge top-6 samar
// (replikasi bug nyata pengguna: badge tak terbaca → dulu jadi
// "rank 1" ganda). Output: scripts/fixtures/synth-*.png
// Jalankan: node scripts/gen-scoreboard.mjs (dari root repo)
// ============================================================
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "scripts", "fixtures");
fs.mkdirSync(OUT, { recursive: true });

const KILLS = {
  1: [3, 6, 5, 5],   // = 19  (kasus nyata pengguna)
  2: [9, 1, 4, 4],   // = 18
  3: [4, 3, 4, 4],   // = 15
  4: [1, 1, 2, 1],   // = 5
  5: [3, 2, 4, 2],   // = 11
  6: [2, 3, 3, 2],   // = 10
  7: [1, 1, 1, 1],   // = 4
  8: [1, 0, 1, 0],   // = 2
  9: [1, 1, 1, 0],   // = 3
  10: [0, 1, 0, 0],  // = 1
};
const TEAMS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Satu blok tim (layout FF ASLI: header + grid pemain 2×2,
 *  tiap sel "Nama  N Kill" — parser memodelkan blok ≤ 2 baris sel). */
function teamBlock(rank, x, y, opts = {}) {
  const badgeColor = opts.badgeColor ?? "#FFD24A";
  const rows = [];
  rows.push(
    `<text x="${x}" y="${y + 30}" font-family="DejaVu Sans" font-size="30" font-weight="bold" fill="${badgeColor}">${rank}</text>`,
    `<text x="${x + 56}" y="${y + 28}" font-family="DejaVu Sans" font-size="22" font-weight="bold" fill="#ffffff">${esc(TEAMS[rank - 1])}</text>`,
  );
  const ks = KILLS[rank];
  // 2×2 grid: sel kiri x+56, sel kanan x+400; dua baris sel y+62 / y+98.
  const cell = (k, cx, cy, idx) =>
    `<text x="${cx}" y="${cy}" font-family="DejaVu Sans" font-size="18" fill="#d8dce4">P${rank}M${idx}</text>` +
    `<text x="${cx + 150}" y="${cy}" font-family="DejaVu Sans" font-size="22" font-weight="bold" fill="#FFD24A">${k}</text>` +
    `<text x="${cx + 190}" y="${cy}" font-family="DejaVu Sans" font-size="19" fill="#bfc4cd">Kill</text>`;
  rows.push(cell(ks[0], x + 56, y + 62, 1));
  rows.push(cell(ks[1], x + 400, y + 62, 2));
  rows.push(cell(ks[2], x + 56, y + 98, 3));
  rows.push(cell(ks[3], x + 400, y + 98, 4));
  return rows.join("\n");
}

function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#12122a"/>
  <text x="${Math.round(w / 2)}" y="46" font-family="DejaVu Sans" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle">RESULT</text>
  ${body}
</svg>`;
}

async function render(name, svg) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const p = path.join(OUT, name);
  fs.writeFileSync(p, png);
  const meta = await sharp(png).metadata();
  console.log(`${name}: ${meta.width}x${meta.height}, ${png.length} bytes`);
}

// ---------- 1. Satu kolom, 10 tim ----------
{
  const W = 760;
  const teamH = 144;
  const H = 80 + 10 * teamH + 20;
  const parts = [];
  for (let r = 1; r <= 10; r++) parts.push(teamBlock(r, 40, 80 + (r - 1) * teamH));
  await render("synth-1col.png", svgDoc(W, H, parts.join("\n")));
}

// ---------- 2. Dua kolom, 5 + 5 tim ----------
{
  const W = 1440;
  const teamH = 144;
  const H = 80 + 5 * teamH + 20;
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push(teamBlock(i + 1, 40, 80 + i * teamH));
  for (let i = 0; i < 5; i++) parts.push(teamBlock(i + 6, 760, 80 + i * teamH));
  await render("synth-2col.png", svgDoc(W, H, parts.join("\n")));
}

// ---------- 3. Badge top-6 nyaris tak terlihat (bug pengguna) ----------
{
  const W = 760;
  const teamH = 144;
  const H = 80 + 10 * teamH + 20;
  const parts = [];
  for (let r = 1; r <= 10; r++) {
    parts.push(teamBlock(r, 40, 80 + (r - 1) * teamH, r === 6 ? { badgeColor: "#1c1c38" } : {}));
  }
  await render("synth-badge6-dark.png", svgDoc(W, H, parts.join("\n")));
}

console.log("selesai →", OUT);

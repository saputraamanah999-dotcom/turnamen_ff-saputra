#!/usr/bin/env node
// ============================================================
// Cek kontras WCAG AA token tema (R-25 antislop).
// Normal text >= 4.5:1, large/bold text >= 3:1.
// ============================================================
const THEMES = {
  firestorm: { bg: "#080B10", panel: "#18212C", text: "#F7F9FC", muted: "#98A2B3", fire: "#FF5A1F", onFire: "#0B0E14", gold: "#FFC247", cyan: "#35D6FF", ink: "#0B0E14" },
  "obsidian-gold": { bg: "#080B10", panel: "#18212C", text: "#F7F9FC", muted: "#98A2B3", fire: "#E7B84C", onFire: "#0B0E14", gold: "#FFE296", cyan: "#8FA8C0", ink: "#0B0E14" },
  "cyber-blue": { bg: "#080B10", panel: "#18212C", text: "#F7F9FC", muted: "#98A2B3", fire: "#35D6FF", onFire: "#0B0E14", gold: "#7BE8FF", cyan: "#19E3B2", ink: "#0B0E14" },
  "purple-arena": { bg: "#080B10", panel: "#18212C", text: "#F7F9FC", muted: "#98A2B3", fire: "#9333EA", onFire: "#FFFFFF", gold: "#F0ABFC", cyan: "#22D3EE", ink: "#0B0E14" },
  "black-championship": { bg: "#080B10", panel: "#18212C", text: "#F7F9FC", muted: "#98A2B3", fire: "#F7F9FC", onFire: "#0B0E14", gold: "#FFC247", cyan: "#8FA3B8", ink: "#0B0E14" },
  "red-combat": { bg: "#0A0A0C", panel: "#1B1518", text: "#F7F9FC", muted: "#98A2B3", fire: "#C8281F", onFire: "#FFFFFF", gold: "#E8C069", cyan: "#C9A46B", ink: "#0B0E14" },
  "toxic-green": { bg: "#080B10", panel: "#18212C", text: "#F7F9FC", muted: "#98A2B3", fire: "#A3E635", onFire: "#0B0E14", gold: "#FFC247", cyan: "#E7FCE3", ink: "#0B0E14" },
  "frost-glass": { bg: "#F2F6FB", panel: "#FAFCFF", text: "#0F172A", muted: "#4A5A70", fire: "#1D4ED8", onFire: "#FFFFFF", gold: "#92400E", cyan: "#0369A1", ink: "#FFFFFF" },
};

function lum(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

let fails = 0;
for (const [name, t] of Object.entries(THEMES)) {
  // Pemakaian nyata: teks utama di atas panel; muted di panel; teks putih di atas fire;
  // ink di atas gold & cyan (tombol/kicker); fire/gold/cyan sebagai teks aksen di panel.
  const checks = [
    ["text/panel", t.text, t.panel, 4.5],
    ["muted/panel", t.muted, t.panel, 4.5],
    ["on-fire/fire(btn)", t.onFire, t.fire, 4.5],
    ["ink/gold(btn)", t.ink, t.gold, 3.0],
    ["ink/cyan(btn)", t.ink, t.cyan, 3.0],
    ["fire/panel(aksen)", t.fire, t.panel, 3.0],
    ["gold/panel(aksen)", t.gold, t.panel, 3.0],
    ["cyan/panel(aksen)", t.cyan, t.panel, 3.0],
  ];
  const bad = checks.filter(([, fg, bg, min]) => ratio(fg, bg) < min);
  if (bad.length) fails += bad.length;
  console.log(`${bad.length ? "FAIL" : "PASS"}  ${name.padEnd(20)} ` +
    checks.map(([l, fg, bg, min]) => `${l} ${ratio(fg, bg).toFixed(2)}${ratio(fg, bg) < min ? "!" : ""}`).join("  "));
}
process.exit(fails ? 1 : 0);

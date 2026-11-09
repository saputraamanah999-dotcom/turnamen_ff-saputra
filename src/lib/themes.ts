// ============================================================
// STIKAR ESPORTS — Tema tampilan (§24 prompt PHASE 2)
// 5 tema resmi; token didefinisikan di globals.css via
// html[data-theme="…"]. Tersimpan di localStorage.
// ============================================================

export interface ThemeDef {
  id: string;
  name: string;
  note: string;
  swatch: string[]; // warna contoh untuk picker
}

export const THEMES: ThemeDef[] = [
  {
    id: "firestorm",
    name: "Firestorm Orange",
    note: "Default — oranye api, emas, sian elektrik",
    swatch: ["#FF5A1F", "#FF8A00", "#FFC247", "#35D6FF"],
  },
  {
    id: "obsidian-gold",
    name: "Obsidian Gold",
    note: "Hitam obsidian dengan aksen emas mewah",
    swatch: ["#E7B84C", "#F4D374", "#FFE296", "#8FA8C0"],
  },
  {
    id: "cyber-blue",
    name: "Cyber Blue",
    note: "Sian futuristik ala arena teknologi",
    swatch: ["#35D6FF", "#19B8E8", "#7BE8FF", "#19E3B2"],
  },
  {
    id: "purple-arena",
    name: "Purple Arena",
    note: "Ungu arena malam dengan sorot magenta",
    swatch: ["#A855F7", "#7C3AED", "#F0ABFC", "#22D3EE"],
  },
  {
    id: "black-championship",
    name: "Black Championship",
    note: "Monokrom perak untuk final yang berwibawa",
    swatch: ["#F7F9FC", "#C0C8D4", "#FFC247", "#8FA3B8"],
  },
];

export const DEFAULT_THEME = "firestorm";
const KEY = "stikar.theme";

export function getStoredTheme(): string {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const t = localStorage.getItem(KEY);
  return t && THEMES.some((x) => x.id === t) ? t : DEFAULT_THEME;
}

export function applyTheme(id: string): void {
  if (typeof document === "undefined") return;
  const valid = THEMES.some((x) => x.id === id);
  document.documentElement.dataset.theme = valid ? id : DEFAULT_THEME;
  try { localStorage.setItem(KEY, valid ? id : DEFAULT_THEME); } catch { /* abaikan */ }
}

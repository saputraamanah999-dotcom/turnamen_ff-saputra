// ============================================================
// STIKAR ESPORTS — Roster tema tampilan (DESIGN.md)
// 8 tema; token didefinisikan di globals.css via html[data-theme].
// Dipilih admin di /admin/broadcast → tersimpan di broadcastSettings
// (real-time ke semua layar) + localStorage sebagai preferensi awal.
// ============================================================

export interface ThemeDef {
  id: string;
  name: string;
  note: string;
  swatch: string[]; // warna contoh untuk picker admin
  /** Tema terang: picker memberi peringatan konteks pemakaian. */
  light?: boolean;
}

export const THEMES: ThemeDef[] = [
  {
    id: "firestorm",
    name: "Firestorm Orange",
    note: "Default — oranye api, emas, sian elektrik",
    swatch: ["#080B10", "#FF5A1F", "#FFC247", "#35D6FF"],
  },
  {
    id: "obsidian-gold",
    name: "Obsidian Gold",
    note: "Hitam obsidian dengan aksen emas mewah",
    swatch: ["#080B10", "#E7B84C", "#FFE296", "#8FA8C0"],
  },
  {
    id: "cyber-blue",
    name: "Cyber Blue",
    note: "Sian futuristik ala arena teknologi",
    swatch: ["#080B10", "#35D6FF", "#7BE8FF", "#19E3B2"],
  },
  {
    id: "purple-arena",
    name: "Purple Arena",
    note: "Ungu panggung malam dengan sorot magenta",
    swatch: ["#080B10", "#9333EA", "#F0ABFC", "#22D3EE"],
  },
  {
    id: "black-championship",
    name: "Black Championship",
    note: "Monokrom perak untuk final yang berwibawa",
    swatch: ["#080B10", "#F7F9FC", "#C0C8D4", "#FFC247"],
  },
  {
    id: "red-combat",
    name: "Red Combat",
    note: "Merah tempur zona Free Fire, aksen kuningan",
    swatch: ["#0A0A0C", "#C8281F", "#B91C1C", "#E8C069"],
  },
  {
    id: "toxic-green",
    name: "Toxic Green",
    note: "Hijau asam kontras ekstrem untuk LED besar",
    swatch: ["#080B10", "#A3E635", "#84CC16", "#FFC247"],
  },
  {
    id: "frost-glass",
    name: "Frost Glass (Terang)",
    note: "Satu-satunya tema terang — ruang kelas / proyektor",
    swatch: ["#F2F6FB", "#1D4ED8", "#0369A1", "#92400E"],
    light: true,
  },
];

export const DEFAULT_THEME = "firestorm";
const KEY = "stikar.theme";

export function isValidTheme(id: string | null | undefined): boolean {
  return typeof id === "string" && THEMES.some((x) => x.id === id);
}

export function getStoredTheme(): string {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const t = localStorage.getItem(KEY);
    return isValidTheme(t) ? (t as string) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * Terapkan tema ke dokumen. `persist = false` dipakai tema remote dari
 * admin (jangan menimpa preferensi lokal perangkat).
 */
export function applyTheme(id: string | null | undefined, persist = true): void {
  if (typeof document === "undefined") return;
  const theme = isValidTheme(id) ? (id as string) : DEFAULT_THEME;
  document.documentElement.dataset.theme = theme;
  if (persist) {
    try { localStorage.setItem(KEY, theme); } catch { /* abaikan */ }
  }
}

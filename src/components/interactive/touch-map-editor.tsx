"use client";
// ============================================================
// STIKAR ESPORTS — Touch Map Editor (Interactive Stream)
// Editor layout kontrol sentuh: preset, joystick, tombol aksi.
// Drag elemen di preview 16:9 → posisi tersimpan dalam persen.
// Persistensi dilakukan halaman pemanggil via loadInteractiveLayout().
// ============================================================

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Gamepad2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VirtualJoystick } from "./virtual-joystick";
import { ActionButtons, type ActionButtonItem } from "./action-buttons";

export interface JoystickConfig { xPct: number; yPct: number; size: number; opacity: number }
export interface InteractiveLayout { joystick: JoystickConfig; buttons: ActionButtonItem[] }

/** Daftar key umum yang diterima Agent (SendInput OS). */
export const ACTION_KEYS = [
  "MouseLeft", "MouseRight",
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL",
  "KeyQ", "KeyR", "KeyT", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "KeyZ", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP",
  "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
  "Space", "Enter", "ShiftLeft", "ControlLeft",
] as const;

export const LAYOUT_LS_KEY = "stikar.interactive.layout";

const mkBtn = (id: string, label: string, key: string, xPct: number, yPct: number, size: number, opacity = 0.8, hidden = false): ActionButtonItem =>
  ({ id, label, key, xPct, yPct, size, opacity, hidden });

/** Preset bawaan — mengikuti tata letak khas Free Fire mobile. */
export const DEFAULT_LAYOUT: InteractiveLayout = {
  joystick: { xPct: 18, yPct: 72, size: 140, opacity: 0.6 },
  buttons: [
    mkBtn("fire", "FIRE", "MouseLeft", 82, 62, 64),
    mkBtn("aim", "AIM", "MouseRight", 71, 78, 54),
    mkBtn("jump", "JUMP", "Space", 90, 40, 50),
    mkBtn("crouch", "CROUCH", "KeyC", 62, 40, 46),
    mkBtn("prone", "PRONE", "KeyZ", 52, 62, 46),
    mkBtn("reload", "RELOAD", "KeyR", 71, 62, 46),
    mkBtn("w1", "WPN 1", "Digit1", 30, 88, 44),
    mkBtn("w2", "WPN 2", "Digit2", 40, 88, 44, 0.8, true),
    mkBtn("w3", "WPN 3", "Digit3", 50, 88, 44, 0.8, true),
    mkBtn("w4", "WPN 4", "Digit4", 60, 88, 44, 0.8, true),
    mkBtn("grenade", "GRENADE", "KeyG", 92, 24, 44),
    mkBtn("medkit", "MEDKIT", "KeyH", 82, 24, 44),
    mkBtn("pickup", "PICKUP", "KeyF", 45, 30, 44),
  ],
};

export const MINIMAL_LAYOUT: InteractiveLayout = {
  joystick: { xPct: 18, yPct: 72, size: 140, opacity: 0.55 },
  buttons: [
    mkBtn("fire", "FIRE", "MouseLeft", 82, 62, 64),
    mkBtn("aim", "AIM", "MouseRight", 71, 78, 54),
    mkBtn("jump", "JUMP", "Space", 90, 40, 50),
    mkBtn("reload", "RELOAD", "KeyR", 71, 62, 46),
    mkBtn("pickup", "PICKUP", "KeyF", 45, 30, 44),
    ...DEFAULT_LAYOUT.buttons.filter((b) => !["fire", "aim", "jump", "reload", "pickup"].includes(b.id)).map((b) => ({ ...b, hidden: true })),
  ],
};

const PRESETS: { id: string; label: string; layout: InteractiveLayout }[] = [
  { id: "ff-default", label: "FF Default", layout: DEFAULT_LAYOUT },
  { id: "minimal", label: "Minimal", layout: MINIMAL_LAYOUT },
];

/** Muat layout dari localStorage dengan validasi; fallback FF Default. */
export function loadInteractiveLayout(): InteractiveLayout {
  try {
    const raw = window.localStorage.getItem(LAYOUT_LS_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const p = JSON.parse(raw) as InteractiveLayout;
    if (!p || typeof p !== "object") return DEFAULT_LAYOUT;
    const j = p.joystick;
    const okJoy = j && Number.isFinite(j.xPct) && Number.isFinite(j.yPct) && Number.isFinite(j.size) && Number.isFinite(j.opacity);
    const okBtns = Array.isArray(p.buttons) && p.buttons.every((b) => b && typeof b.id === "string" && typeof b.key === "string");
    if (!okJoy || !okBtns) return DEFAULT_LAYOUT;
    return { joystick: j as JoystickConfig, buttons: p.buttons };
  } catch { return DEFAULT_LAYOUT; }
}

/** Simpan layout ke localStorage (aman failure mode privat). */
export function saveInteractiveLayout(l: InteractiveLayout) {
  try { window.localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(l)); } catch { /* abaikan */ }
}

export interface TouchMapEditorProps {
  open: boolean;
  layout: InteractiveLayout;
  onSave: (layout: InteractiveLayout) => void;
  onCancel: () => void;
  onReset?: () => void;
}

export function TouchMapEditor(props: TouchMapEditorProps) {
  return (
    <AnimatePresence>
      {props.open ? (
        <motion.div
          key="tme-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4"
          role="dialog" aria-modal="true" aria-label="Editor layout kontrol sentuh"
        >
          <EditorPanel {...props} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Panel editor — dimount baru setiap kali dibuka, jadi draft selalu dari layout terkini. */
function EditorPanel({ layout, onSave, onCancel, onReset }: TouchMapEditorProps) {
  const [draft, setDraft] = useState<InteractiveLayout>(() => cloneLayout(layout));
  const [selected, setSelected] = useState<string | null>(null);
  const [preset, setPreset] = useState<string>("custom");
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<{ id: string; xPct: number; yPct: number; size: number } | null>(null);

  const selectedBtn = useMemo(() => draft.buttons.find((b) => b.id === selected) ?? null, [draft.buttons, selected]);

  function toPct(dxPx: number, dyPx: number) {
    const r = stageRef.current?.getBoundingClientRect();
    const w = r?.width || 1;
    const h = r?.height || 1;
    return { dx: (dxPx / w) * 100, dy: (dyPx / h) * 100 };
  }

  function dragJoy(dxPx: number, dyPx: number) {
    const o = dragOrigin.current?.id === "joystick" ? dragOrigin.current : null;
    if (!o) { dragOrigin.current = { id: "joystick", xPct: draft.joystick.xPct, yPct: draft.joystick.yPct, size: draft.joystick.size }; return; }
    const { dx, dy } = toPct(dxPx, dyPx);
    setDraft((d) => ({
      ...d,
      joystick: { ...d.joystick, xPct: clamp(o.xPct + dx, 2, 98), yPct: clamp(o.yPct + dy, 2, 98) },
    }));
  }

  function dragBtn(id: string, dxPx: number, dyPx: number) {
    const cur = draft.buttons.find((b) => b.id === id);
    if (!cur) return;
    const o = dragOrigin.current?.id === id ? dragOrigin.current : null;
    if (!o) { dragOrigin.current = { id, xPct: cur.xPct, yPct: cur.yPct, size: cur.size }; return; }
    const { dx, dy } = toPct(dxPx, dyPx);
    setDraft((d) => ({
      ...d,
      buttons: d.buttons.map((b) => (b.id === id ? { ...b, xPct: clamp(o.xPct + dx, 2, 98), yPct: clamp(o.yPct + dy, 2, 98) } : b)),
    }));
  }

  function resizeBtn(id: string, deltaPx: number) {
    setDraft((d) => ({
      ...d,
      buttons: d.buttons.map((b) => (b.id === id ? { ...b, size: clamp(b.size + deltaPx, 44, 120) } : b)),
    }));
  }

  function patchBtn(id: string, patch: Partial<ActionButtonItem>) {
    setDraft((d) => ({ ...d, buttons: d.buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="bo-card-lg fs-cut flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden"
    >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-fs-edge bg-fs-head px-4 py-3">
              <p className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-[0.18em] text-fs-gold">
                <Gamepad2 className="h-4 w-4 text-fs-fire" /> Editor Layout Kontrol
              </p>
              <button onClick={onCancel} className="flex h-8 w-8 items-center justify-center border border-fs-edge text-fs-muted hover:text-fs-err" aria-label="Tutup editor">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {/* Preset */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fs-muted">Preset:</span>
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setDraft(cloneLayout(p.layout)); setPreset(p.id); }}
                    className={cn("bo-btn !px-3 !py-1.5 !text-[11px]", preset === p.id && "border-fs-fire text-fs-fire")}
                  >
                    {p.label}
                  </button>
                ))}
                {preset === "custom" ? <span className="bo-badge border-fs-cyan/50 text-fs-cyan">Custom</span> : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
                {/* Preview stage 16:9 */}
                <div>
                  <div
                    ref={stageRef}
                    className="bo-grid-bg fs-cut-sm relative aspect-video w-full touch-none select-none overflow-hidden border border-fs-edge-strong bg-fs-bg"
                    onPointerDown={() => setSelected(null)}
                  >
                    <VirtualJoystick
                      size={draft.joystick.size}
                      opacity={Math.max(0.35, draft.joystick.opacity)}
                      label="MOVE"
                      editable
                      disabled
                      position={{ left: `${draft.joystick.xPct}%`, top: `${draft.joystick.yPct}%` }}
                      onEditDrag={dragJoy}
                      onEditResize={(delta) => setDraft((d) => ({ ...d, joystick: { ...d.joystick, size: clamp(d.joystick.size + delta, 80, 220) } }))}
                    />
                    <ActionButtons
                      buttons={draft.buttons}
                      editable
                      onDown={() => undefined}
                      onUp={() => undefined}
                      onEditButton={(id) => setSelected(id === selected ? null : id)}
                      onEditDrag={dragBtn}
                      onEditResize={resizeBtn}
                    />
                    <span className="pointer-events-none absolute left-2 top-2 text-[9px] font-black uppercase tracking-[0.24em] text-fs-muted/70">
                      Preview 16:9 — tarik elemen untuk memindahkan
                    </span>
                  </div>

                  {/* Joystick inspector */}
                  <div className="mt-3 border border-fs-edge bg-fs-panel p-3">
                    <p className="font-display text-xs font-black uppercase tracking-[0.18em] text-fs-cyan">Joystick Gerak</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-fs-muted">
                      <label className="flex items-center justify-between gap-2">X %
                        <input type="number" min={2} max={98} value={Math.round(draft.joystick.xPct)}
                          onChange={(e) => setDraft((d) => ({ ...d, joystick: { ...d.joystick, xPct: clamp(Number(e.target.value) || 0, 2, 98) } }))}
                          className="bo-input !h-7 w-16 !px-1 text-right" />
                      </label>
                      <label className="flex items-center justify-between gap-2">Y %
                        <input type="number" min={2} max={98} value={Math.round(draft.joystick.yPct)}
                          onChange={(e) => setDraft((d) => ({ ...d, joystick: { ...d.joystick, yPct: clamp(Number(e.target.value) || 0, 2, 98) } }))}
                          className="bo-input !h-7 w-16 !px-1 text-right" />
                      </label>
                    </div>
                    <SliderRow label={`Ukuran: ${Math.round(draft.joystick.size)}px`} min={80} max={220} step={2}
                      value={draft.joystick.size}
                      onChange={(v) => setDraft((d) => ({ ...d, joystick: { ...d.joystick, size: v } }))} />
                    <SliderRow label={`Opasitas: ${Math.round(draft.joystick.opacity * 100)}%`} min={20} max={100} step={5}
                      value={Math.round(draft.joystick.opacity * 100)}
                      onChange={(v) => setDraft((d) => ({ ...d, joystick: { ...d.joystick, opacity: v / 100 } }))} />
                  </div>
                </div>

                {/* Button inspector */}
                <div className="min-w-0">
                  {selectedBtn ? (
                    <div className="mb-3 border border-fs-cyan/40 bg-fs-panel p-3">
                      <p className="font-display text-xs font-black uppercase tracking-[0.18em] text-fs-cyan">
                        Tombol: {selectedBtn.label}
                      </p>
                      <label className="mt-2 block text-[10px] font-black uppercase tracking-[0.18em] text-fs-muted">Label</label>
                      <input className="bo-input mt-1 !h-8" value={selectedBtn.label} maxLength={10}
                        onChange={(e) => patchBtn(selectedBtn.id, { label: e.target.value.toUpperCase() })} />
                      <label className="mt-2 block text-[10px] font-black uppercase tracking-[0.18em] text-fs-muted">Key Mapping (Agent)</label>
                      <select className="bo-input mt-1 !h-8 font-mono" value={selectedBtn.key}
                        onChange={(e) => patchBtn(selectedBtn.id, { key: e.target.value })}>
                        {ACTION_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <div className="mt-2">
                        <SliderRow label={`Ukuran: ${Math.round(selectedBtn.size)}px`} min={44} max={120} step={2}
                          value={selectedBtn.size}
                          onChange={(v) => patchBtn(selectedBtn.id, { size: v })} />
                        <SliderRow label={`Opasitas: ${Math.round(selectedBtn.opacity * 100)}%`} min={20} max={100} step={5}
                          value={Math.round(selectedBtn.opacity * 100)}
                          onChange={(v) => patchBtn(selectedBtn.id, { opacity: v / 100 })} />
                      </div>
                      <button
                        onClick={() => patchBtn(selectedBtn.id, { hidden: !selectedBtn.hidden })}
                        className={cn("bo-btn mt-2 w-full !py-1.5 !text-[11px]", selectedBtn.hidden ? "bo-btn-cyan" : "bo-btn-white")}
                      >
                        {selectedBtn.hidden ? <><Eye className="h-3.5 w-3.5" /> Tampilkan</> : <><EyeOff className="h-3.5 w-3.5" /> Sembunyikan</>}
                      </button>
                    </div>
                  ) : (
                    <p className="mb-3 border border-fs-edge bg-fs-panel px-3 py-2 text-[11px] font-semibold text-fs-muted">
                      Ketuk tombol pada preview untuk mengedit label, key, ukuran, dan opasitas.
                    </p>
                  )}

                  <div className="thin-scroll max-h-64 overflow-y-auto border border-fs-edge">
                    {draft.buttons.map((b, i) => (
                      <button
                        key={b.id}
                        onClick={() => setSelected(b.id === selected ? null : b.id)}
                        className={cn(
                          "flex w-full items-center gap-2 border-b border-fs-edge/60 px-3 py-2 text-left text-[11px] font-bold transition",
                          b.id === selected ? "bg-fs-fire/15 text-fs-text" : "text-fs-muted hover:bg-white/[0.04]",
                        )}
                      >
                        <span className="w-5 text-fs-muted/60">{i + 1}</span>
                        <span className="w-20 truncate text-fs-text">{b.label}</span>
                        <span className="w-24 truncate font-mono text-[10px] text-fs-cyan">{b.key}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {b.hidden ? <EyeOff className="h-3.5 w-3.5 text-fs-muted" /> : <Eye className="h-3.5 w-3.5 text-fs-ok" />}
                          {b.id === selected ? <span className="bo-badge border-fs-fire text-fs-fire">EDIT</span> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[10px] font-semibold leading-relaxed text-fs-muted/80">
                Posisi disimpan dalam persen area video; ukuran dalam piksel layar nyata. Layout tersimpan
                hanya di perangkat ini (localStorage) — tidak dikirim ke server.
              </p>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-fs-edge bg-fs-head px-4 py-3">
              {onReset ? (
                <button onClick={() => { onReset(); }} className="bo-btn bo-btn-white mr-auto">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset Default
                </button>
              ) : null}
              <button onClick={onCancel} className="bo-btn bo-btn-black">Batal</button>
              <button
                onClick={() => { setPreset("custom"); onSave(draft); }}
                className="bo-btn bo-btn-primary"
              >
                Simpan Layout
              </button>
            </div>
    </motion.div>
  );
}

function SliderRow({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="mt-2 block">
      <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-fs-muted">
        {label}
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-fs-fire"
        aria-label={label}
      />
    </label>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
}

function cloneLayout(l: InteractiveLayout): InteractiveLayout {
  return {
    joystick: { ...l.joystick },
    buttons: l.buttons.map((b) => ({ ...b })),
  };
}

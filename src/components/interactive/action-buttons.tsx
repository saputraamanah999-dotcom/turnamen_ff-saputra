"use client";
// ============================================================
// STIKAR ESPORTS — Tombol Aksi Interaktif (Interactive Stream)
// Grid absolut tombol aksi game: pointerdown → onDown(key),
// pointerup/cancel/leave → onUp(key) (mendukung HOLD).
// Multi-touch aman: satu pointerId hanya mengendalikan tombolnya.
// ============================================================

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ActionButtonItem {
  id: string;
  label: string;
  /** Key agent target, mis. "MouseLeft", "Space", "KeyR". */
  key: string;
  size: number;
  opacity: number;
  xPct: number;
  yPct: number;
  hidden?: boolean;
}

export interface ActionButtonsProps {
  buttons: ActionButtonItem[];
  onDown: (key: string) => void;
  onUp: (key: string) => void;
  /** Mode editor: drag memindahkan tombol, tap memilih (onEditButton). */
  editable?: boolean;
  onEditButton?: (id: string) => void;
  onEditDrag?: (id: string, dxPx: number, dyPx: number) => void;
  onEditResize?: (id: string, deltaPx: number) => void;
  disabled?: boolean;
}

const DRAG_THRESHOLD = 4;

export function ActionButtons({
  buttons,
  onDown,
  onUp,
  editable = false,
  onEditButton,
  onEditDrag,
  onEditResize,
  disabled = false,
}: ActionButtonsProps) {
  // Satu pointerId aktif per tombol + posisi awal untuk deteksi drag.
  const active = useRef<Map<string, { pid: number; moved: boolean; start: { x: number; y: number } }>>(new Map());
  const [pressed, setPressed] = useState<Set<string>>(new Set());

  const release = useCallback(
    (id: string, item: ActionButtonItem) => {
      active.current.delete(id);
      setPressed((s) => {
        if (!s.has(id)) return s;
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      onUp(item.key);
    },
    [onUp],
  );

  const handleDown = useCallback(
    (item: ActionButtonItem, e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (active.current.has(item.id)) return; // multi-touch aman
      active.current.set(item.id, { pid: e.pointerId, moved: false, start: { x: e.clientX, y: e.clientY } });
      e.currentTarget.setPointerCapture(e.pointerId);
      if (!editable && !disabled) {
        setPressed((s) => new Set(s).add(item.id));
        onDown(item.key);
      }
    },
    [editable, disabled, onDown],
  );

  const handleMove = useCallback(
    (item: ActionButtonItem, e: React.PointerEvent<HTMLButtonElement>) => {
      const a = active.current.get(item.id);
      if (!a || a.pid !== e.pointerId) return;
      if (editable) {
        const dx = e.clientX - a.start.x;
        const dy = e.clientY - a.start.y;
        if (!a.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        a.moved = true;
        onEditDrag?.(item.id, dx, dy);
        return;
      }
      // HOLD: jika pointer keluar jauh dari tombol, lepas input.
      const r = e.currentTarget.getBoundingClientRect();
      const out = e.clientX < r.left - 24 || e.clientX > r.right + 24 || e.clientY < r.top - 24 || e.clientY > r.bottom + 24;
      if (out && !disabled) release(item.id, item);
    },
    [editable, disabled, release, onEditDrag],
  );

  const handleUp = useCallback(
    (item: ActionButtonItem, e: React.PointerEvent<HTMLButtonElement>) => {
      const a = active.current.get(item.id);
      if (!a || a.pid !== e.pointerId) return;
      if (editable) {
        active.current.delete(item.id);
        if (!a.moved) onEditButton?.(item.id);
        return;
      }
      release(item.id, item);
    },
    [editable, onEditButton, release],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="action-buttons">
      {buttons
        .filter((b) => !b.hidden)
        .map((b) => {
          const size = Math.max(44, Math.round(b.size));
          const isPressed = pressed.has(b.id) && !disabled;
          return (
            <motion.button
              key={b.id}
              type="button"
              whileTap={!editable && !disabled ? { scale: 0.92 } : undefined}
              aria-label={`${b.label} (key ${b.key})`}
              disabled={disabled && !editable}
              onPointerDown={(e) => handleDown(b, e)}
              onPointerMove={(e) => handleMove(b, e)}
              onPointerUp={(e) => handleUp(b, e)}
              onPointerCancel={(e) => handleUp(b, e)}
              onPointerLeave={(e) => { if (!editable && !disabled) handleMove(b, e); }}
              className={cn(
                "pointer-events-auto absolute flex touch-none select-none items-center justify-center rounded-full border-2 font-display font-black uppercase tracking-wider",
                isPressed
                  ? "border-fs-cyan bg-fs-cyan/35 text-white shadow-[0_0_22px_rgba(53,214,255,0.7)]"
                  : editable
                    ? "border-dashed border-fs-gold/70 bg-black/40 text-fs-gold"
                    : "border-white/35 bg-black/35 text-white/90",
                disabled && !editable && "opacity-60",
              )}
              style={{
                left: `${b.xPct}%`,
                top: `${b.yPct}%`,
                width: size,
                height: size,
                opacity: b.opacity,
                transform: "translate(-50%, -50%)",
                fontSize: Math.max(9, Math.min(13, size / 4.6)),
              }}
            >
              {b.label}
              {editable ? (
                <span
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    active.current.set(`${b.id}:rs`, { pid: e.pointerId, moved: true, start: { x: e.clientX, y: e.clientY } });
                  }}
                  onPointerMove={(e) => {
                    const a = active.current.get(`${b.id}:rs`);
                    if (!a || a.pid !== e.pointerId) return;
                    onEditResize?.(b.id, e.clientX - a.start.x);
                    a.start = { x: e.clientX, y: e.clientY };
                  }}
                  onPointerUp={() => active.current.delete(`${b.id}:rs`)}
                  className="absolute -bottom-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-fs-gold bg-fs-gold/40 text-[9px] text-fs-ink"
                  aria-label={`Ubah ukuran ${b.label}`}
                >
                  ↘
                </span>
              ) : null}
            </motion.button>
          );
        })}
    </div>
  );
}

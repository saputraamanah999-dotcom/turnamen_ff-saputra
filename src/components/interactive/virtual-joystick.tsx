"use client";
// STIKAR ESPORTS — Virtual Joystick transparan (Interactive Stream).
// Pointer events (pointerId capture): base ring + knob, memancarkan
// onMove(x,y,active) dengan x,y ∈ -1..1 (y+ = bawah). Multi-touch aman.

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface VirtualJoystickProps {
  size: number;            // diameter px (min 72)
  opacity: number;         // 0–1
  label?: string;
  position: { left?: string; top?: string; right?: string; bottom?: string }; // pusat joystick
  editable?: boolean;      // mode editor: handle pindah/ubah ukuran, input game mati
  onEditDrag?: (dxPx: number, dyPx: number) => void;
  onEditResize?: (deltaPx: number) => void;
  disabled?: boolean;
  onMove?: (x: number, y: number, active: boolean) => void;
}

export function VirtualJoystick({
  size,
  opacity,
  label,
  position,
  editable = false,
  onEditDrag,
  onEditResize,
  disabled = false,
  onMove,
}: VirtualJoystickProps) {
  const d = Math.max(72, Math.round(size));
  const baseRef = useRef<HTMLDivElement | null>(null);
  const pid = useRef<number | null>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [engaged, setEngaged] = useState(false);

  function emitFromCenter(cx: number, cy: number) {
    const el = baseRef.current;
    if (!el || !onMove) return;
    const r = el.getBoundingClientRect();
    const max = d / 2 - Math.max(14, d * 0.11);
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    setKnob({ x: dx, y: dy });
    onMove(clamp1(dx / max), clamp1(dy / max), true);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (pid.current !== null) return; // multi-touch aman
    const el = baseRef.current;
    if (!el) return;
    if (editable) {
      pid.current = e.pointerId;
      lastPt.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      return;
    }
    if (disabled) return;
    pid.current = e.pointerId;
    el.setPointerCapture(e.pointerId);
    setEngaged(true);
    emitFromCenter(e.clientX, e.clientY);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pid.current !== e.pointerId) return;
    if (editable) {
      const lp = lastPt.current;
      if (lp) onEditDrag?.(e.clientX - lp.x, e.clientY - lp.y);
      lastPt.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (disabled) return;
    emitFromCenter(e.clientX, e.clientY);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (pid.current !== e.pointerId) return;
    if (editable) { pid.current = null; lastPt.current = null; return; }
    pid.current = null;
    setKnob({ x: 0, y: 0 });
    setEngaged(false);
    onMove?.(0, 0, false);
  }
  const live = engaged && !disabled;
  return (
    <div
      className="pointer-events-auto absolute touch-none select-none"
      style={{ ...position, width: d, height: d, transform: "translate(-50%, -50%)", opacity }}
      data-testid="virtual-joystick"
    >
      {/* Handle resize (mode editor) */}
      {editable ? (
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            lastPt.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            const lp = lastPt.current;
            if (!lp) return;
            onEditResize?.(e.clientX - lp.x);
            lastPt.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => { lastPt.current = null; }}
          className="absolute -bottom-2 -right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-fs-cyan bg-fs-cyan/30 text-[9px] font-black text-fs-cyan"
          aria-label="Ubah ukuran joystick"
        >
          ↘
        </button>
      ) : null}
      <div
        ref={baseRef}
        role="application"
        aria-label={label ?? "Joystick virtual"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "relative flex h-full w-full items-center justify-center rounded-full border-2",
          live
            ? "border-fs-cyan bg-black/25 shadow-[0_0_26px_rgba(53,214,255,0.5)]"
            : editable
              ? "border-dashed border-fs-cyan/60 bg-black/20"
              : "border-white/30 bg-black/20",
        )}
      >
        <span className="absolute inset-[18%] rounded-full border border-white/15" aria-hidden />
        {label && !editable ? (
          <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 font-display text-[9px] font-black uppercase tracking-[0.2em] text-white/60">
            {label}
          </span>
        ) : null}
        <div
          className={cn(
            "pointer-events-none absolute h-[42%] w-[42%] rounded-full border border-white/50 bg-white/25 backdrop-blur-[1px] transition-[box-shadow] duration-150",
            live && "border-fs-cyan/80 bg-fs-cyan/40 shadow-[0_0_18px_rgba(53,214,255,0.65)]",
          )}
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>
    </div>
  );
}

function clamp1(v: number) { return Math.min(1, Math.max(-1, Number.isFinite(v) ? v : 0)); }

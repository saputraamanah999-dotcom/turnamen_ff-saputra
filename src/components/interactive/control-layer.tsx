"use client";
// ============================================================
// STIKAR ESPORTS — Control Layer (Interactive Stream)
// Lapisan overlay di atas video: joystick + tombol aksi + badge
// status + kontrol fullscreen/hide/editor + klaim controller.
// Touch passthrough (koordinat ternormalisasi) hanya saat menjadi
// controller; interaksi elemen overlay TIDAK diteruskan ke game.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Eye, EyeOff, Gamepad2, Maximize, Minimize, Siren, SlidersHorizontal,
  Wifi, WifiOff, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelStatus } from "@/services/agent/client";
import { VirtualJoystick } from "./virtual-joystick";
import { ActionButtons } from "./action-buttons";
import { DEFAULT_LAYOUT, TouchMapEditor, type InteractiveLayout } from "./touch-map-editor";

export interface ControlLayerProps {
  /** Konten video (LiveVideoPlayer) di bawah overlay. */
  children: React.ReactNode;
  /** Opsional: terima elemen wrapper (mis. untuk fullscreen dari header halaman). */
  onWrapperEl?: (el: HTMLDivElement | null) => void;
  controller: boolean;
  channelStatus: ChannelStatus;
  latencyMs: number | null;
  viewers: number | null;
  inputEnabled: boolean;
  adminRole: boolean;
  layout: InteractiveLayout;
  onLayoutChange: (l: InteractiveLayout) => void;
  onJoystickMove: (x: number, y: number, active: boolean) => void;
  onTouchDown: (id: number, x: number, y: number) => void;
  onTouchMove: (id: number, x: number, y: number) => void;
  onTouchUp: (id: number, x: number, y: number) => void;
  onButtonDown: (key: string) => void;
  onButtonUp: (key: string) => void;
  onClaim: () => void;
  onRelease: () => void;
  onEstop?: () => void;
  editorOpen: boolean;
  onEditorOpenChange: (v: boolean) => void;
}

export function ControlLayer(p: ControlLayerProps) {
  const [hidden, setHidden] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const touchIds = useRef<Set<number>>(new Set());
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fn = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);

  const passthroughActive = p.controller && p.inputEnabled && !p.editorOpen && !hidden;

  const norm = useCallback((e: React.PointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!passthroughActive) return;
    if ((e.target as HTMLElement | null)?.closest("button")) return; // tombol player → bukan touch game
    const c = norm(e);
    if (!c) return;
    touchIds.current.add(e.pointerId);
    p.onTouchDown(e.pointerId, c.x, c.y);
  }, [passthroughActive, norm, p]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!passthroughActive || !touchIds.current.has(e.pointerId)) return;
    const c = norm(e);
    if (c) p.onTouchMove(e.pointerId, c.x, c.y);
  }, [passthroughActive, norm, p]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!touchIds.current.delete(e.pointerId)) return;
    const c = norm(e);
    p.onTouchUp(e.pointerId, c?.x ?? 0, c?.y ?? 0);
  }, [norm, p]);

  function toggleFullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => undefined);
  }


  const controlsLive = !hidden && !p.editorOpen;
  const connChip =
    p.channelStatus === "open"
      ? { icon: Wifi, text: "AGENT TERHUBUNG", cls: "border-fs-ok/60 text-fs-ok" }
      : p.channelStatus === "connecting"
        ? { icon: Wifi, text: "MENYAMBUNG…", cls: "border-fs-gold/60 text-fs-gold fs-connecting" }
        : { icon: WifiOff, text: "AGENT OFFLINE", cls: "border-fs-err/60 text-fs-err" };

  return (
    <>
      <div
        ref={(el) => {
          wrapRef.current = el;
          p.onWrapperEl?.(el);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn("relative h-full w-full overflow-hidden bg-black", !p.editorOpen && "touch-none select-none")}
      >
        {p.children}

        {/* ---- Overlay kontrol (bisa disembunyikan) ---- */}
        <AnimatePresence>
          {controlsLive ? (
            <motion.div
              key="ctl"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none absolute inset-0 z-10"
            >
              <div className="pointer-events-auto absolute inset-0" onPointerDown={(e) => e.stopPropagation()}>
                <VirtualJoystick
                  size={p.layout.joystick.size}
                  opacity={p.layout.joystick.opacity}
                  label="MOVE"
                  position={{ left: `${p.layout.joystick.xPct}%`, top: `${p.layout.joystick.yPct}%` }}
                  disabled={!p.controller || !p.inputEnabled}
                  onMove={p.onJoystickMove}
                />
                <ActionButtons
                  buttons={p.layout.buttons}
                  disabled={!p.controller || !p.inputEnabled}
                  onDown={p.onButtonDown}
                  onUp={p.onButtonUp}
                />
              </div>

              {/* Badge status kanan-atas */}
              <div className="pointer-events-auto absolute right-2 top-2 z-20 flex max-w-[70%] flex-wrap justify-end gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
                <StatusChip className={connChip.cls}><connChip.icon className="h-3 w-3" />{connChip.text}</StatusChip>
                {p.latencyMs !== null ? (
                  <StatusChip className="border-fs-edge-strong text-fs-text"><Zap className="h-3 w-3 text-fs-gold" />{p.latencyMs} MS</StatusChip>
                ) : null}
                <StatusChip className={p.controller ? "border-fs-ok/70 bg-fs-ok/10 text-fs-ok" : "border-fs-edge-strong text-fs-muted"}>
                  <Gamepad2 className="h-3 w-3" />{p.controller ? "CONTROLLER: KAMU" : "WATCH ONLY"}
                </StatusChip>
                {p.viewers !== null ? (
                  <StatusChip className="border-fs-edge-strong text-fs-muted">{p.viewers} VIEWER</StatusChip>
                ) : null}
              </div>

              {/* Bar kontrol kiri-atas */}
              <div className="pointer-events-auto absolute left-2 top-2 z-20 flex flex-wrap gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
                <IconBtn label={hidden ? "Tampilkan kontrol" : "Sembunyikan kontrol"} onClick={() => setHidden(true)} hidden={hidden}>
                  <Eye className="h-4 w-4" />
                </IconBtn>
                <IconBtn label={isFs ? "Keluar layar penuh" : "Layar penuh"} onClick={toggleFullscreen}>
                  {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </IconBtn>
                <IconBtn label="Editor layout kontrol" onClick={() => p.onEditorOpenChange(true)}>
                  <SlidersHorizontal className="h-4 w-4" />
                </IconBtn>
                {p.controller ? (
                  <IconBtn label="Lepas kontrol" tone="gold" onClick={p.onRelease}>
                    <Gamepad2 className="h-4 w-4" />
                  </IconBtn>
                ) : null}
                {p.adminRole && p.onEstop ? (
                  <IconBtn label="Emergency stop (hentikan semua input)" tone="danger" onClick={p.onEstop}>
                    <Siren className="h-4 w-4" />
                  </IconBtn>
                ) : null}
              </div>

              {/* Notifikasi input dimatikan operator */}
              {!p.inputEnabled ? (
                <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 -translate-x-1/2">
                  <span className="bo-badge border-fs-gold/60 bg-black/70 px-3 py-1.5 text-fs-gold">
                    Operator menonaktifkan input — mode menonton
                  </span>
                </div>
              ) : !p.controller ? (
                <div className="pointer-events-auto absolute bottom-14 left-1/2 z-20 -translate-x-1/2" onPointerDown={(e) => e.stopPropagation()}>
                  <button onClick={p.onClaim} className="bo-btn bo-btn-cyan !px-5 !py-3 shadow-[0_0_24px_rgba(53,214,255,0.35)]">
                    <Gamepad2 className="h-4 w-4" /> Ambil Kontrol
                  </button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Tombol kecil saat kontrol disembunyikan */}
        {hidden && !p.editorOpen ? (
          <button
            onClick={() => setHidden(false)}
            className="absolute left-2 top-2 z-30 flex h-10 w-10 items-center justify-center border border-fs-edge bg-black/60 text-white/80 hover:text-fs-cyan"
            aria-label="Tampilkan kontrol sentuh"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <TouchMapEditor
        open={p.editorOpen}
        layout={p.layout}
        onSave={(l) => { p.onLayoutChange(l); p.onEditorOpenChange(false); }}
        onCancel={() => p.onEditorOpenChange(false)}
        onReset={() => p.onLayoutChange(DEFAULT_LAYOUT)}
      />
    </>
  );
}

function StatusChip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className={cn(
        "inline-flex items-center gap-1.5 border bg-black/65 px-2 py-1 font-display text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </motion.span>
  );
}

function IconBtn({ label, onClick, tone, hidden, children }: {
  label: string; onClick: () => void; tone?: "gold" | "danger"; hidden?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-9 min-w-9 items-center justify-center border px-2 backdrop-blur-sm transition",
        hidden ? "bg-black/70 text-white/50" :
          tone === "danger" ? "border-fs-err/70 bg-fs-err/15 text-fs-err hover:bg-fs-err/30" :
            tone === "gold" ? "border-fs-gold/70 bg-fs-gold/15 text-fs-gold hover:bg-fs-gold/30" :
              "border-white/25 bg-black/55 text-white/85 hover:border-fs-cyan hover:text-fs-cyan",
      )}
    >
      {children}
    </button>
  );
}

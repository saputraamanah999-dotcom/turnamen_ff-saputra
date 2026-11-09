"use client";
// ============================================================
// /admin/overlay — OVERLAY MANAGER (PHASE 2 §13)
// Studio grafis turnamen: 23 layer, preset siaran, konfigurasi
// per-scene, preview editor 16:9, dan PUSH TO BROADCAST.
// Alur: atur (EDIT) → simpan draft (PREVIEW) → PUSH → onAir
// dibaca realtime oleh /overlay/*, TV Display, dan /live.
// RESTORE PREVIOUS mengembalikan konfigurasi on-air sebelumnya.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  Check, ChevronDown, Copy, ExternalLink, Eye, Layers, MonitorPlay, RefreshCw, RotateCcw, Send, Sliders, Undo2, Zap,
} from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { useActiveTournament, useDoc } from "@/services/firestore/hooks";
import { saveOverlayConfig, publishBroadcastEvent } from "@/services/scoring/publish";
import { useAdminSession } from "@/services/auth/admin";
import { useToast } from "@/hooks/use-toast";
import {
  OVERLAY_LAYERS, OVERLAY_LAYOUTS, OVERLAY_PRESETS, OVERLAY_SCENES,
  type OverlayLayout,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { OverlayConfigDoc, OverlayLayerState, OverlaySceneConfig } from "@/lib/types";

type Mode = "preview" | "edit" | "onair";

function presetToConfig(presetId: string): OverlaySceneConfig {
  const preset = OVERLAY_PRESETS.find((p) => p.id === presetId) ?? OVERLAY_PRESETS[0];
  const layers: Record<string, OverlayLayerState> = {};
  for (const def of OVERLAY_LAYERS) {
    layers[def.id] = {
      enabled: preset.layers.includes(def.id),
      opacity: 1,
      scale: 1,
      position: def.pos,
      animation: "fade",
      duration: 0,
      z: def.group === "screen" ? 90 : def.group === "result" ? 80 : 10,
    };
  }
  return { preset: preset.id, layers, note: preset.note };
}

export default function AdminOverlayPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const session = useAdminSession();
  const { toast } = useToast();

  const doc = useDoc<OverlayConfigDoc>(tid ? `overlayConfigs/${tid}` : null, { disableFallback: true });
  const [mode, setMode] = useState<Mode>("edit");
  const [scene, setScene] = useState(OVERLAY_SCENES[0].id);
  const [draft, setDraft] = useState<OverlaySceneConfig>(() => presetToConfig(OVERLAY_SCENES[0].preset));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastPushedAt, setLastPushedAt] = useState<number | null>(null);
  // Preview test: embed halaman overlay ASLI (yang dilihat OBS/TV) + uji pipeline realtime.
  const [origin, setOrigin] = useState("");
  const [previewLayout, setPreviewLayout] = useState<OverlayLayout>("compact");
  const [previewKey, setPreviewKey] = useState(0);
  useEffect(() => setOrigin(window.location.origin), []);

  // Muat konfigurasi per-scene dari Firestore bila ada.
  useEffect(() => {
    const d = doc.data;
    if (!d) return;
    const s = d.scenes?.[scene];
    if (s) setDraft(s);
    else setDraft(presetToConfig(OVERLAY_SCENES.find((x) => x.id === scene)?.preset ?? "full-broadcast"));
    if (d.pushedAt) setLastPushedAt(d.pushedAt ?? null);
  }, [doc.data?.tournamentId, doc.data?.updatedAt, scene]);

  const onAir = doc.data?.onAir ?? null;
  const enabledCount = useMemo(
    () => Object.values(draft.layers).filter((l) => l.enabled).length,
    [draft],
  );

  function setLayer(id: string, patch: Partial<OverlayLayerState>) {
    setDraft((d) => ({
      ...d,
      layers: { ...d.layers, [id]: { ...d.layers[id], ...patch } },
    }));
  }

  function applyPreset(presetId: string) {
    setDraft(presetToConfig(presetId));
    toast({ title: `Preset ${presetId.toUpperCase()} dimuat — tekan PUSH untuk tayang` });
  }

  async function saveScene() {
    if (!tid) return;
    setBusy(true);
    try {
      await saveOverlayConfig(tid, {
        draft,
        scenes: { ...(doc.data?.scenes ?? {}), [scene]: draft },
      });
      toast({ title: `Konfigurasi scene "${OVERLAY_SCENES.find((s) => s.id === scene)?.label}" tersimpan (draft)` });
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: e instanceof Error ? e.message : String(e), variant: "destructive" as never });
    } finally {
      setBusy(false);
    }
  }

  async function pushToBroadcast() {
    if (!tid) return;
    setBusy(true);
    try {
      const prev = onAir;
      await saveOverlayConfig(tid, {
        draft,
        onAir: draft,
        scenes: { ...(doc.data?.scenes ?? {}), [scene]: draft, __prev_onair: prev ?? draft },
        pushedAt: Date.now(),
      });
      await publishBroadcastEvent(tid, "OVERLAY_PUSHED", { message: OVERLAY_PRESETS.find((p) => p.id === draft.preset)?.name });
      setLastPushedAt(Date.now());
      setMode("onair");
      toast({ title: "PUSH TO BROADCAST berhasil", description: "Overlay baru tayang di TV, /live, dan OBS Browser Source." });
    } catch (e) {
      toast({ title: "Push gagal", description: e instanceof Error ? e.message : String(e), variant: "destructive" as never });
    } finally {
      setBusy(false);
    }
  }

  async function cancelDraft() {
    if (!onAir) {
      toast({ title: "Tidak ada konfigurasi on-air untuk dikembalikan" });
      return;
    }
    setDraft(onAir);
    setMode("preview");
    toast({ title: "Draft dibatalkan — kembali ke konfigurasi ON AIR" });
  }

  async function restorePrevious() {
    if (!tid) return;
    const prev = doc.data?.scenes?.__prev_onair;
    if (!prev) {
      toast({ title: "Belum ada konfigurasi sebelumnya yang tersimpan" });
      return;
    }
    setBusy(true);
    try {
      await saveOverlayConfig(tid, { onAir: prev, pushedAt: Date.now() });
      await publishBroadcastEvent(tid, "OVERLAY_PUSHED", { message: "RESTORE PREVIOUS" });
      toast({ title: "Konfigurasi on-air sebelumnya dikembalikan" });
    } finally {
      setBusy(false);
    }
  }

  async function sendTestEvent() {
    if (!tid) return;
    setBusy(true);
    try {
      await publishBroadcastEvent(tid, "MATCH_INFO_UPDATED", {
        message: "UJI COBA — pipeline realtime berjalan (dari Preview Test)",
        matchNumber: null,
        map: null,
      });
      setPreviewKey((k) => k + 1);
      toast({ title: "Event uji terkirim", description: "Cek TV Display & /live — animasi notice muncul realtime." });
    } catch (e) {
      toast({ title: "Uji gagal", description: e instanceof Error ? e.message : String(e), variant: "destructive" as never });
    } finally {
      setBusy(false);
    }
  }

  const groups = ["brand", "match", "data", "broadcast", "result", "screen"] as const;
  const GROUP_LABEL: Record<string, string> = {
    brand: "Branding", match: "Match Info", data: "Data Panel", broadcast: "Broadcast", result: "Result", screen: "Full Screen",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Overlay Manager</h1>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-fs-muted">
            Studio grafis siaran: atur layer, pilih preset & scene, lihat preview, lalu PUSH TO BROADCAST.
            Overlay tidak muncul live sebelum admin menekan PUSH.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BoBadge className={onAir ? "bg-fs-err text-white" : "bg-fs-head text-fs-muted"}>
            {onAir ? "ON AIR AKTIF" : "TIDAK ON AIR"}
          </BoBadge>
          {lastPushedAt ? (
            <span className="text-[11px] font-bold text-fs-muted">push terakhir {new Date(lastPushedAt).toLocaleTimeString("id-ID")}</span>
          ) : null}
        </div>
      </div>

      {/* Mode + scene + preset */}
      <BoCard className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex border border-fs-edge">
            {(["edit", "preview", "onair"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
                  mode === m ? "bg-fs-fire text-white" : "text-fs-muted hover:text-fs-text",
                )}
              >
                {m === "edit" ? "Edit" : m === "preview" ? "Preview" : "On Air"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fs-muted">
            Scene
            <select
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              className="bo-input !h-9 !w-56 !py-0"
            >
              {OVERLAY_SCENES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {OVERLAY_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                title={p.note}
                className={cn(
                  "border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition",
                  draft.preset === p.id ? "border-fs-gold bg-fs-gold/15 text-fs-gold" : "border-fs-edge text-fs-muted hover:border-fs-flame hover:text-fs-text",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] font-semibold text-fs-muted">
          Perubahan preset/scene tidak saling merusak — setiap scene punya konfigurasi sendiri. {enabledCount}/{OVERLAY_LAYERS.length} layer aktif.
        </p>
      </BoCard>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ===== Daftar layer ===== */}
        <BoCard className="p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em]">
            <Layers className="h-4 w-4 text-fs-fire" /> Layers ({OVERLAY_LAYERS.length})
          </h2>
          <div className="thin-scroll mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {groups.map((g) => (
              <div key={g}>
                <p className="pb-1 text-[10px] font-black uppercase tracking-[0.24em] text-fs-muted/70">{GROUP_LABEL[g]}</p>
                <div className="space-y-1">
                  {OVERLAY_LAYERS.filter((l) => l.group === g).map((l) => {
                    const st = draft.layers[l.id];
                    if (!st) return null;
                    const open = expanded === l.id;
                    return (
                      <div key={l.id} className="border border-fs-edge/70 bg-fs-bg/50">
                        <div className="flex items-center gap-2 px-2.5 py-1.5">
                          <button
                            onClick={() => setLayer(l.id, { enabled: !st.enabled })}
                            className={cn(
                              "relative h-5 w-9 shrink-0 border transition",
                              st.enabled ? "border-fs-fire bg-fs-fire/25" : "border-fs-edge bg-fs-head",
                            )}
                            aria-label={`${st.enabled ? "Matikan" : "Aktifkan"} ${l.label}`}
                          >
                            <span className={cn(
                              "absolute top-0.5 h-3.5 w-3.5 transition-all",
                              st.enabled ? "left-[18px] bg-fs-fire" : "left-0.5 bg-fs-muted/50",
                            )} />
                          </button>
                          <span className={cn("min-w-0 flex-1 truncate text-xs font-bold", st.enabled ? "text-fs-text" : "text-fs-muted/60")}>
                            {l.label}
                          </span>
                          <BoBadge className={cn("!text-[9px]", st.enabled ? "bg-fs-fire/15 text-fs-fire" : "")}>
                            {st.enabled ? "ON" : "OFF"}
                          </BoBadge>
                          <button onClick={() => setExpanded(open ? null : l.id)} className="text-fs-muted hover:text-fs-text" aria-label="Pengaturan layer">
                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                          </button>
                        </div>
                        {open ? (
                          <div className="grid grid-cols-2 gap-2 border-t border-fs-edge/70 px-2.5 py-2.5 sm:grid-cols-3">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-fs-muted">
                              Posisi
                              <select
                                value={st.position ?? l.pos}
                                onChange={(e) => setLayer(l.id, { position: e.target.value as OverlayLayerState["position"] })}
                                className="bo-input !mt-1 !h-8 !text-xs"
                              >
                                {["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"].map((p) => (
                                  <option key={p} value={p}>{p.toUpperCase()}</option>
                                ))}
                              </select>
                            </label>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-fs-muted">
                              Opacity {Math.round((st.opacity ?? 1) * 100)}%
                              <input
                                type="range" min={0.2} max={1} step={0.05}
                                value={st.opacity ?? 1}
                                onChange={(e) => setLayer(l.id, { opacity: Number(e.target.value) })}
                                className="mt-1.5 w-full accent-[var(--fs-fire)]"
                              />
                            </label>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-fs-muted">
                              Ukuran {Math.round((st.scale ?? 1) * 100)}%
                              <input
                                type="range" min={0.6} max={1.6} step={0.05}
                                value={st.scale ?? 1}
                                onChange={(e) => setLayer(l.id, { scale: Number(e.target.value) })}
                                className="mt-1.5 w-full accent-[var(--fs-fire)]"
                              />
                            </label>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-fs-muted">
                              Animasi
                              <select
                                value={st.animation ?? "fade"}
                                onChange={(e) => setLayer(l.id, { animation: e.target.value as OverlayLayerState["animation"] })}
                                className="bo-input !mt-1 !h-8 !text-xs"
                              >
                                {["none", "fade", "slide", "rise"].map((a) => <option key={a} value={a}>{a}</option>)}
                              </select>
                            </label>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-fs-muted">
                              Z-Index
                              <input
                                type="number" min={1} max={99}
                                value={st.z ?? 10}
                                onChange={(e) => setLayer(l.id, { z: Number(e.target.value) })}
                                className="bo-input !mt-1 !h-8 !text-xs"
                              />
                            </label>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-fs-muted">
                              Durasi (0 = terus)
                              <input
                                type="number" min={0} max={60}
                                value={st.duration ?? 0}
                                onChange={(e) => setLayer(l.id, { duration: Number(e.target.value) })}
                                className="bo-input !mt-1 !h-8 !text-xs"
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </BoCard>

        {/* ===== Preview editor 16:9 ===== */}
        <BoCard className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em]">
              <Eye className="h-4 w-4 text-fs-cyan" /> Preview Editor 16:9
            </h2>
            <BoBadge className={cn(mode === "onair" && "bg-fs-err text-white", mode === "edit" && "bg-fs-cyan/15 text-fs-cyan")}>
              {mode === "edit" ? "EDIT DRAFT" : mode === "preview" ? "PREVIEW" : "ON AIR"}
            </BoBadge>
          </div>
          <div className="mt-3 flex aspect-video w-full flex-col overflow-hidden border border-fs-edge bg-[#04070B]" style={{ position: "relative" }}>
            {/* Stage mini */}
            <MiniStage config={draft} mode={mode} onAir={onAir} />
          </div>
          <p className="mt-2 text-[11px] font-semibold text-fs-muted">
            Mode {mode.toUpperCase()} — {mode === "onair"
              ? "inilah yang sedang tayang di TV/OBS."
              : "draft lokal; belum tayang sebelum PUSH TO BROADCAST."}
          </p>

          {/* Aksi */}
          <div className="mt-3 flex flex-wrap gap-2">
            <BoButton variant="white" className="!px-3 !py-2 !text-[11px]" onClick={saveScene} disabled={busy}>
              <Sliders className="h-3.5 w-3.5" /> Simpan Draft (Preview)
            </BoButton>
            <BoButton variant="fire" className="!px-4 !py-2 !text-[11px]" onClick={pushToBroadcast} disabled={busy || !tid}>
              <Send className="h-3.5 w-3.5" /> PUSH TO BROADCAST
            </BoButton>
            <BoButton variant="black" className="!px-3 !py-2 !text-[11px]" onClick={cancelDraft}>
              <RotateCcw className="h-3.5 w-3.5" /> Cancel
            </BoButton>
            <BoButton variant="gold" className="!px-3 !py-2 !text-[11px]" onClick={restorePrevious} disabled={busy}>
              <Undo2 className="h-3.5 w-3.5" /> Restore Previous
            </BoButton>
          </div>

          {/* OBS Browser Source URLs */}
          <div className="mt-4 border border-fs-edge bg-fs-bg/60 p-3">
            <p className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wider text-fs-cyan">
              <Copy className="h-3.5 w-3.5" /> OBS Browser Source (1920×1080, transparan)
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {["full", "compact", "top3", "match-info", "lower-third", "announcement", "winner", "starting-soon", "emergency"].map((l) => {
                const url = tid ? `/overlay/${tid}/${l}` : "/overlay/:tid/" + l;
                return (
                  <button
                    key={l}
                    onClick={() => navigator.clipboard?.writeText(typeof window !== "undefined" ? window.location.origin + url : url)}
                    className="flex items-center justify-between border border-fs-edge bg-black px-2.5 py-1.5 text-left font-mono text-[10.5px] text-fs-cyan hover:border-fs-cyan/60"
                    title="Klik untuk salin URL"
                  >
                    <span className="truncate">{url}</span>
                    <Check className="h-3 w-3 opacity-40" />
                  </button>
                );
              })}
            </div>
          </div>
        </BoCard>
      </div>

      {/* ===== PREVIEW TEST — halaman overlay asli + uji pipeline realtime ===== */}
      <BoCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em]">
            <MonitorPlay className="h-4 w-4 text-fs-fire" /> Preview Test — Halaman Overlay Asli
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={previewLayout}
              onChange={(e) => setPreviewLayout(e.target.value as OverlayLayout)}
              className="bo-input !h-9 !w-52 !py-0"
              aria-label="Pilih layout overlay untuk preview"
            >
              {OVERLAY_LAYOUTS.map((l) => (
                <option key={l.value} value={l.value}>{l.label} ({l.value})</option>
              ))}
            </select>
            <BoButton variant="white" className="!px-3 !py-2 !text-[11px]" onClick={() => setPreviewKey((k) => k + 1)} title="Muat ulang preview">
              <RefreshCw className="h-3.5 w-3.5" /> Reload
            </BoButton>
            {tid ? (
              <a
                href={`/overlay/${tid}/${previewLayout}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 border-2 border-fs-edge bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-fs-head transition hover:border-fs-cyan"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Tab Baru
              </a>
            ) : null}
            <BoButton variant="gold" className="!px-3 !py-2 !text-[11px]" onClick={sendTestEvent} disabled={busy || !tid} title="Kirim event broadcast uji — TV & /live harus bereaksi realtime">
              <Zap className="h-3.5 w-3.5" /> Kirim Uji Realtime
            </BoButton>
          </div>
        </div>
        <div className="mt-3 aspect-video w-full overflow-hidden border-2 border-fs-edge bg-[#04070B] fs-onair">
          {tid && origin ? (
            <iframe
              key={`${previewLayout}-${previewKey}`}
              src={`${origin}/overlay/${tid}/${previewLayout}`}
              title={`Preview overlay ${previewLayout}`}
              className="h-full w-full"
              sandbox="allow-same-origin allow-scripts"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs font-bold uppercase tracking-widest text-fs-muted/60">
              Turnamen belum aktif — preview siap setelah ada turnamen
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] font-semibold text-fs-muted">
          Ini BUKAN mockup — iframe memuat <code className="text-fs-cyan">/overlay/{tid ?? ":tid"}/{previewLayout}</code> persis seperti
          Browser Source OBS &amp; TV Display. PUSH TO BROADCAST lalu tekan <b>Kirim Uji Realtime</b>: jika animasi
          notice muncul di sini, pipeline realtime 100% jalan.
        </p>
      </BoCard>
    </div>
  );
}

/** Stage mini: memvisualkan posisi & status layer sesuai konfigurasi. */
function MiniStage({
  config, mode, onAir,
}: {
  config: OverlaySceneConfig;
  mode: Mode;
  onAir: OverlaySceneConfig | null;
}) {
  const cfg = mode === "onair" && onAir ? onAir : config;
  const posCls: Record<string, string> = {
    tl: "left-2 top-2", tc: "left-1/2 top-2 -translate-x-1/2", tr: "right-2 top-2",
    ml: "left-2 top-1/2 -translate-y-1/2", mc: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", mr: "right-2 top-1/2 -translate-y-1/2",
    bl: "left-2 bottom-2", bc: "left-1/2 bottom-2 -translate-x-1/2", br: "right-2 bottom-2",
  };
  const visible = OVERLAY_LAYERS.filter((l) => cfg.layers[l.id]?.enabled);
  return (
    <div className="relative h-full w-full">
      {/* Grid rasio */}
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(53,214,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(53,214,255,.05) 1px,transparent 1px)",
        backgroundSize: "8% 14%",
      }} />
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2">
        <div className="h-px w-1/3 border-l border-dashed border-fs-edge" />
        <div className="h-px w-1/3 border-l border-dashed border-fs-edge" />
        <div className="h-px w-1/3 border-l border-dashed border-fs-edge" />
      </div>
      {visible.length === 0 ? (
        <p className="absolute inset-0 flex items-center justify-center text-[11px] font-bold uppercase tracking-widest text-fs-muted/50">
          Game clean — tidak ada layer aktif
        </p>
      ) : visible.map((l) => {
        const st = cfg.layers[l.id];
        return (
          <div
            key={l.id}
            className={cn("absolute max-w-[46%] truncate border px-2 py-1 text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm",
              posCls[st.position ?? l.pos] ?? posCls.mc)}
            style={{
              opacity: st.opacity ?? 1,
              transform: `${(st.scale ?? 1) !== 1 ? `scale(${st.scale})` : ""} ${(posCls[st.position ?? l.pos] ?? "").includes("translate") ? "" : ""}`.trim() || undefined,
              zIndex: st.z ?? 10,
              borderColor: l.group === "screen" ? "rgba(239,68,68,.6)" : "rgba(255,138,0,.55)",
              background: l.group === "screen" ? "rgba(26,0,0,.75)" : "rgba(8,11,16,.78)",
              color: l.group === "screen" ? "#FCA5A5" : "#FFC247",
            }}
          >
            {l.label}
          </div>
        );
      })}
      {mode === "onair" ? (
        <span className="fs-live-badge absolute right-2 top-2 z-[99] bg-fs-err px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">on air</span>
      ) : null}
    </div>
  );
}

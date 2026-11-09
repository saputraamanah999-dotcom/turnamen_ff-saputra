"use client";
// /admin/overlay — Overlay Manager: generate URL untuk OBS Browser Source
import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { useActiveTournament } from "@/services/firestore/hooks";
import { OVERLAY_DIMENSIONS, OVERLAY_LAYOUTS } from "@/lib/constants";

export default function AdminOverlayPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? "";
  const [layout, setLayout] = useState("full");
  const [dim, setDim] = useState(0);
  const [copied, setCopied] = useState(false);

  const d = OVERLAY_DIMENSIONS[dim];
  const origin = typeof window !== "undefined" ? window.location.origin : "https://situs-anda.web.app";
  const overlayUrl = `${origin}/overlay/${tid || ":tournamentId"}/${layout}?w=${d.width}&h=${d.height}`;

  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Overlay Manager</h1>
      <p className="mt-1 text-sm font-semibold text-zb-black/60">
        Generate URL overlay untuk OBS Browser Source. Overlay transparan, tanpa navigasi,
        dengan data realtime.
      </p>

      <BoCard className="mt-4 bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] font-black uppercase tracking-wider">
            Turnamen
            <input className="bo-input mt-1" value={tid || ""} readOnly placeholder="buat turnamen dulu" />
          </label>
          <label className="block text-[11px] font-black uppercase tracking-wider">
            Layout
            <select className="bo-input mt-1" value={layout} onChange={(e) => setLayout(e.target.value)}>
              {OVERLAY_LAYOUTS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-black uppercase tracking-wider">
            Dimensi (canvas)
            <select className="bo-input mt-1" value={dim} onChange={(e) => setDim(Number(e.target.value))}>
              {OVERLAY_DIMENSIONS.map((dd, i) => (
                <option key={i} value={i}>{dd.width} × {dd.height}</option>
              ))}
            </select>
          </label>
          <div className="text-[11px] font-black uppercase tracking-wider">
            Preview
            <div className="mt-1">
              <Link href={`/overlay/${tid}/${layout}?w=${d.width}&h=${d.height}`} target="_blank">
                <BoButton variant="cyan" className="w-full justify-center !px-3 !py-2 !text-xs" disabled={!tid}>
                  Buka Tab Baru
                </BoButton>
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs font-bold text-zb-black/60">
          {OVERLAY_LAYOUTS.find((l) => l.value === layout)?.note} · rasio aspek dipertahankan.
        </p>

        <div className="mt-4">
          <label className="block text-[11px] font-black uppercase tracking-wider">URL Overlay</label>
          <div className="mt-1 flex gap-2">
            <input className="bo-input flex-1 font-mono text-xs" value={overlayUrl} readOnly />
            <BoButton
              variant="primary"
              className="!px-4"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(overlayUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Tersalin" : "Salin"}
            </BoButton>
          </div>
        </div>

        <div className="mt-4 border-[3px] border-zb-black bg-zb-off p-4 text-xs font-semibold leading-relaxed text-zb-black/70">
          <p className="font-black uppercase tracking-wider text-zb-black">Cara pakai di OBS:</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Sources → + → Browser.</li>
            <li>Tempel URL di atas pada kolom URL.</li>
            <li>Width {d.width}, Height {d.height}.</li>
            <li>Centang &quot;Shutdown source when not visible&quot;.</li>
            <li>OK — overlay otomatis transparan dan update realtime.</li>
          </ol>
          <p className="mt-2">
            <BoBadge className="bg-zb-yellow">AMAN</BoBadge> Tidak ada kredensial admin pada URL overlay.
          </p>
        </div>
      </BoCard>
    </div>
  );
}

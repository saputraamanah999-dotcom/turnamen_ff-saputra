"use client";
// ============================================================
// /live/connect — Pairing stream lokal (PHASE 2 §8 Mode B)
// Viewer memasukkan kode pairing dari operator (atau membuka
// link QR berisi ?gw=&code=). Browser menyimpan konfigurasi
// secara lokal (localStorage), TIDAK dikirim ke server publik.
// Mixed-content dijelaskan jujur: dari HTTPS, stream http LAN
// hanya bisa diputar bila browser mengizinkan (localhost ok).
// ============================================================

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, MonitorPlay, ShieldCheck, TriangleAlert } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { useToast } from "@/hooks/use-toast";

function ConnectInner() {
  const search = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [gw, setGw] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    const qGw = search.get("gw") ?? "";
    const qCode = search.get("code") ?? "";
    if (qGw || qCode) {
      setGw(qGw || gw);
      setCode(qCode || code);
      setAuto(Boolean(qGw && qCode));
    }
    // Prefill dari pairing tersimpan
    try {
      const raw = localStorage.getItem("zeroid.pairing");
      if (raw) {
        const p = JSON.parse(raw) as { gw?: string };
        if (p.gw && !gw) setGw(p.gw);
      }
    } catch { /* abaikan */ }
  }, []);

  async function redeem() {
    if (!/^https?:\/\//i.test(gw)) {
      toast({ title: "Alamat gateway belum benar", description: "Contoh: http://192.168.43.1:8080", variant: "destructive" as never });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      toast({ title: "Kode pairing 6 digit", variant: "destructive" as never });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${gw.replace(/\/$/, "")}/api/pairing/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Kode tidak valid");
      localStorage.setItem("zeroid.pairing", JSON.stringify({
        gw: gw.replace(/\/$/, ""),
        whe: `${gw.replace(/\/$/, "")}${j.wheUrl}`,
        hls: `${gw.replace(/\/$/, "")}${j.hlsUrl}`,
        tid: j.tid,
        at: Date.now(),
      }));
      toast({ title: "Pairing berhasil", description: "Mengalihkan ke halaman live…" });
      router.push(j.tid ? `/live/${j.tid}` : "/live");
    } catch (e) {
      toast({
        title: "Pairing gagal",
        description: e instanceof Error ? e.message : "Gateway tidak terjangkau. Pastikan kamu berada di jaringan lokal yang sama.",
        variant: "destructive" as never,
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (auto && code && gw) void redeem();
  }, [auto]);

  return (
    <div className="fs-arena-bg flex min-h-screen items-center justify-center px-4 py-10">
      <BoCard className="w-full max-w-lg p-6">
        <p className="bo-kicker">Mode B — Public Website</p>
        <h1 className="mt-3 font-display text-2xl font-black uppercase tracking-wide">
          Pairing Stream Lokal
        </h1>
        <p className="mt-2 text-sm font-semibold text-fs-muted">
          Masukkan kode pairing dari operator panitia untuk menghubungkan halaman live ini
          dengan server siaran di laptop venue.
        </p>

        <label className="mt-5 block text-xs font-black uppercase tracking-[0.18em] text-fs-muted">
          Alamat Gateway Lokal
        </label>
        <input
          className="bo-input mt-1.5 font-mono"
          placeholder="http://192.168.43.1:8080"
          value={gw}
          onChange={(e) => setGw(e.target.value)}
        />

        <label className="mt-4 block text-xs font-black uppercase tracking-[0.18em] text-fs-muted">
          Kode Pairing (6 digit)
        </label>
        <input
          className="bo-input mt-1.5 font-stat text-center text-2xl tracking-[0.4em]"
          placeholder="000000"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => { if (e.key === "Enter") void redeem(); }}
        />

        <BoButton variant="fire" className="mt-5 w-full !py-3" disabled={busy} onClick={redeem}>
          <KeyRound className="h-4 w-4" /> {busy ? "Menyambungkan…" : "Pairing Sekarang"}
        </BoButton>

        <div className="mt-5 space-y-2.5 text-[12px] font-semibold leading-snug text-fs-muted">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" />
            Kode berlaku 15 menit dan dapat dicabut operator kapan pun. Konfigurasi disimpan hanya di browser ini.
          </p>
          <p className="flex items-start gap-2">
            <MonitorPlay className="mt-0.5 h-4 w-4 shrink-0 text-fs-cyan" />
            Di dalam venue, video paling stabil lewat <b className="text-fs-text">Local Display URL</b> dari panitia
            (Mode A) — halaman lokal laptop, tanpa internet.
          </p>
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-fs-gold" />
            Catatan jujur: browser membatasi HTTPS → HTTP. Jika video gagal muncul di jaringan lokal,
            gunakan halaman lokal atau hubungkan lewat hotspot laptop.
          </p>
        </div>

        <div className="mt-5 flex justify-between">
          <Link href="/live" className="text-xs font-bold uppercase tracking-widest text-fs-cyan hover:underline">← Kembali ke /live</Link>
          <Link href="/live/status" className="text-xs font-bold uppercase tracking-widest text-fs-muted hover:underline">Cek Status →</Link>
        </div>
      </BoCard>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="fs-arena-bg min-h-screen" />}>
      <ConnectInner />
    </Suspense>
  );
}

"use client";
// ============================================================
// STIKAR ESPORTS — SERTIFIKAT JUARA (halaman publik /leaderboard)
// Muncul HANYA saat turnamen selesai (semua match dipublikasikan /
// status completed): bagian "Sertifikat Juara" berisi kartu Juara
// 1–3 di bawah-tengah area juara. Klik kartu → preview sertifikat
// (canvas, berlogo SMK + OSIS + tanda tangan Ketua Panitia
// I Komang Edi Saputra) → tombol unduh PNG resolusi tinggi.
// Bukan panel admin dan bukan halaman /live — murni fitur publik.
// ============================================================

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Award, Download, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORG } from "@/lib/constants";
import {
  MEDAL,
  certificatePreviewUrl,
  downloadChampionCertificate,
  type CertificateData,
} from "@/lib/certificate";
import type { StandingsRow } from "@/lib/types";

export function ChampionCertificates({
  standings,
  tournamentName,
  ready,
  className,
}: {
  standings: StandingsRow[];
  tournamentName: string;
  /** true bila turnamen benar-benar selesai (juara terkonfirmasi / status completed). */
  ready: boolean;
  className?: string;
}) {
  const top3 = standings.slice(0, 3);
  const [open, setOpen] = useState<CertificateData | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  if (!ready || !top3.length) return null;

  async function openCard(row: StandingsRow, rank: 1 | 2 | 3) {
    const data: CertificateData = {
      rank,
      teamName: row.teamName,
      teamTag: row.teamTag,
      kills: row.kills,
      points: row.totalPoints,
      tournamentName: tournamentName || ORG.tournament,
    };
    setOpen(data);
    setPreview(null);
    try {
      setPreview(await certificatePreviewUrl(data));
    } catch {
      setPreview(null);
    }
  }

  async function download() {
    if (!open || downloading) return;
    setDownloading(true);
    try {
      await downloadChampionCertificate(open);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className={cn("mt-10", className)}>
      <div className="mx-auto max-w-3xl text-center">
        <span className="bo-kicker inline-block bg-zb-yellow text-fs-ink">Sertifikat Resmi</span>
        <h2 className="mt-2 font-display text-2xl font-black uppercase sm:text-3xl">
          Sertifikat Juara <span className="text-fs-gold">1 · 2 · 3</span>
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-relaxed text-fs-text/60">
          Seluruh match telah selesai — sertifikat penghargaan resmi {ORG.institution} × OSIS untuk tim
          juara sudah siap. Tekan kartu juara untuk melihat &amp; mengunduh sertifikatnya (PNG resolusi tinggi,
          siap dicetak). Nomor seri tercantum otomatis di setiap sertifikat.
        </p>
      </div>

      {/* Kartu juara — bawah tengah */}
      <div className="mx-auto mt-5 grid max-w-4xl gap-3 sm:grid-cols-3">
        {top3.map((row, i) => {
          const rank = (i + 1) as 1 | 2 | 3;
          const medal = MEDAL[rank];
          return (
            <motion.button
              key={row.teamId}
              type="button"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => void openCard(row, rank)}
              className="bo-card group relative overflow-hidden bg-fs-panel p-4 text-left transition-transform hover:-translate-y-1"
              style={{ borderColor: medal.color, boxShadow: `0 0 22px ${medal.glow}` }}
            >
              <div className="bo-halftone absolute inset-0 opacity-40" aria-hidden />
              <div className="relative flex items-start justify-between gap-2">
                <span
                  className="border border-black/20 px-2 py-0.5 font-display text-[11px] font-black uppercase tracking-widest text-fs-ink"
                  style={{ backgroundColor: medal.color }}
                >
                  {medal.name}
                </span>
                <Award className="h-5 w-5 shrink-0" style={{ color: medal.color }} aria-hidden />
              </div>
              <p className="relative mt-2 truncate font-display text-lg font-black uppercase leading-tight">
                {row.teamName}
              </p>
              <p className="relative mt-0.5 text-xs font-bold uppercase tracking-wider text-fs-text/60">
                {row.totalPoints} poin · {row.kills} kill
              </p>
              <p className="relative mt-3 inline-flex items-center gap-1.5 border border-fs-edge px-2 py-1 text-[10px] font-black uppercase tracking-widest text-fs-gold transition-colors group-hover:border-fs-gold/70">
                <Award className="h-3.5 w-3.5" /> Lihat &amp; unduh sertifikat
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* Preview + unduh */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setOpen(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="max-h-full w-full max-w-3xl overflow-auto border border-fs-gold/50 bg-fs-panel p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display text-base font-black uppercase">
                    Sertifikat {MEDAL[open.rank].name} — {open.teamName}
                  </p>
                  <p className="text-[11px] font-semibold text-fs-text/55">
                    {ORG.tournament} · {ORG.institution} × OSIS · ditandatangani digital oleh I Komang Edi Saputra (Ketua Panitia)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="flex h-9 w-9 items-center justify-center border border-fs-edge text-fs-muted hover:border-fs-err hover:text-fs-err"
                  aria-label="Tutup"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 border border-fs-edge bg-black/40 p-2">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={`Preview sertifikat ${open.teamName}`} className="mx-auto w-full" />
                ) : (
                  <div className="flex aspect-[1.414] w-full items-center justify-center text-sm font-bold text-fs-muted">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Menyiapkan sertifikat…
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-sm text-[10px] font-semibold leading-relaxed text-fs-text/45">
                  PNG 2000×1414 (A4 landscape) — berisi logo SMK, penyelenggara {ORG.institution} × OSIS, nama tim,
                  poin &amp; kill resmi, serta tanda tangan Ketua Panitia.
                </p>
                <button
                  type="button"
                  onClick={() => void download()}
                  disabled={downloading}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-fs-fire to-fs-flame px-4 py-2.5 font-display text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloading ? "Menyiapkan…" : "Unduh Sertifikat (PNG)"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

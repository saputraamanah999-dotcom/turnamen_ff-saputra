"use client";
// ============================================================
// BOF — OcrUploader (kartu AI OCR di form Entri Hasil) — v3
// Upload screenshot layar hasil Free Fire → OCR di browser membaca
// SEMUA blok placement (rank + TOTAL kill tim = penjumlahan kill 4
// pemain, tiap angka diverifikasi zoom + mask kuning) → admin
// memilih tim terdaftar per baris → TERAPKAN → formulir terisi.
// TANPA NAMA PEMAIN (permintaan admin): hasil hanya rank + total kill.
// ============================================================

import { useRef, useState } from "react";
import { Camera, Check, ChevronDown, ChevronUp, ClipboardCheck, HelpCircle, ImageUp, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import {
  analyzeScreenshotClient, linkScreenshotToMatch,
  markOcrApplied, saveOcrUpload, uploadScreenshot,
  type UploadScreenshotResult,
} from "@/services/ocr/client";
import type { OcrAnalysis, OcrRow, Team } from "@/lib/types";

type Phase = "idle" | "uploading" | "analyzing" | "done" | "applied";

const LABEL_MESIN: Record<string, string> = {
  "browser-ocr": "OCR BROWSER (ANGKA TERVERIFIKASI)",
  "server-ocr": "OCR SERVER (FALLBACK)",
};

interface EditableRow extends OcrRow {
  selected: boolean;
}

export function OcrUploader({
  tid,
  matchId,
  matchNumber,
  teams,
  disabled,
  onApply,
}: {
  tid: string;
  matchId: string;
  matchNumber?: number;
  teams: Team[];
  disabled?: boolean;
  onApply: (rows: OcrRow[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [upload, setUpload] = useState<UploadScreenshotResult | null>(null);
  const [uploadId, setUploadId] = useState<string>("");
  const [analysis, setAnalysis] = useState<OcrAnalysis | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [progressNote, setProgressNote] = useState("");

  const busy = phase === "uploading" || phase === "analyzing";

  function reset() {
    setFile(null);
    setPreview("");
    setPhase("idle");
    setErrMsg("");
    setUpload(null);
    setUploadId("");
    setAnalysis(null);
    setRows([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onPick(f: File | null) {
    setErrMsg("");
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErrMsg("Berkas harus gambar (PNG/JPG/WEBP) — screenshot hasil match.");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setErrMsg("Gambar melebihi 20 MB. Kompres dulu atau screenshot ulang.");
      return;
    }
    setFile(f);
    setPhase("idle");
    setAnalysis(null);
    setRows([]);
    setUpload(null);
    setPreview(URL.createObjectURL(f));
  }

  async function onAnalyze() {
    if (!file || disabled) return;
    setErrMsg("");
    let up: UploadScreenshotResult | null = null;
    try {
      setPhase("uploading");
      up = await uploadScreenshot(file, tid, matchId);
      setUpload(up);
      setPhase("analyzing");
      // OCR dijalankan DI BROWSER (CPU perangkat admin): 2 pass tesseract
      // → parser kill-anchored (semua blok placement, grid band × baris)
      // → tiap sel angka di-zoom ulang (mask kuning + whitelist digit)
      // → total kill = penjumlahan 4 pemain per blok. Tanpa nama pemain.
      const result = await analyzeScreenshotClient(file, teams, (t) => setProgressNote(t), up?.url);
      if (!result.rows.length) {
        throw new Error(
          "OCR tidak membaca satu blok placement pun. Pastikan screenshot adalah layar skor akhir/BOOYAH! dan cukup terang.",
        );
      }
      setAnalysis(result);
      setRows(result.rows.map((r) => ({ ...r, selected: true })));
      const id = await saveOcrUpload(tid, matchId, matchNumber, up, result);
      setUploadId(id ?? "");
      setPhase("done");
    } catch (e) {
      setErrMsg(String((e as Error).message ?? e));
      // Bila gambar sudah ter-upload tapi analisa gagal, tampilkan tetap hasil + pesan.
      setPhase(up ? "done" : "idle");
    }
  }

  async function onApplyClick() {
    const dipilih = rows.filter((r) => r.selected && r.teamId);
    if (!dipilih.length) return;
    onApply(
      dipilih.map((r): OcrRow => ({
        rank: r.rank, teamRaw: r.teamRaw, teamId: r.teamId, teamName: r.teamName,
        kills: r.kills, points: r.points, confidence: r.confidence,
      })),
    );
    try {
      if (uploadId) await markOcrApplied(uploadId);
      if (upload) await linkScreenshotToMatch(tid, matchId, upload.url, upload.thumbUrl);
    } catch {
      // Arsip gagal — form tetap terisi, admin bisa lanjut.
    }
    setPhase("applied");
  }

  function setRow(i: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  /** Pilih tim terdaftar manual untuk baris rank ini. */
  function onManualTeam(i: number, teamId: string) {
    const t = teams.find((x) => x.id === teamId) ?? null;
    setRow(i, { teamId: teamId || null, teamName: t?.name ?? null, confidence: teamId ? Math.max(0.75, rows[i].confidence ?? 0) : undefined });
  }

  const cocok = rows.filter((r) => r.selected && r.teamId).length;
  const belum = rows.filter((r) => r.selected && !r.teamId).length;
  const needsReview = analysis?.needsReview;
  const [showGuide, setShowGuide] = useState(false);

  return (
    <BoCard className="mt-4 border-2 border-fs-cyan/40 bg-fs-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-black uppercase tracking-wider text-fs-cyan">
            Analisa Screenshot (AI OCR)
          </h2>
          <p className="text-xs font-semibold text-fs-text/60">
            Upload layar hasil match → semua blok placement terbaca otomatis: <b>rank + TOTAL kill tim</b>
            {" "}(penjumlahan kill 4 pemain, tiap angka diverifikasi ulang). Tinggal pilih timnya di kolom
            &ldquo;Tim terdaftar&rdquo; — <b>tanpa nama pemain</b>.
          </p>
        </div>
        {phase === "applied" ? (
          <BoBadge className="bg-emerald-500 text-white">
            <Check className="mr-1 inline h-3.5 w-3.5" /> DITERAPKAN
          </BoBadge>
        ) : null}
      </div>

      {/* Pilih gambar */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <BoButton variant="cyan" type="button" onClick={() => fileRef.current?.click()} disabled={busy || disabled}>
          <Camera className="h-4 w-4" /> {file ? "Ganti Gambar" : "Pilih Screenshot"}
        </BoButton>
        {file ? (
          <span className="max-w-[240px] truncate text-xs font-bold text-fs-text/70">{file.name}</span>
        ) : null}
        {file && phase !== "applied" ? (
          <BoButton variant="primary" type="button" onClick={onAnalyze} disabled={busy || disabled}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
            {phase === "uploading" ? "Mengunggah…" : phase === "analyzing" ? "AI membaca…" : "Upload & Analisa"}
          </BoButton>
        ) : null}
        {file ? (
          <BoButton variant="white" type="button" onClick={reset} disabled={busy}>
            <RotateCcw className="h-4 w-4" /> Reset
          </BoButton>
        ) : null}
      </div>

      {preview && phase !== "idle" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Pratinjau screenshot hasil match"
          className="mt-3 max-h-52 rounded border border-fs-edge/40 object-contain sm:max-h-64"
        />
      ) : null}

      {errMsg ? (
        <p className="mt-3 flex items-start gap-2 border-2 border-fs-err bg-fs-err/10 px-3 py-2 text-xs font-bold text-fs-err">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {errMsg}
        </p>
      ) : null}

      {analysis && upload ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <BoBadge className="bg-fs-cyan text-black">{LABEL_MESIN[analysis.source] ?? analysis.source}</BoBadge>
            <a
              href={upload.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-fs-cyan underline"
            >
              link gambar tersimpan ↗
            </a>
            {needsReview ? (
              <BoBadge className="bg-zb-yellow text-black">
                <TriangleAlert className="mr-1 inline h-3 w-3" /> PERIKSA BARIS BERTANDA
              </BoBadge>
            ) : null}
          </div>
          {analysis.notes ? (
            <p className="mt-2 text-xs font-semibold text-fs-text/60">Catatan: {analysis.notes}</p>
          ) : null}

          {/* Tabel hasil — admin pilih tim + koreksi angka bila perlu */}
          <div className="mt-2 max-h-96 overflow-y-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-fs-head text-white">
                  <th className="w-10 px-2 py-2" aria-label="Pilih" />
                  <th className="px-2 py-2 text-left font-display text-xs uppercase tracking-wider">Rank</th>
                  <th className="px-2 py-2 text-left font-display text-xs uppercase tracking-wider">Tim terdaftar</th>
                  <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-20">Kills</th>
                  <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-16">Yakin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-fs-edge/10">
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => setRow(i, { selected: e.target.checked })}
                        aria-label={`Gunakan baris rank ${r.rank ?? i + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        className="bo-input !h-8 w-16 text-center"
                        value={r.rank ?? ""}
                        onChange={(e) =>
                          setRow(i, { rank: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        aria-label={`Rank baris ${i + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="bo-input !h-8 w-full min-w-40 max-w-56 text-xs"
                        value={r.teamId ?? ""}
                        onChange={(e) => onManualTeam(i, e.target.value)}
                        aria-label={`Tim terdaftar untuk rank ${r.rank ?? i + 1}`}
                      >
                        <option value="">— pilih tim (manual) —</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}{t.tag ? ` [${t.tag}]` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        className="bo-input !h-8 w-14 text-center"
                        value={r.kills ?? ""}
                        onChange={(e) =>
                          setRow(i, { kills: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        aria-label={`Total kill rank ${r.rank ?? i + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className={
                          "text-[11px] font-black tabular-nums " +
                          ((r.confidence ?? 0) >= 0.8 ? "text-emerald-400" : (r.confidence ?? 0) >= 0.5 ? "text-fs-gold" : "text-fs-err")
                        }
                      >
                        {Math.round((r.confidence ?? 0) * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {phase === "applied" ? (
            <p className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-500">
              <ClipboardCheck className="h-4 w-4" />
              {cocok} baris diterapkan ke formulir — placement &amp; kill terisi, poin dihitung otomatis.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <BoButton variant="primary" type="button" onClick={onApplyClick} disabled={cocok === 0}>
                <ClipboardCheck className="h-4 w-4" /> Terapkan ke Formulir ({cocok})
              </BoButton>
              {belum ? (
                <span className="text-xs font-bold text-fs-gold">
                  {belum} baris belum punya tim — pilih di kolom &ldquo;Tim terdaftar&rdquo; atau hilangkan
                  centangnya.
                </span>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {!analysis && !errMsg && !busy ? (
        <p className="mt-2 text-[11px] font-semibold text-fs-text/40">
          Tips: screenshot layar hasil (klasemen akhir dengan angka 1, 2, 3… di kiri) terbaca paling akurat.
          Total kill = penjumlahan kill semua pemain dalam satu blok rank; placement = nomor bloknya.
        </p>
      ) : null}

      {/* CARA PAKAI — panduan lengkap fitur OCR */}
      <div className="mt-3 border border-fs-edge/40 bg-fs-bg/40">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-fs-cyan"
          onClick={() => setShowGuide((v) => !v)}
          aria-expanded={showGuide}
        >
          <HelpCircle className="h-4 w-4" /> CARA PAKAI AI OCR — BACA INI KALAU BELUM PERNAH
          {showGuide ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
        </button>
        {showGuide ? (
          <div className="space-y-2 px-4 pb-4 text-xs font-semibold leading-relaxed text-fs-text/80">
            <p className="font-black uppercase text-fs-text">1. Screenshot layar hasil match</p>
            <p>
              Di Free Fire, setelah match selesai buka layar hasil (klasemen akhir — ada angka{" "}
              <b>1, 2, 3…</b> di kiri dan tulisan &ldquo;N Kill&rdquo; per pemain), lalu screenshot. Kalau
              12 tim tidak muat dalam satu layar, scroll lalu screenshot lagi — analisa bisa diulang dan
              baris yang sama akan diperbarui di formulir.
            </p>
            <p className="font-black uppercase text-fs-text">2. Upload &amp; analisa</p>
            <p>
              Pilih Screenshot → <b>Upload &amp; Analisa</b>. Gambar diarsipkan ke hosting ImgBB sebagai
              bukti, lalu OCR berjalan <b>di perangkat kamu</b>: pembacaan penuh 2 pass → deteksi semua
              blok placement dari kata &ldquo;Kill&rdquo; → <b>setiap angka di-zoom ulang dan diperiksa
              dengan mask warna + whitelist digit</b> (inilah kunci akurasi) → <b>total kill tim =
              penjumlahan kill 4 pemain dalam satu blok</b> (contoh nyata 3+6+5+5 = 19), nomor blok
              menjadi placement. Bila browser gagal membaca layar, analisa otomatis dilanjutkan di server.
            </p>
            <p className="font-black uppercase text-fs-text">3. Pilih tim untuk tiap rank</p>
            <p>
              Hasil tampil sebagai daftar <b>rank → total kill</b> (tanpa nama pemain). Untuk tiap baris,
              pilih tim terdaftar di kolom <b>Tim terdaftar</b> — cocokkan urutan rank di layar dengan
              daftar tim kamu. Semua angka <b>bisa diedit langsung</b> di kolom Kills kalau ada yang
              kelewat baca. Hilangkan centang baris yang tidak dipakai (mis. blok terpotong tepi layar).
            </p>
            <p className="font-black uppercase text-fs-text">4. Terapkan → Simpan Draft → Publish</p>
            <p>
              Klik <b>Terapkan ke Formulir</b> — placement &amp; kill terisi otomatis, PLACEMENT PTS,
              KILL PTS dan TOTAL dihitung otomatis sesuai aturan resmi (kill = 2 poin). Lalu Simpan
              Draft → Preview → Publish seperti biasa.
            </p>
            <p className="border border-fs-edge bg-fs-panel px-3 py-2 text-[11px]">
              <b>Akurasi:</b> tiap angka dibaca 2× (teks penuh + zoom mask kuning) dan angka yang tidak
              yakin ditolak, bukan ditebak. Baris dengan tanda &ldquo;periksa&rdquo; = angka kurang
              lengkap atau rank otomatis — selalu cek baris itu. <b>Pengaturan mesin:</b> endpoint &amp;
              model di menu <b>Pengaturan → AI &amp; OCR</b> (database, bukan .env). Environment hanya
              berisi key: <code>JERE_API_KEY</code> + <code>IMGBB_API_KEY</code>.
            </p>
          </div>
        ) : null}
      </div>
      {phase === "analyzing" ? (
        <p className="mt-2 flex items-center gap-2 text-xs font-bold text-fs-cyan">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progressNote || "OCR sedang membaca screenshot di perangkat ini…"} jangan tutup halaman.
        </p>
      ) : null}
      {phase === "uploading" ? (
        <p className="mt-2 flex items-center gap-2 text-xs font-bold text-fs-cyan">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengunggah gambar ke hosting…
        </p>
      ) : null}
    </BoCard>
  );
}

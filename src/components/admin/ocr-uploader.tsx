"use client";
// ============================================================
// BOF — OcrUploader (kartu AI OCR di form Entri Hasil)
// Upload screenshot Free Fire → AI baca placement + kill →
// admin periksa/koreksi sekilas → TERAPKAN → formulir terisi.
// Link gambar diarsipkan (ocrUploads) + disematkan ke match,
// nama mentah layar disimpan sebagai MEMORI alias tim.
// ============================================================

import { useRef, useState } from "react";
import { Camera, Check, ChevronDown, ChevronUp, ClipboardCheck, HelpCircle, ImageUp, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import {
  addOcrAlias, analyzeScreenshotClient, linkScreenshotToMatch,
  markOcrApplied, saveOcrUpload, uploadScreenshot,
  type UploadScreenshotResult,
} from "@/services/ocr/client";
import type { OcrAnalysis, OcrRow, Team } from "@/lib/types";

type Phase = "idle" | "uploading" | "analyzing" | "done" | "applied";

const LABEL_MESIN: Record<string, string> = {
  "browser-ocr": "OCR BROWSER (GEOMETRI ANGKA)",
  "browser-ocr+jere": "OCR BROWSER + AI JERE",
  tesseract: "OCR SERVER (GEOMETRI ANGKA)",
  "tesseract+jere": "OCR SERVER + AI JERE",
  jere: "AI JERE VISION",
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
      // OCR dijalankan DI BROWSER (CPU perangkat admin) — tidak membebani
      // server, bebas batas waktu, dan memakai mesin yang sama (geometri
      // blok + penjumlahan kill 4 pemain per top #) via lib bersama.
      const result = await analyzeScreenshotClient(file, teams, (t) => setProgressNote(t));
      if (!result.rows.length) {
        throw new Error(
          "OCR browser tidak membaca satu blok placement pun. Pastikan screenshot adalah layar skor akhir/BOOYAH! dan cukup terang.",
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
    // Buang flag UI 'selected' sebelum kirim ke formulir.
    onApply(
      dipilih.map((r): OcrRow => ({
        rank: r.rank, teamRaw: r.teamRaw, teamId: r.teamId, teamName: r.teamName,
        kills: r.kills, points: r.points, confidence: r.confidence,
      })),
    );
    // Perkaya memori + arsip (best-effort, jangan blok UI).
    try {
      await Promise.all(
        dipilih
          .filter((r) => r.teamId && r.teamRaw)
          .map((r) => addOcrAlias(tid, r.teamId as string, r.teamRaw)),
      );
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

  /** Pilih ulang tim manual untuk baris yang belum cocok. */
  function onManualTeam(i: number, teamId: string) {
    const t = teams.find((x) => x.id === teamId) ?? null;
    setRow(i, { teamId: teamId || null, teamName: t?.name ?? null, confidence: teamId ? 1 : undefined });
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
            Upload layar BOOYAH!/skor akhir → AI baca <b>placement &amp; total kill</b> otomatis. Pencocokan nama tim
            otomatis bila memori ada — <b>tanpa kapten/roster pun bisa</b>: pilih tim manual di kolom “Tim terdaftar”.
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
            {analysis.booyahTeam ? (
              <BoBadge className="bg-fs-gold text-black">BOOYAH: {analysis.booyahTeam}</BoBadge>
            ) : null}
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
                <TriangleAlert className="mr-1 inline h-3 w-3" /> WAJIB DIPERIKSA
              </BoBadge>
            ) : null}
          </div>
          {analysis.notes ? (
            <p className="mt-2 text-xs font-semibold text-fs-text/60">Catatan AI: {analysis.notes}</p>
          ) : null}

          {/* Tabel hasil — admin koreksi bila perlu */}
          <div className="mt-2 max-h-96 overflow-y-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-fs-head text-white">
                  <th className="w-10 px-2 py-2" aria-label="Pilih" />
                  <th className="px-2 py-2 text-left font-display text-xs uppercase tracking-wider">Rank</th>
                  <th className="px-2 py-2 text-left font-display text-xs uppercase tracking-wider">Tim di layar</th>
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
                        aria-label={`Gunakan baris ${r.teamRaw}`}
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
                        aria-label={`Rank ${r.teamRaw}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <p className="max-w-[220px] truncate font-bold" title={r.teamRaw}>
                        {r.rank === 1 ? <span className="mr-1 text-fs-gold">#1</span> : null}
                        {r.teamRaw}
                      </p>
                      {r.players?.length ? (
                        <p className="max-w-[220px] truncate text-[10px] font-semibold text-fs-text/40" title={r.players.join(", ")}>
                          {r.players.length} pemain: {r.players.join(", ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="bo-input !h-8 w-full min-w-40 max-w-56 text-xs"
                        value={r.teamId ?? ""}
                        onChange={(e) => onManualTeam(i, e.target.value)}
                        aria-label={`Tim terdaftar untuk ${r.teamRaw}`}
                      >
                        <option value="">— tidak cocok / manual —</option>
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
                        aria-label={`Kill ${r.teamRaw}`}
                      />
                      {r.memberKills?.length ? (
                        <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-fs-text/40" title="Total kill tim = penjumlahan kill semua pemain di blok ini">
                          {r.memberKills.map((m) => (m.kills ?? "?")).join("+")}={r.kills ?? "?"}
                        </p>
                      ) : null}
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
              {cocok} baris diterapkan ke formulir. Alias nama tim juga disimpan ke memori.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <BoButton variant="primary" type="button" onClick={onApplyClick} disabled={cocok === 0}>
                <ClipboardCheck className="h-4 w-4" /> Terapkan ke Formulir ({cocok})
              </BoButton>
              {belum ? (
                <span className="text-xs font-bold text-fs-gold">
                  {belum} baris belum cocok tim terdaftar — pilih manual di kolom &ldquo;Tim terdaftar&rdquo;
                  atau hilangkan centangnya.
                </span>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {!analysis && !errMsg && !busy ? (
        <p className="mt-2 text-[11px] font-semibold text-fs-text/40">
          Tips: screenshot layar &ldquo;BOOYAH!&rdquo; atau klasemen akhir terbaca paling akurat. Total kill = penjumlahan
          kill semua pemain dalam satu top # (dihitung otomatis), placement = nomor bloknya. Tanpa kapten/roster pun bisa.
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
            <p className="font-black uppercase text-fs-text">1. Siapkan screenshot yang benar</p>
            <p>
              Di Free Fire, setelah match selesai buka layar hasil (papan skor akhir — yang ada angka
              <b> 1, 2, 3…</b> di kiri dan nama pemain + &ldquo;N Kill&rdquo;), lalu screenshot. Satu screenshot boleh berisi
              beberapa blok peringkat sekaligus. Jika 12 tim tidak muat dalam satu layar, scroll lalu screenshot lagi —
              analisa bisa diulang untuk sisa blok (terapkan kedua kalinya, baris yang sama akan diperbarui).
            </p>
            <p className="font-black uppercase text-fs-text">2. (Opsional) Isi roster pemain di menu Tim</p>
            <p>
              Tanpa kapten/roster pun OCR TETAP JALAN — semua baris placement + kill tetap muncul, tinggal kamu pilih
              timnya manual (langkah 4). Kalau roster <b>kapten + 4 pemain (IGN)</b> diisi di menu Tim, pencocokan jadi
              OTOMATIS. Nama yang pernah cocok tersimpan sebagai alias memori — screenshot berikutnya makin pintar.
            </p>
            <p className="font-black uppercase text-fs-text">3. Upload &amp; analisa</p>
            <p>
              Pilih Screenshot → <b>Upload &amp; Analisa</b>. Gambar diarsipkan ke hosting ImgBB, lalu mesin OCR berjalan
              <b> di perangkat kamu</b> (membaca layar 2 tahap + pemulihan angka — ikuti progres di layar) dan server
              menghitung sisanya: jumlah kill <b>4 pemain dalam satu top # dihitung TOTAL</b> (contoh 3+6+5+5 = 19),
              nomor blok menjadi placement, total kill masuk ke kolom Kills formulir di bawah.
            </p>
            <p className="font-black uppercase text-fs-text">4. Periksa tabel hasil, atur timnya</p>
            <p>
              Kolom <b>Tim terdaftar</b>: kalau sudah cocok otomatis, tidak perlu apa-apa. Bila &ldquo;tidak cocok / manual&rdquo;,
              pilih nama tim dari dropdown — cocokkan urutan placement di layar dengan daftar di bawah (lihat kolom pemain
              sebagai petunjuk). Kolom Kills menampilkan rincian penjumlahan (mis. 3+6+5+5=19) supaya mudah dicek.
              Hilangkan centang baris yang tidak dipakai (mis. blok terpotong).
            </p>
            <p className="font-black uppercase text-fs-text">5. Terapkan → Simpan Draft → Publish</p>
            <p>
              Klik <b>Terapkan ke Formulir</b> — placement &amp; kill terisi otomatis, PLACEMENT PTS, KILL PTS dan TOTAL
              dihitung otomatis sesuai aturan resmi (kill = 2 poin). Admin hanya perlu menyetel ulang angka yang
              salah. Lalu Simpan Draft → Preview → Publish seperti biasa.
            </p>
            <p className="border border-fs-edge bg-fs-panel px-3 py-2 text-[11px]">
              <b>Pengaturan mesin:</b> ENDPOINT &amp; model diatur di menu <b>Pengaturan → AI &amp; OCR</b> (tersimpan di
              database — bukan .env). Environment hanya berisi 2 key: <code>JERE_API_KEY</code> + <code>IMGBB_API_KEY</code>.
              Status key juga tampil di halaman itu.
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

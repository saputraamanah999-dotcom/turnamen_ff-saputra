"use client";
// /admin/settings — wizard setup 11 langkah + pengaturan tema (§24) + AI & OCR
import { useState, useEffect } from "react";
import { Bot, CheckCircle2, Circle, Database, Palette, RotateCcw, Save } from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { useActiveTournament, useMatches, useStandings, useTeams, useBroadcast } from "@/services/firestore/hooks";
import { checkObserverStatus } from "@/services/observer/client";
import {
  loadOcrSettings, saveOcrSettings,
  OCR_SETTINGS_DEFAULT, type OcrSettings,
} from "@/services/ocr/client";
import { applyTheme, DEFAULT_THEME, getStoredTheme, THEMES } from "@/lib/themes";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface KeyStatus { jere: boolean; imgbb: boolean; gemini: boolean; openai: boolean; ocrSpace: boolean }

export default function AdminSettingsPage() {
  const { tournament, status } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teams = useTeams(tid, false);
  const matches = useMatches(tid, false);
  const standings = useStandings(tid, false);
  const broadcast = useBroadcast(tid);
  const { toast } = useToast();
  const [theme, setTheme] = useState("firestorm");
  // AI & OCR — model diatur dari UI (tersimpan di Firestore settings/ocr),
  // API key TIDAK diatur di sini (hanya di environment).
  const [ocr, setOcr] = useState<OcrSettings>({ ...OCR_SETTINGS_DEFAULT });
  const [ocrLoaded, setOcrLoaded] = useState(false);
  const [ocrSaving, setOcrSaving] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  useEffect(() => {
    loadOcrSettings().then((s) => { setOcr(s); setOcrLoaded(true); }).catch(() => setOcrLoaded(true));
    fetch("/api/ai/ocr")
      .then((r) => r.json())
      .then((j) => { if (j?.keys) setKeyStatus(j.keys); })
      .catch(() => setKeyStatus(null));
  }, []);

  async function onSaveOcr() {
    setOcrSaving(true);
    try {
      await saveOcrSettings(ocr);
      toast({ title: "Pengaturan AI & OCR tersimpan", description: "Berlaku untuk semua admin & semua match berikutnya." });
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setOcrSaving(false);
    }
  }
  // Sinyal nyata untuk wizard: status AI Observer diprobe sekali saat halaman dibuka.
  const [observerOnline, setObserverOnline] = useState(false);
  useEffect(() => {
    let alive = true;
    checkObserverStatus()
      .then((s) => { if (alive) setObserverOnline(s.online); })
      .catch(() => { if (alive) setObserverOnline(false); });
    return () => { alive = false; };
  }, []);

  function pickTheme(id: string) {
    setTheme(id);
    applyTheme(id);
    toast({ title: `Tema ${THEMES.find((t) => t.id === id)?.name ?? id} diterapkan`, description: "Tersimpan di perangkat ini — admin, broadcast, overlay & TV mengikuti." });
  }

  const steps = [
    { label: "Firebase terhubung & database terverifikasi", done: status === "online" },
    { label: "Turnamen awal dibuat", done: Boolean(tournament) && status === "online" },
    { label: "Sistem poin BOF terkonfigurasi (versi resmi)", done: Boolean(tournament?.scoringVersion) },
    { label: "Tim terdaftar", done: (teams.data?.length ?? 0) > 0 && status === "online" },
    { label: "Match dibuat", done: (matches.data?.length ?? 0) > 0 && status === "online" },
    { label: "Overlay OBS dikonfigurasi", done: true, note: "Buat URL di Overlay Manager → pasang di OBS" },
    { label: "Laptop produksi tersambung (scrcpy + OBS)", done: (broadcast.data?.streamMode ?? "offline") !== "offline", note: "Atur di Broadcast Control / Interactive Stream — panduan: documentation/OBS_SETUP.md" },
    { label: "AI Observer terhubung (opsional)", done: observerOnline, note: "Cek menu AI Observer" },
    { label: "Broadcast diuji (pernah live)", done: broadcast.data?.live?.state === "live" || broadcast.data?.live?.endedAt != null, note: "Broadcast Control" },
    { label: "Hasil pertama dipublikasikan", done: (standings.data?.publishedMatchCount ?? 0) > 0 && status === "online" },
    { label: "Turnamen dipublikasikan (status aktif)", done: tournament?.status === "active" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Pengaturan &amp; Setup Wizard</h1>
      <p className="mt-1 text-sm font-semibold text-fs-text/60">
        Progres konfigurasi sistem — {doneCount}/{steps.length} langkah selesai.
      </p>

      <BoCard className="mt-4 bg-fs-panel p-5">
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm font-bold">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-fs-text/30" />
              )}
              <span>
                {i + 1}. {s.label}
                {s.note ? <span className="ml-1 text-xs font-semibold text-fs-text/40">— {s.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </BoCard>

      <BoCard className="mt-4 p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide">
          <Palette className="h-4 w-4 text-fs-fire" /> Tema Tampilan (FIRESTORM)
        </h2>
        <p className="mt-1.5 text-sm font-semibold text-fs-muted">
          Tema memengaruhi dashboard admin, panel broadcast, overlay, leaderboard & TV display
          via design tokens — layout dan data pertandingan tidak pernah berubah.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => pickTheme(t.id)}
              className={cn(
                "border p-3 text-left transition",
                theme === t.id || (theme === "firestorm" && getStoredTheme() === DEFAULT_THEME)
                  ? "border-fs-fire bg-fs-fire/10"
                  : "border-fs-edge bg-fs-bg/60 hover:border-fs-edge-strong",
              )}
            >
              <div className="flex gap-1">
                {t.swatch.map((c) => (
                  <span key={c} className="h-5 w-5 border border-black/30" style={{ background: c }} aria-hidden />
                ))}
              </div>
              <p className="mt-2 font-display text-xs font-black uppercase tracking-wider">{t.name}</p>
              <p className="mt-0.5 text-[10px] font-semibold leading-snug text-fs-muted">{t.note}</p>
            </button>
          ))}
        </div>
        <BoButton
          variant="white"
          className="mt-3 !px-3 !py-1.5 !text-[11px]"
          onClick={() => { setTheme(DEFAULT_THEME); applyTheme(DEFAULT_THEME); toast({ title: "Tema kembali ke Firestorm Orange" }); }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset ke Tema Default
        </BoButton>
      </BoCard>

      <BoCard className="mt-4 p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide">
          <Bot className="h-4 w-4 text-fs-cyan" /> AI &amp; OCR — Analisa Screenshot Hasil Match
        </h2>
        <p className="mt-1.5 text-sm font-semibold text-fs-muted">
          API KEY diatur di environment (Vercel → Settings → Environment Variables): <code>JERE_API_KEY</code> (mesin utama,
          gratis) dan <code>IMGBB_API_KEY</code> (hosting gambar). Model dan fallback diatur DI SINI — tersimpan di database
          (dokumen <code>settings/ocr</code>) dan berlaku untuk semua admin tanpa deploy ulang.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ["JERE_API_KEY", keyStatus?.jere, "key Jerexd — mesin vision utama"],
            ["IMGBB_API_KEY", keyStatus?.imgbb, "hosting gambar screenshot"],
            ["GEMINI_API_KEY (opsional)", keyStatus?.gemini, "fallback vision Google"],
            ["OPENAI_API_KEY (opsional)", keyStatus?.openai, "fallback vision OpenAI"],
            ["OCR_SPACE_KEY (opsional)", keyStatus?.ocrSpace, "OCR polos tanpa AI"],
          ] as [string, boolean | undefined, string][]).map(([name, ok, note]) => (
            <span key={name} className="inline-flex items-center gap-1.5 border border-fs-edge bg-fs-bg/60 px-2 py-1 text-[11px] font-bold">
              <span className={cn("h-2 w-2 rounded-full", ok === undefined ? "bg-fs-text/30" : ok ? "bg-emerald-500" : "bg-fs-err")} />
              {name}
              <span className="font-semibold text-fs-text/40">— {ok === undefined ? "memeriksa…" : ok ? "terpasang" : "belum diisi"} ({note})</span>
            </span>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wider text-fs-text/70">Model vision Jerexd (kosongkan = bawaan)</span>
            <input
              className="bo-input mt-1 w-full"
              placeholder="mis. gemini — kosong = default server Jerexd"
              value={ocr.jereVisionModel}
              onChange={(e) => setOcr((s) => ({ ...s, jereVisionModel: e.target.value }))}
              disabled={ocrSaving}
            />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wider text-fs-text/70">Model teks Jerexd (penstruktur JSON)</span>
            <input
              className="bo-input mt-1 w-full"
              placeholder="google/gemini-3.1-flash-lite"
              value={ocr.jereTextModel}
              onChange={(e) => setOcr((s) => ({ ...s, jereTextModel: e.target.value }))}
              disabled={ocrSaving}
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={ocr.ocrSpaceEnabled}
            onChange={(e) => setOcr((s) => ({ ...s, ocrSpaceEnabled: e.target.checked }))}
            disabled={ocrSaving}
          />
          Fallback OCR polos OCR.space bila semua AI vision gagal (hasil selalu ditandai WAJIB DIPERIKSA)
        </label>
        <BoButton variant="cyan" className="mt-3" onClick={onSaveOcr} disabled={ocrSaving || !ocrLoaded}>
          <Save className="h-4 w-4" /> {ocrSaving ? "Menyimpan…" : "Simpan Pengaturan AI & OCR"}
        </BoButton>
      </BoCard>

      <BoCard className="mt-4 bg-fs-head p-5 text-white">
        <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
          <Database className="h-4 w-4" /> Bootstrap Super Admin
        </h2>
        <p className="mt-2 text-sm font-semibold text-white/70">
          Admin pertama dibuat manual melalui script seeding (menambah user Firebase Auth +
          dokumen <code>adminRoles/{"{uid}"}</code> dengan peran <strong>superadmin</strong>).
          Tidak ada jalur publik untuk mendaftar sebagai admin. Tambahkan admin berikutnya lewat
          Firebase Console (Authentication + Firestore <code>adminRoles</code>).
        </p>
        <p className="mt-2 text-xs font-bold text-white/50">
          <BoBadge className="bg-zb-yellow text-fs-ink">Info</BoBadge> ID turnamen aktif:{" "}
          <code>{tid ?? "-"}</code> · project: <code>{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</code>
        </p>
      </BoCard>
    </div>
  );
}

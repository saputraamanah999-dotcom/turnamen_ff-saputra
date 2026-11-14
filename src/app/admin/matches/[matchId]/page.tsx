"use client";
// ============================================================
// /admin/matches/[matchId] — ENTRI HASIL RESMI BOF
// Tabel: TEAM | PLACEMENT | KILLS | PLACEMENT PTS | KILL PTS | TOTAL
// Kalkulasi otomatis + validasi + Save Draft / Preview / Publish
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Save, Send, TriangleAlert } from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { EmptyState } from "@/components/common/stat";
import { OcrUploader } from "@/components/admin/ocr-uploader";
import { useActiveTournament, useMatches, useTeams, fetchResultsOnce } from "@/services/firestore/hooks";
import { publishResults, saveDraftResults } from "@/services/scoring/publish";
import { useAdminSession } from "@/services/auth/admin";
import { useToast } from "@/hooks/use-toast";
import { placementPointsFor, killPointsFor, validateResultEntries } from "@/lib/scoring";
import { formatDateTime } from "@/lib/constants";
import type { MatchResult, OcrRow } from "@/lib/types";

interface Row {
  teamId: string;
  teamName: string;
  teamTag: string;
  placement: number | null;
  kills: number | null;
}

export default function MatchEntryPage() {
  const params = useParams<{ matchId: string }>();
  const search = useSearchParams();
  const matchId = params?.matchId ?? null;
  const { tournament: activeTournament } = useActiveTournament();
  const tid = search.get("tid") || activeTournament?.id || null;

  const matches = useMatches(tid, false);
  const teams = useTeams(tid, false);
  const session = useAdminSession();
  const { toast } = useToast();

  const match = matches.data?.find((m) => m.id === matchId) ?? null;
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publishedList, setPublishedList] = useState<MatchResult[]>([]);

  // Muat hasil yang sudah ada (draft atau published).
  useEffect(() => {
    if (!tid || !matchId) return;
    fetchResultsOnce(tid, matchId).then((list) => {
      const existing = list as (MatchResult & { id: string })[];
      setPublishedList(existing);
      const teamList = teams.data ?? [];
      if (teamList.length) {
        setRows(
          teamList.map((t) => {
            const found = existing.find((e) => e.teamId === t.id);
            return {
              teamId: t.id,
              teamName: t.name,
              teamTag: t.tag,
              placement: found?.placement ?? null,
              kills: found?.kills ?? null,
            };
          }),
        );
      }
    });
     
  }, [tid, matchId, teams.data?.length]);

  const liveCalculated = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        placementPoints: r.placement != null ? placementPointsFor(r.placement) : null,
        killPoints: r.kills != null ? killPointsFor(r.kills) : null,
        total: r.placement != null && r.kills != null ? placementPointsFor(r.placement) + killPointsFor(r.kills!) : null,
      })),
    [rows],
  );

  const errors = useMemo(
    () =>
      validateResultEntries(
        rows.filter((r) => r.placement != null && r.kills != null) as unknown as { teamId: string; teamName: string; placement: number | null; kills: number | null }[],
      ),
    [rows],
  );

  const filledCount = rows.filter((r) => r.placement != null && r.kills != null).length;
  const isPublished = Boolean(match?.resultsPublished);

  /** Isi formulir dari hasil AI OCR (dipanggil kartu Analisa Screenshot). */
  function applyOcr(ocrRows: OcrRow[]) {
    setRows((prev) =>
      prev.map((p) => {
        const hit = ocrRows.find((r) => r.teamId === p.teamId);
        if (!hit) return p;
        return {
          ...p,
          placement: hit.rank ?? p.placement,
          kills: hit.kills ?? p.kills,
        };
      }),
    );
    toast({
      title: "Formulir terisi otomatis dari screenshot",
      description: `${ocrRows.length} tim diterapkan. Cek sekali lagi, lalu Simpan Draft atau Publish.`,
    });
  }

  if (!match || !tid) {
    return <EmptyState title="Match tidak ditemukan" />;
  }

  async function onSaveDraft() {
    if (!tid || !match) return;
    setBusy(true);
    try {
      await saveDraftResults(tid, match, rows, { uid: session.user!.uid, email: session.user!.email ?? "" });
      toast({ title: "Draft tersimpan", description: "Belum memengaruhi leaderboard publik." });
    } catch (e) {
      toast({ title: "Validasi gagal", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!tid || !match) return;
    if (errors.length) {
      toast({ title: "Perbaiki error dulu", description: errors[0].message, variant: "destructive" });
      return;
    }
    const confirmed = confirm(
      `Publish hasil Match ${match.matchNumber}?\n` +
      "Klasemen publik akan dihitung ulang dan langsung terlihat di semua perangkat.\n" +
      "Perubahan hasil yang sudah dipublikasikan akan dicatat di audit log.",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await publishResults(tid, match, rows, {}, { uid: session.user!.uid, email: session.user!.email ?? "" });
      toast({ title: "Hasil dipublikasikan", description: "Leaderboard realtime telah diperbarui." });
    } catch (e) {
      toast({ title: "Gagal publish", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Link href="/admin/matches" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-zb-blue hover:underline">
        <ArrowLeft className="h-4 w-4" /> Daftar Match
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-black uppercase">
          Entri Hasil — Match {match.matchNumber}
        </h1>
        <BoBadge className={isPublished ? "bg-zb-cyan" : "bg-zb-yellow"}>
          {isPublished ? "SUDAH PUBLISH" : "DRAFT"}
        </BoBadge>
        <BoBadge>{match.map}</BoBadge>
        <BoBadge>{match.format}</BoBadge>
        <span className="text-xs font-bold text-fs-text/40">{formatDateTime(match.scheduledAt ?? undefined)}</span>
      </div>

      {isPublished ? (
        <p className="mt-3 flex items-start gap-2 border border-fs-edge bg-zb-yellow px-3 py-2 text-xs font-bold">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Hasil match ini sudah dipublikasikan ({publishedList.length} tim). Setiap perubahan
          memerlukan konfirmasi dan akan dicatat pada audit history.
        </p>
      ) : null}

      {/* AI OCR — upload screenshot → formulir terisi otomatis */}
      <OcrUploader
        tid={tid}
        matchId={matchId!}
        matchNumber={match.matchNumber}
        teams={teams.data ?? []}
        onApply={applyOcr}
      />

      {/* Bukti screenshot tersimpan pada match ini */}
      {match.screenshotUrl ? (
        <div className="mt-3 flex items-center gap-3 text-xs font-bold text-fs-text/70">
          <BoBadge className="bg-fs-cyan text-black">BUKTI SS</BoBadge>
          <a href={match.screenshotUrl} target="_blank" rel="noopener noreferrer" className="text-fs-cyan underline">
            Lihat screenshot hasil match ini ↗
          </a>
        </div>
      ) : null}

      {/* Tabel entri */}
      <BoCard className="mt-4 overflow-x-auto bg-fs-panel">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="bg-fs-head text-white">
              <th className="px-3 py-2 text-left font-display text-xs uppercase tracking-wider">Team</th>
              <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-28">Placement</th>
              <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-24">Kills</th>
              <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-28">Placement Pts</th>
              <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-24">Kill Pts</th>
              <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {liveCalculated.map((r, idx) => (
              <tr key={r.teamId} className="border-b border-fs-edge/10 bg-fs-panel">
                <td className="px-3 py-1.5">
                  <p className="font-bold">{r.teamName}</p>
                  {r.teamTag ? <p className="text-[10px] font-bold uppercase text-fs-text/40">[{r.teamTag}]</p> : null}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    min={1}
                    max={activeTournament?.teamCapacity ?? 12}
                    disabled={preview}
                    className="bo-input !h-9 w-20 text-center"
                    value={r.placement ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      setRows((prev) => prev.map((p, i) => (i === idx ? { ...p, placement: v } : p)));
                    }}
                    aria-label={`Placement ${r.teamName}`}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    min={0}
                    disabled={preview}
                    className="bo-input !h-9 w-16 text-center"
                    value={r.kills ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      setRows((prev) => prev.map((p, i) => (i === idx ? { ...p, kills: v } : p)));
                    }}
                    aria-label={`Kill ${r.teamName}`}
                  />
                </td>
                <td className="px-2 py-1.5 text-center font-bold tabular-nums">{r.placementPoints ?? "—"}</td>
                <td className="px-2 py-1.5 text-center font-bold tabular-nums">{r.killPoints ?? "—"}</td>
                <td className="px-2 py-1.5 text-center font-display text-base font-black tabular-nums">
                  {r.total ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </BoCard>

      {/* Validasi */}
      {errors.length ? (
        <div className="mt-3 border border-fs-edge bg-zb-yellow px-3 py-2">
          <p className="text-xs font-black uppercase tracking-wider">Validasi menemukan masalah:</p>
          <ul className="mt-1 list-disc pl-5 text-xs font-bold">
            {errors.map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs font-bold text-emerald-700">
          {filledCount} entri valid. Poin mengikuti aturan resmi BOF (kill = 2 poin).
        </p>
      )}

      {/* Aksi */}
      <div className="mt-4 flex flex-wrap gap-3">
        <BoButton variant="cyan" onClick={onSaveDraft} disabled={busy || preview}>
          <Save className="h-4 w-4" /> Simpan Draft
        </BoButton>
        <BoButton variant="white" onClick={() => setPreview((v) => !v)}>
          {preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {preview ? "Keluar Preview" : "Preview"}
        </BoButton>
        <BoButton variant="primary" onClick={onPublish} disabled={busy || preview || errors.length > 0 || filledCount === 0}>
          <Send className="h-4 w-4" /> Publish
        </BoButton>
      </div>
      <p className="mt-2 text-xs font-semibold text-fs-text/50">
        Alur resmi: Simpan Draft → Preview → Publish. Publish menghitung ulang seluruh klasemen
        (akumulasi semua match resmi), menerapkan tiebreaker, dan mencatat audit log.
      </p>
    </div>
  );
}

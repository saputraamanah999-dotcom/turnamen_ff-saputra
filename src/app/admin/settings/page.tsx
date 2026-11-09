"use client";
// /admin/settings — wizard setup 11 langkah
import { CheckCircle2, Circle, Database } from "lucide-react";
import { BoBadge, BoCard } from "@/components/common/bo";
import { useActiveTournament, useMatches, useStandings, useTeams } from "@/services/firestore/hooks";

export default function AdminSettingsPage() {
  const { tournament, status } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teams = useTeams(tid, false);
  const matches = useMatches(tid, false);
  const standings = useStandings(tid, false);

  const steps = [
    { label: "Firebase terhubung & database terverifikasi", done: status === "online" },
    { label: "Turnamen awal dibuat", done: Boolean(tournament) && status === "online" },
    { label: "Sistem poin BOF terkonfigurasi (versi resmi)", done: Boolean(tournament?.scoringVersion) },
    { label: "Tim terdaftar", done: (teams.data?.length ?? 0) > 0 && status === "online" },
    { label: "Match dibuat", done: (matches.data?.length ?? 0) > 0 && status === "online" },
    { label: "Overlay OBS dikonfigurasi", done: true, note: "Buat URL di Overlay Manager → pasang di OBS" },
    { label: "Laptop produksi tersambung (scrcpy + OBS)", done: false, note: "Panduan: documentation/OBS_SETUP.md" },
    { label: "AI Observer terhubung (opsional)", done: false, note: "Cek menu AI Observer" },
    { label: "Broadcast diuji", done: false, note: "Broadcast Control" },
    { label: "Hasil pertama dipublikasikan", done: (standings.data?.publishedMatchCount ?? 0) > 0 && status === "online" },
    { label: "Turnamen dipublikasikan (status aktif)", done: tournament?.status === "active" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Pengaturan &amp; Setup Wizard</h1>
      <p className="mt-1 text-sm font-semibold text-zb-black/60">
        Progres konfigurasi sistem — {doneCount}/{steps.length} langkah selesai.
      </p>

      <BoCard className="mt-4 bg-white p-5">
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm font-bold">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-zb-black/30" />
              )}
              <span>
                {i + 1}. {s.label}
                {s.note ? <span className="ml-1 text-xs font-semibold text-zb-black/40">— {s.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </BoCard>

      <BoCard className="mt-4 bg-zb-black p-5 text-white">
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
          <BoBadge className="bg-zb-yellow text-zb-black">Info</BoBadge> ID turnamen aktif:{" "}
          <code>{tid ?? "-"}</code> · project: <code>{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</code>
        </p>
      </BoCard>
    </div>
  );
}

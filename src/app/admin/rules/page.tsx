"use client";
// Admin → Tournament Rules — seluruh peraturan lomba (sumber: Juknis BOF).
import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import { BoCard } from "@/components/common/bo";
import { PageHead } from "@/components/disciplinary/ui";
import { TOURNAMENT_RULES } from "@/lib/disciplinary";

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHead
        kicker="Disiplin · Sumber Aturan"
        title="Tournament Rules"
        desc="Seluruh peraturan lomba sesuai dokumen JUKNIS LOMBA FREE FIRE — BATTLE OFF FRIENDS (Rabu, 18 November 2026). Konfigurasi sanksi default modul disiplin dibangun dari dokumen ini dan tidak boleh bertentangan dengannya."
      >
        <Link href="/rules" className="bo-btn bo-btn-cyan">
          <ExternalLink className="h-4 w-4" /> Halaman Peserta
        </Link>
        <Link href="/admin/penalty-config" className="bo-btn bo-btn-white">
          Konfigurasi Sanksi
        </Link>
      </PageHead>

      <BoCard className="fs-cut border-fs-fire/40 bg-fs-fire/5 p-4">
        <p className="flex items-start gap-2 text-sm font-semibold text-fs-text">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-fs-fire" />
          Prinsip modul: tidak ada sanksi tanpa alasan, tidak ada pengurangan poin tanpa catatan,
          tidak ada diskualifikasi tanpa keputusan tercatat, dan tidak ada perubahan leaderboard
          tanpa audit log. Laporan PENDING/UNDER_REVIEW <strong>tidak</strong> mengubah poin.
        </p>
      </BoCard>

      {TOURNAMENT_RULES.map((g) => (
        <BoCard key={g.id} className="fs-cut p-5">
          <h2 className="mb-3 font-display text-lg font-black uppercase tracking-wide text-fs-gold">{g.title}</h2>
          <ul className="space-y-2">
            {g.items.map((it, i) => (
              <li key={i} className="text-sm font-semibold leading-relaxed text-fs-text">
                <span className="mr-2 inline-block h-1.5 w-1.5 bg-fs-fire align-middle" />
                {it.text}
                {it.sub ? (
                  <span className="mt-2 grid gap-1 sm:grid-cols-3">
                    {it.sub.flat().map((cell, j) => (
                      <span key={j} className="border border-fs-edge bg-fs-panel/60 px-2 py-1 text-[12px] font-bold text-fs-muted">{cell}</span>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </BoCard>
      ))}

      <BoCard className="fs-cut p-5">
        <h2 className="mb-2 font-display text-lg font-black uppercase text-fs-gold">G. Pelanggaran &amp; Sanksi</h2>
        <p className="text-sm font-semibold text-fs-text">
          Sanksi lengkap per kategori dikelola di <Link href="/admin/penalty-config" className="text-fs-cyan underline">Penalty Configuration</Link>
          {" "}dengan nilai default dari juknis §G (teaming −20/−40, cheat/joki diskualifikasi, mengintip −10,
          bagi-bagi room −10, ribut bertingkat 0/−5/−10, kasar 0/−5/−10, tanpa SS dan terlambat = poin match 0).
        </p>
      </BoCard>
    </div>
  );
}

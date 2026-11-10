"use client";
// Halaman publik peserta — peraturan lomba (juknis) + ringkasan sanksi.
import Link from "next/link";
import { ShieldAlert, Trophy } from "lucide-react";
import { BoCard, BoCardLg } from "@/components/common/bo";
import { TOURNAMENT_RULES } from "@/lib/disciplinary";

export default function PublicRulesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BoCardLg className="fs-cut p-6 sm:p-8">
        <span className="bo-kicker mb-2 inline-block">Informasi Peserta</span>
        <h1 className="font-display text-3xl font-black uppercase leading-tight sm:text-4xl">
          Peraturan <span className="text-fs-fire">Lomba</span> Free Fire
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-fs-muted">
          Battle Off Friends — Mode Battle Royale Squad (Custom Room) · Rabu, 18 November 2026.
          Sumber resmi: Juknis Lomba Free Fire BOF. Baca sebelum bertanding — sanksi pelanggaran
          mengurangi poin tim sesuai ketentuan di bawah.
        </p>
      </BoCardLg>

      {TOURNAMENT_RULES.map((g) => (
        <BoCard key={g.id} className="fs-cut p-5 sm:p-6">
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

      <BoCard className="fs-cut border-fs-fire/40 bg-fs-fire/5 p-5 sm:p-6">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-black uppercase text-fs-gold">
          <ShieldAlert className="h-5 w-5 text-fs-fire" /> Pelanggaran & Sanksi (Ringkasan)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="bg-fs-head text-white">
                <th className="border border-white/20 px-3 py-2 text-left font-display text-xs font-black uppercase">Pelanggaran</th>
                <th className="border border-white/20 px-3 py-2 text-left font-display text-xs font-black uppercase">Sanksi</th>
              </tr>
            </thead>
            <tbody className="font-semibold text-fs-text">
              {[
                ["Teaming / kerja sama antar tim (kedua tim terlibat)", "Kill hasil teaming dihapus + −20 poin per match · ulang −40 · berat/berulang: diskualifikasi"],
                ["Cheat, hack, bug, atau joki", "Diskualifikasi dan poin dihapus"],
                ["Mengintip / dibantu pihak luar", "−10 poin per kejadian"],
                ["Membagikan ID/password room", "−10 poin · berat: dikeluarkan dari lomba"],
                ["Terlalu ribut / mengganggu ketertiban", "Peringatan 1 (lisan) · ke-2 −5 poin · ke-3 −10 poin · lanjut: dikeluarkan dari match"],
                ["Perkataan kasar / provokasi", "Peringatan · berikutnya −5 poin · berulang −10 poin"],
                ["Tidak mengirim SS hasil match", "Poin match tersebut 0"],
                ["Terlambat lebih dari 10 menit", "Poin match tersebut 0"],
              ].map(([a, b], i) => (
                <tr key={i} className="border-b border-fs-edge/50">
                  <td className="border border-fs-edge/40 px-3 py-2">{a}</td>
                  <td className="border border-fs-edge/40 px-3 py-2 text-fs-gold">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] font-semibold text-fs-muted">
          Panitia berhak menurunkan poin atau mendiskualifikasi tim yang terbukti curang. Tim yang
          dikenai sanksi berhak meminta penjelasan melalui ketua tim. Keputusan panitia final;
          keberatan disampaikan sopan oleh ketua tim setelah match selesai.
        </p>
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-black uppercase text-fs-gold">
          <Trophy className="h-5 w-5" /> Penghargaan
        </h2>
        <p className="text-sm font-semibold text-fs-text">
          Juara 1, Juara 2, Juara 3 (total poin) · Kill Terbanyak · Fair Play Award (tim paling sportif dan tertib).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/leaderboard" className="bo-btn bo-btn-cyan">Lihat Klasemen</Link>
          <Link href="/" className="bo-btn bo-btn-white">Beranda</Link>
        </div>
      </BoCard>
    </div>
  );
}

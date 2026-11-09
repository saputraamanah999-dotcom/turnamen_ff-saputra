"use client";
// /about — tentang platform
import { BoCard } from "@/components/common/bo";
import { ORG } from "@/lib/constants";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <span className="bo-kicker mb-2 inline-block bg-zb-purple">Tentang</span>
      <h1 className="bo-title mb-6">ZEROID ESPORTS</h1>

      <BoCard className="bg-fs-panel p-6 leading-relaxed">
        <p className="text-base font-semibold">
          ZEROID ESPORTS adalah platform manajemen turnamen esports Free Fire, leaderboard
          realtime, dan sistem broadcast profesional yang dirancang khusus untuk panggung
          esports tingkat sekolah — <strong>{ORG.tournament}</strong> yang diselenggarakan oleh{" "}
          <strong>{ORG.institution}</strong>.
        </p>
        <p className="mt-4">
          Platform ini menggabungkan sistem kontrol turnamen, dashboard siaran langsung,
          leaderboard realtime, dan asisten observer berbasis AI lokal. Semua infrastruktur
          mengikuti prinsip <strong>free-first</strong>: Firebase Spark plan (tanpa Cloud
          Functions dan tanpa billing), OBS Studio, scrcpy untuk mirroring, dan MediaMTX untuk
          streaming lokal sekolah — tanpa API berbayar dan tanpa kartu kredit.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="bo-card-flat bg-fs-bg p-4">
            <p className="font-display text-sm font-black uppercase">Turnamen</p>
            <p className="mt-1 text-sm font-semibold text-fs-text/70">{ORG.tournament}</p>
          </div>
          <div className="bo-card-flat bg-fs-bg p-4">
            <p className="font-display text-sm font-black uppercase">Institusi</p>
            <p className="mt-1 text-sm font-semibold text-fs-text/70">{ORG.institution}</p>
          </div>
          <div className="bo-card-flat bg-fs-bg p-4">
            <p className="font-display text-sm font-black uppercase">Developer</p>
            <p className="mt-1 text-sm font-semibold text-fs-text/70">{ORG.developer}</p>
          </div>
          <div className="bo-card-flat bg-fs-bg p-4">
            <p className="font-display text-sm font-black uppercase">Sistem Poin</p>
            <p className="mt-1 text-sm font-semibold text-fs-text/70">
              Resmi BOF: placement 20/17/15/…/0 + 2 poin per kill, dengan tiebreaker resmi.
            </p>
          </div>
        </div>
        <p className="mt-6 text-sm font-semibold text-fs-text/60">
          Prinsip kejujuran data: seluruh statistik publik dihitung hanya dari hasil resmi yang
          dipublikasikan panitia. Event AI hanya merupakan indikasi berbobot confidence dan
          tidak pernah mengubah skor resmi secara otomatis.
        </p>
      </BoCard>
    </div>
  );
}

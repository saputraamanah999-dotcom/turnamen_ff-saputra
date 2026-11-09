"use client";
// /admin/scoring — konfigurasi sistem poin (resmi BOF terkunci)
import { BoBadge, BoCard, BoButton } from "@/components/common/bo";
import { OFFICIAL_KILL_POINT, OFFICIAL_PLACEMENT_POINTS, SCORING_VERSION } from "@/lib/constants";

export default function AdminScoringPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Sistem Poin BOF</h1>
      <p className="mt-1 text-sm font-semibold text-zb-black/60">
        Aturan resmi versi {SCORING_VERSION} — tidak dapat diubah dari aplikasi.
      </p>

      <BoCard className="mt-4 bg-white p-5">
        <h2 className="font-display text-lg font-black uppercase">Poin Placement</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {OFFICIAL_PLACEMENT_POINTS.map((pts, i) => (
            <div key={i} className="bo-card-flat bg-zb-off px-3 py-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zb-black/50">Rank {i + 1}</p>
              <p className="font-display text-2xl font-black tabular-nums">{pts}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-6 font-display text-lg font-black uppercase">Poin Kill</h2>
        <p className="mt-2 text-sm font-bold">
          <span className="font-display text-3xl font-black tabular-nums">{OFFICIAL_KILL_POINT}</span> poin per kill
        </p>
        <p className="mt-1 text-sm font-semibold text-zb-black/60">
          Formula: MATCH POINTS = PLACEMENT POINTS + (KILLS × {OFFICIAL_KILL_POINT})
        </p>

        <h2 className="mt-6 font-display text-lg font-black uppercase">Tiebreaker Resmi</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-semibold">
          <li>Total poin akumulasi tertinggi.</li>
          <li>Placement points tertinggi.</li>
          <li>Placement lebih baik pada game terakhir sesuai format (BO7 → game 7, BO5 → game 5, BO3 → game 3).</li>
        </ol>
        <p className="mt-2 text-sm font-semibold text-zb-black/60">
          Jika game terakhir belum selesai → klasemen bersifat sementara. Jika masih seri →
          ditandai <strong>perlu review manual panitia</strong> (ikon pada leaderboard publik) dan
          tidak diputuskan otomatis oleh sistem.
        </p>
      </BoCard>

      <BoCard className="mt-4 bg-zb-yellow p-5">
        <p className="flex items-start gap-2 text-sm font-bold">
          <BoBadge className="bg-zb-black text-white">Terkunci</BoBadge>
          Perubahan aturan skor resmi hanya boleh dilakukan super administrator secara manual
          (dokumen scoringConfigurations), dan setiap match menyimpan versi aturan yang dipakai
          agar hasil historis tetap dapat direproduksi.
        </p>
        <div className="mt-3">
          <BoButton variant="black" onClick={() => window.open("/documentation", "_self")} disabled>
            Pengaturan lanjutan (superadmin)
          </BoButton>
        </div>
      </BoCard>
    </div>
  );
}

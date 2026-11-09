"use client";
// /live — pilih turnamen aktif
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BoCard } from "@/components/common/bo";
import { EmptyState } from "@/components/common/stat";
import { useActiveTournament, useCollection } from "@/services/firestore/hooks";
import type { Tournament } from "@/lib/types";

export default function LiveIndexPage() {
  const router = useRouter();
  const { tournament, status } = useActiveTournament();
  const all = useCollection<Tournament>("tournaments", { fallback: () => [] });

  useEffect(() => {
    if (tournament) router.replace(`/live/${tournament.id}`);
     
  }, [tournament?.id]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="bo-title mb-6">Live</h1>
      {status === "online" && all.data && all.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {all.data.map((t) => (
            <Link key={t.id} href={`/live/${t.id}`} className="bo-card bo-press bg-white p-5">
              <p className="font-display text-lg font-black uppercase">{t.name}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-zb-black/50">
                {t.institution} · Format {t.format}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Belum ada turnamen aktif"
          description="Panitia belum membuat atau mengaktifkan turnamen. Setelah dibuat di panel admin, halaman live akan tersedia di sini."
        />
      )}
      {status === "offline" ? (
        <BoCard className="mt-6 bg-zb-yellow p-4 text-sm font-bold">
          Database belum terhubung — pastikan Firebase sudah ter-seed (lihat Panduan).
        </BoCard>
      ) : null}
    </div>
  );
}

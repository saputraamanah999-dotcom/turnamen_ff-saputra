// /display — TV Display Mode (tanpa navigasi, full broadcast layout).
// Lengkap: /display memakai turnamen aktif; /display/:tournamentId memakai
// turnamen tertentu. Optimal 1920×1080 · 1600×900 · 1280×720 (16:9).
import { TvDisplayPage } from "@/components/broadcast/tv-display";

export const metadata = {
  title: "TV Display — Battle Off Friends",
  robots: { index: false },
};

export default function Page() {
  return <TvDisplayPage />;
}

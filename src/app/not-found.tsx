import Link from "next/link";
import { Home, ShieldQuestion, Zap } from "lucide-react";

// Halaman 404 branded STIKAR — pengunjung yang salah alamat tetap
// diarahkan ke konten yang benar.
export default function NotFound() {
  return (
    <div className="bo-grid-bg flex min-h-[70vh] flex-col items-center justify-center px-4 py-16">
      <div className="bo-card-lg zb-rise w-full max-w-md bg-fs-panel p-8 text-center">
        <span className="bo-kicker inline-block bg-zb-purple">Error 404</span>
        <div className="mt-4 flex items-center justify-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center border border-fs-edge bg-zb-blue text-white bo-shadow">
            <ShieldQuestion className="h-7 w-7" />
          </span>
          <p className="font-display text-5xl font-black tracking-tight">404</p>
        </div>
        <h1 className="mt-4 font-display text-xl font-black uppercase">
          Halaman Tidak Ditemukan
        </h1>
        <p className="mt-2 text-sm font-semibold text-fs-text/60">
          Alamat yang kamu buka tidak ada di platform STIKAR ESPORTS. Mungkin salah ketik
          atau halamannya sudah dipindahkan.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="bo-btn bo-btn-primary justify-center"
          >
            <Home className="h-4 w-4" /> Ke Beranda
          </Link>
          <Link href="/leaderboard" className="bo-btn bo-btn-white justify-center">
            <Zap className="h-4 w-4" /> Leaderboard
          </Link>
        </div>
      </div>
    </div>
  );
}

// Layout untuk semua halaman publik: Navbar sticky + Footer.
// Sebelumnya Navbar/Footer ada di kode tapi tidak pernah di-mount —
// seluruh situs publik berjalan tanpa navigasi.
import { Footer, Navbar } from "@/components/navigation/navbar";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zb-off">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

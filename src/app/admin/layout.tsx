"use client";
// ============================================================
// ZEROID ESPORTS — Shell Admin (guard auth + sidebar)
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Boxes, CalendarRange, ClipboardList, Clapperboard, Cpu, ExternalLink,
  Gauge, LayoutDashboard, ListOrdered, ListVideo, LogOut, Map, Menu, MonitorPlay,
  Radio, ScrollText, Settings, ShieldCheck, Siren, Sparkles, Trophy, Users, Wifi, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BoButton } from "@/components/common/bo";
import { useAdminSession } from "@/services/auth/admin";
import { AdminLoginForm } from "@/components/admin/login-form";

// Sidebar dikelompokkan per domain kerja (master prompt §9).
const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: typeof Trophy }[] }[] = [
  {
    label: "Turnamen",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
      { href: "/admin/teams", label: "Tim", icon: Boxes },
      { href: "/admin/players", label: "Pemain", icon: Users },
      { href: "/admin/matches", label: "Match", icon: CalendarRange },
      { href: "/admin/scoring", label: "Sistem Poin", icon: ClipboardList },
      { href: "/admin/leaderboard", label: "Klasemen", icon: ListOrdered },
      { href: "/admin/statistics", label: "Statistik", icon: BarChart3 },
    ],
  },
  {
    label: "Broadcast",
    items: [
      { href: "/admin/live-control", label: "Live Control", icon: ListVideo },
      { href: "/admin/broadcast", label: "Broadcast", icon: Radio },
      { href: "/admin/overlay", label: "Overlay Manager", icon: Gauge },
      { href: "/admin/presentation", label: "Presentasi TV", icon: MonitorPlay },
      { href: "/admin/rehearsal", label: "Rehearsal", icon: Clapperboard },
      { href: "/admin/emergency", label: "Emergency", icon: Siren },
      { href: "/admin/local-network", label: "Local Network", icon: Wifi },
    ],
  },
  {
    label: "AI Observer",
    items: [
      { href: "/admin/observer", label: "AI Observer", icon: Cpu },
      { href: "/admin/ai-results", label: "AI Results", icon: Sparkles },
      { href: "/admin/map-history", label: "Map History", icon: Map },
    ],
  },
  {
    label: "Sistem",
    items: [
      { href: "/admin/audit", label: "Audit Logs", icon: ScrollText },
      { href: "/admin/settings", label: "Pengaturan", icon: Settings },
      { href: "/admin/documentation", label: "Dokumentasi", icon: ExternalLink },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = useAdminSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Login form (Firebase Auth email/password)
  if (!session.user) {
    return <AdminLoginForm roleLoaded={session.roleLoaded} />;
  }

  // Belum punya peran admin → tampilkan pesan jujur.
  if (session.roleLoaded && !session.role) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="bo-card-lg max-w-md bg-white p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-zb-purple" />
          <h1 className="mt-3 font-display text-2xl font-black uppercase">Akses Ditolak</h1>
          <p className="mt-2 text-sm font-semibold text-zb-black/60">
            Akun <strong>{session.user.email}</strong> belum terdaftar sebagai admin di
            koleksi <code>adminRoles</code>. Minta super administrator menambahkan peran
            melalui script seeding atau Firebase Console.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <BoButton variant="black" onClick={() => session.logout()}>
              <LogOut className="h-4 w-4" /> Keluar
            </BoButton>
            <Link href="/"><BoButton variant="white">Beranda</BoButton></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zb-off">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r-[3px] border-zb-black bg-white lg:flex">
        <SidebarContent pathname={pathname} session={session} />
      </aside>

      {/* Konten */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b-[3px] border-zb-black bg-white px-4 lg:hidden">
          <p className="font-display font-black uppercase">ZEROID Admin</p>
          <button className="flex h-10 w-10 items-center justify-center border-[3px] border-zb-black" onClick={() => setOpen(!open)} aria-label="Menu admin">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {open ? (
          <nav className="border-b-[3px] border-zb-black bg-white px-3 py-3 lg:hidden">
            <SidebarContent pathname={pathname} session={session} onNavigate={() => setOpen(false)} vertical />
          </nav>
        ) : null}
        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  session,
  onNavigate,
  vertical,
}: {
  pathname: string;
  session: { role: string | null; user: { email?: string | null } | null; logout: () => Promise<void> };
  onNavigate?: () => void;
  vertical?: boolean;
}) {
  return (
    <div className={cn("flex h-full flex-col", vertical ? "" : "p-3")}>
      <Link href="/admin" className={cn("flex items-center gap-2 border-[3px] border-zb-black bg-zb-black px-3 py-3 text-white", vertical ? "mb-3" : "mb-4")} onClick={onNavigate}>
        <LayoutDashboard className="h-5 w-5" />
        <span className="font-display text-sm font-black uppercase tracking-wider">Panel Admin BOF</span>
      </Link>
      <nav className={cn("thin-scroll flex-1 space-y-1 overflow-y-auto", vertical ? "" : "")} aria-label="Menu admin">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="px-2 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.18em] text-zb-black/40">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 border-[3px] px-3 py-1.5 text-sm font-bold transition-all",
                    active
                      ? "border-zb-black bg-zb-yellow bo-shadow-sm"
                      : "border-transparent hover:border-zb-black hover:bg-zb-off",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className={cn("border-t-[3px] border-zb-black pt-3", vertical ? "mt-3" : "mt-4")}>
        <p className="truncate px-1 text-xs font-bold text-zb-black/60">{session.user?.email ?? "admin"}</p>
        <p className="px-1 text-[10px] font-black uppercase tracking-widest text-zb-purple">{session.role}</p>
        <div className="mt-2 flex gap-2">
          <Link href="/" className="bo-btn bo-btn-white flex-1 !px-2 !py-1.5 !text-[11px]">
            Situs
          </Link>
          <button onClick={() => session.logout()} className="bo-btn bo-btn-black flex-1 !px-2 !py-1.5 !text-[11px]">
            <LogOut className="h-3.5 w-3.5" /> Keluar
          </button>
        </div>
      </div>
    </div>
  );
}

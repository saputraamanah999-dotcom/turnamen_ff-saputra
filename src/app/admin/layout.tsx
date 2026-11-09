"use client";
// ============================================================
// STIKAR ESPORTS — Shell Admin FIRESTORM (PHASE 2 §4)
// Sidebar bergrup dengan collapse/expand + tooltip, drawer mobile,
// topbar status siaran realtime + Notification Center, akun admin.
// Menu & fungsi lama 100% dipertahankan.
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Boxes, CalendarRange, ChevronLeft, Clapperboard, ClipboardList, Cpu, ExternalLink,
  Gauge, LayoutDashboard, ListOrdered, ListVideo, LogOut, Map, Menu, MonitorPlay,
  Radio, ScrollText, Settings, ShieldCheck, Siren, Sparkles, Trophy, Users, Wifi, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BoButton } from "@/components/common/bo";
import { useAdminSession } from "@/services/auth/admin";
import { AdminLoginForm } from "@/components/admin/login-form";
import {
  CATEGORY_LABEL, NotificationCenterProvider, useNotifications, type NotifyCategory,
} from "@/components/broadcast/notification-center";
import { useActiveTournament, useBroadcast } from "@/services/firestore/hooks";
import type { BroadcastState } from "@/lib/types";

// Sidebar dikelompokkan per domain kerja.
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

// Alias ikon tak terpakai lagi — dihapus.

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = useAdminSession();
  if (!session.user) return <AdminLoginForm roleLoaded={session.roleLoaded} />;

  if (session.roleLoaded && !session.role) {
    return (
      <div className="fs-arena-bg flex min-h-screen items-center justify-center px-4">
        <div className="bo-card-lg max-w-md p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-fs-cyan" />
          <h1 className="mt-3 font-display text-2xl font-bold uppercase">Akses Ditolak</h1>
          <p className="mt-2 text-sm font-semibold text-fs-muted">
            Akun <strong className="text-fs-text">{session.user.email}</strong> belum terdaftar sebagai admin di
            koleksi <code>adminRoles</code>. Minta super administrator menambahkan peran
            melalui halaman setup atau Firebase Console.
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
    <NotificationCenterProvider>
      <AdminShell session={session}>{children}</AdminShell>
    </NotificationCenterProvider>
  );
}

/* ================= Status pill siaran (dari Firestore — NYATA) ================= */
const STATE_STYLE: Record<BroadcastState, { label: string; cls: string; dot: string }> = {
  offline: { label: "OFFLINE", cls: "border-fs-edge text-fs-muted", dot: "bg-fs-muted/50" },
  preparing: { label: "PREPARING", cls: "border-fs-cyan/50 text-fs-cyan", dot: "bg-fs-cyan fs-connecting" },
  ready: { label: "READY", cls: "border-fs-cyan/50 text-fs-cyan", dot: "bg-fs-cyan" },
  connecting: { label: "CONNECTING", cls: "border-fs-gold/50 text-fs-gold", dot: "bg-fs-gold fs-connecting" },
  starting: { label: "STARTING", cls: "border-fs-gold/60 text-fs-gold", dot: "bg-fs-gold fs-connecting" },
  live: { label: "LIVE", cls: "border-fs-err/70 text-fs-err bg-fs-err/10", dot: "bg-fs-err" },
  paused: { label: "PAUSED", cls: "border-fs-gold/50 text-fs-gold", dot: "bg-fs-gold" },
  reconnecting: { label: "RECONNECTING", cls: "border-fs-gold/60 text-fs-gold", dot: "bg-fs-gold fs-connecting" },
  error: { label: "ERROR", cls: "border-fs-err/70 text-fs-err bg-fs-err/10", dot: "bg-fs-err" },
  stopping: { label: "STOPPING", cls: "border-fs-muted/60 text-fs-muted", dot: "bg-fs-muted fs-connecting" },
};

function LiveStatePill({ className }: { className?: string }) {
  const { tournament } = useActiveTournament();
  const broadcast = useBroadcast(tournament?.id ?? null);
  const state = broadcast.data?.live?.state ?? "offline";
  const s = STATE_STYLE[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 border px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.2em]",
        s.cls,
        state === "live" && "fs-live-badge",
        className,
      )}
    >
      <span className={cn("inline-block h-2 w-2 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/* ================= Notification bell ================= */
function BellButton() {
  const { unread, items, filter, setFilter, markAllRead, clear } = useNotifications();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
        className="relative flex h-9 w-9 items-center justify-center border border-fs-edge text-fs-muted transition hover:border-fs-fire hover:text-fs-fire"
        aria-label="Notifikasi admin"
      >
        <Radio className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-fs-err px-1 text-[9px] font-black text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-80 border border-fs-edge bg-[#0C1117] shadow-[0_16px_40px_rgba(0,0,0,.6)] sm:w-96">
          <div className="flex items-center justify-between border-b border-fs-edge px-3 py-2">
            <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-fs-gold">Notification Center</p>
            <div className="flex gap-1">
              <button onClick={clear} className="text-[10px] font-bold uppercase text-fs-muted hover:text-fs-err">Bersihkan</button>
              <button onClick={() => setOpen(false)} className="ml-2 text-fs-muted hover:text-fs-text" aria-label="Tutup notifikasi"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="flex gap-1 border-b border-fs-edge px-2 py-1.5">
            {(Object.keys(CATEGORY_LABEL) as (NotifyCategory | "all")[]).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={cn(
                  "px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition",
                  filter === c ? "bg-fs-fire text-white" : "text-fs-muted hover:text-fs-text",
                )}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="thin-scroll max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-fs-muted">
                Belum ada notifikasi — event nyata (server, OBS, siaran) akan muncul di sini.
              </p>
            ) : items
              .filter((i) => filter === "all" || i.category === filter)
              .map((i) => (
                <div key={i.id} className="flex items-start gap-2 border-b border-fs-edge/50 px-3 py-2 hover:bg-white/[0.03]">
                  <span className={cn(
                    "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                    i.category === "streaming" ? "bg-fs-err" : i.category === "network" ? "bg-fs-cyan" : i.category === "obs" ? "bg-fs-flame" : i.category === "overlay" ? "bg-fs-gold" : "bg-fs-ok",
                  )} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-snug text-fs-text">{i.message}</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-fs-muted">
                      {CATEGORY_LABEL[i.category]} · {new Date(i.at).toLocaleTimeString("id-ID")}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ================= Shell ================= */
function AdminShell({
  children,
  session,
}: {
  children: React.ReactNode;
  session: { role: string | null; user: { email?: string | null; uid?: string } | null; logout: () => Promise<void> };
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Drawer ditutup lewat onNavigate tiap Link (§4) — tanpa efek setState.

  return (
    <div className="fs-arena-bg flex min-h-screen">
      {/* Sidebar desktop — collapsible */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-fs-edge bg-fs-char/80 backdrop-blur lg:flex",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <SidebarContent pathname={pathname} session={session} collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="absolute -right-3 top-16 hidden h-6 w-6 items-center justify-center border border-fs-edge bg-fs-panel text-fs-muted hover:text-fs-fire lg:flex"
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
        >
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>

      {/* Drawer mobile */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDrawer(false)} aria-hidden />
          <nav className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-fs-edge bg-fs-char shadow-2xl">
            <button
              onClick={() => setDrawer(false)}
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center border border-fs-edge text-fs-muted hover:text-fs-err"
              aria-label="Tutup menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent pathname={pathname} session={session} onNavigate={() => setDrawer(false)} />
          </nav>
        </div>
      ) : null}

      {/* Konten */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-fs-edge bg-fs-bg/85 px-3 backdrop-blur sm:px-5">
          <div className="flex items-center gap-3">
            <button
              className="flex h-9 w-9 items-center justify-center border border-fs-edge text-fs-text lg:hidden"
              onClick={() => setDrawer(true)}
              aria-label="Buka menu admin"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
            <p className="hidden font-display text-sm font-bold uppercase tracking-[0.18em] text-fs-muted sm:block">
              Control Room
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <LiveStatePill />
            <BellButton />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

/* ================= Sidebar content ================= */
function SidebarContent({
  pathname,
  session,
  onNavigate,
  collapsed = false,
}: {
  pathname: string;
  session: { role: string | null; user: { email?: string | null } | null; logout: () => Promise<void> };
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <Link href="/admin" onClick={onNavigate} className="group relative block border-b border-fs-edge px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="fs-cut-sm flex h-10 w-10 shrink-0 items-center justify-center bg-gradient-to-br from-fs-fire to-fs-flame font-display text-lg font-black text-white shadow-[0_0_18px_rgba(255,90,31,.4)]">
            Z
          </span>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="font-display text-sm font-black uppercase leading-none tracking-[0.14em]">
                STIKAR <span className="text-fs-fire">ESPORTS</span>
              </p>
              <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.22em] text-fs-muted">
                Battle Off Friends
              </p>
            </div>
          ) : null}
        </div>
      </Link>

      {/* Menu */}
      <nav className={cn("thin-scroll flex-1 overflow-y-auto px-2 py-3", collapsed && "px-1.5")} aria-label="Menu admin">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed ? (
              <p className="px-2.5 pb-1.5 text-[9.5px] font-black uppercase tracking-[0.26em] text-fs-muted/70">
                {group.label}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-8 bg-fs-edge" aria-hidden />
            )}
            {group.items.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative mb-0.5 flex items-center gap-2.5 px-2.5 py-2 text-[13px] font-bold transition-all",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-gradient-to-r from-fs-fire/20 to-transparent text-fs-text"
                      : "text-fs-muted hover:bg-white/[0.04] hover:text-fs-text",
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-fs-fire to-fs-flame shadow-[0_0_10px_rgba(255,90,31,.6)]" aria-hidden />
                  ) : null}
                  <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-fs-fire" : "group-hover:text-fs-flame")} />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  {collapsed && active ? (
                    <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap border border-fs-edge bg-fs-panel px-2 py-1 text-[11px] font-bold text-fs-text opacity-0 shadow-xl transition group-hover:opacity-100">
                      {item.label}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Akun */}
      <div className="border-t border-fs-edge px-3 py-3">
        {!collapsed ? (
          <>
            <p className="truncate text-xs font-bold text-fs-text">{session.user?.email ?? "admin"}</p>
            <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-fs-flame">{session.role}</p>
          </>
        ) : null}
        <div className={cn("mt-2 flex gap-2", collapsed && "flex-col")}>
          <Link href="/" className="bo-btn bo-btn-white flex-1 !px-2 !py-1.5 !text-[11px]">
            {collapsed ? <ExternalLink className="h-3.5 w-3.5" /> : "Situs"}
          </Link>
          <button onClick={() => session.logout()} className="bo-btn bo-btn-black flex-1 !px-2 !py-1.5 !text-[11px]">
            <LogOut className="h-3.5 w-3.5" /> {!collapsed ? "Keluar" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";
// ============================================================
// ZEROID ESPORTS — Navigasi utama
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORG } from "@/lib/constants";

const NAV = [
  { href: "/", label: "Beranda" },
  { href: "/live", label: "Live" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/teams", label: "Tim" },
  { href: "/matches", label: "Jadwal" },
  { href: "/awards", label: "Penghargaan" },
  { href: "/statistics", label: "Statistik" },
  { href: "/guide", label: "Panduan" },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-fs-edge bg-fs-panel">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Beranda ZEROID ESPORTS">
          <span className="flex h-10 w-10 items-center justify-center border border-fs-edge bg-zb-blue text-white bo-shadow-sm">
            <Zap className="h-5 w-5" strokeWidth={2.75} />
          </span>
          <span className="leading-none">
            <span className="block font-display text-lg font-black tracking-tight">
              ZEROID <span className="text-zb-blue">ESPORTS</span>
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-fs-text/60">
              {ORG.tournament} · {ORG.institution}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigasi utama">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "border-[3px] px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-all",
                  active
                    ? "border-fs-edge bg-zb-yellow text-fs-ink bo-shadow-sm"
                    : "border-transparent hover:border-fs-edge hover:bg-fs-bg",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/admin"
            className="bo-btn bo-btn-black ml-2 !px-3 !py-1.5 !text-xs"
          >
            Admin
          </Link>
        </nav>

        <button
          className="flex h-11 w-11 items-center justify-center border border-fs-edge bg-fs-panel lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Tutup menu" : "Buka menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <nav
          className="border-t border-fs-edge bg-fs-panel px-4 py-3 lg:hidden"
          aria-label="Navigasi seluler"
        >
          <div className="flex flex-col gap-1.5">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "border-[3px] px-3 py-2.5 text-sm font-bold uppercase",
                  (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
                    ? "border-fs-edge bg-zb-yellow"
                    : "border-fs-edge/10 bg-fs-panel",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="bo-btn bo-btn-black mt-1 justify-center"
            >
              Panel Admin
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-fs-edge bg-fs-head text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <p className="font-display text-xl font-black tracking-tight">
            ZEROID <span className="text-zb-cyan">ESPORTS</span>
          </p>
          <p className="mt-2 text-sm text-white/70">
            {ORG.tournament} · {ORG.institution}
          </p>
          <p className="mt-1 text-xs text-white/40">
            Infrastruktur gratis-first: Firebase Spark, OBS Studio, scrcpy, MediaMTX.
          </p>
        </div>
        <div className="text-sm">
          <p className="bo-kicker mb-3 inline-block bg-zb-purple">Tautan</p>
          <ul className="mt-1 space-y-1.5 font-bold">
            <li><Link className="hover:text-zb-cyan" href="/live">Live Match</Link></li>
            <li><Link className="hover:text-zb-cyan" href="/leaderboard">Leaderboard</Link></li>
            <li><Link className="hover:text-zb-cyan" href="/results">Hasil</Link></li>
            <li><Link className="hover:text-zb-cyan" href="/awards">Penghargaan</Link></li>
            <li><Link className="hover:text-zb-cyan" href="/display">Display TV</Link></li>
            <li><Link className="hover:text-zb-cyan" href="/guide">Panduan Operator</Link></li>
            <li><Link className="hover:text-zb-cyan" href="/about">Tentang</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="bo-kicker mb-3 inline-block bg-zb-yellow text-fs-ink">Kredit</p>
          <p className="mt-1 font-display text-lg font-black uppercase">
            Designed &amp; Developed by
          </p>
          <p className="text-zb-yellow font-black">{ORG.developer}</p>
          <p className="mt-3 text-xs text-white/40">
            © {new Date().getFullYear()} ZEROID ESPORTS. Semua statistik dihitung dari hasil resmi yang dipublikasikan panitia.
          </p>
        </div>
      </div>
    </footer>
  );
}

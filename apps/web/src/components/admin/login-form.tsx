"use client";
// ============================================================
// ZEROID ESPORTS — Form login admin (Firebase Auth email/password)
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, LogIn, ShieldAlert } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { adminLogin } from "@/services/auth/admin";
import { ORG } from "@/lib/constants";

export function AdminLoginForm({ roleLoaded }: { roleLoaded: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await adminLogin(email.trim(), password);
      // Redirect ditangani oleh guard di layout.
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
        setError("Email atau password salah.");
      } else if (code.includes("too-many-requests")) {
        setError("Terlalu banyak percobaan. Coba lagi nanti.");
      } else if (code.includes("invalid-email")) {
        setError("Format email tidak valid.");
      } else {
        setError("Gagal masuk. Periksa koneksi dan konfigurasi Firebase Auth.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bo-grid-bg px-4">
      <BoCard className="w-full max-w-md bg-white p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center border-[3px] border-zb-black bg-zb-blue text-white bo-shadow-sm">
            <KeyRound className="h-6 w-6" />
          </span>
          <div>
            <p className="font-display text-xl font-black uppercase leading-none">Panel Admin</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-zb-black/50">
              {ORG.tournament} · {ORG.institution}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-black uppercase tracking-wider">Email Admin</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bo-input"
              placeholder="admin@contoh.id"
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-black uppercase tracking-wider">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bo-input"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error ? (
            <p className="flex items-center gap-2 border-[3px] border-zb-black bg-zb-yellow px-3 py-2 text-xs font-bold">
              <ShieldAlert className="h-4 w-4" /> {error}
            </p>
          ) : null}

          <BoButton type="submit" variant="primary" className="w-full justify-center" disabled={busy}>
            <LogIn className="h-4 w-4" /> {busy ? "Memproses…" : "Masuk"}
          </BoButton>
        </form>

        {!roleLoaded ? (
          <p className="mt-3 text-xs font-bold text-zb-black/50">Memeriksa peran admin…</p>
        ) : null}

        <p className="mt-4 text-[11px] leading-relaxed font-semibold text-zb-black/50">
          Akun pertama dibuat oleh script seeding (lihat <code>documentation/FIREBASE_SETUP.md</code>).
          Hanya akun dengan peran di koleksi <code>adminRoles</code> yang dapat mengakses panel ini.
        </p>

        <Link href="/" className="mt-4 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zb-blue hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke situs
        </Link>
      </BoCard>
    </div>
  );
}

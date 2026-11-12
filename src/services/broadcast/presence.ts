"use client";
// ============================================================
// STIKAR ESPORTS — PRESENCE PENONTON (indikator siapa yang online)
// Koleksi: livePresence/{tid}/viewers/{viewerId}
//   { name, lastSeen: serverTimestamp, clientMs, sinceMs }
// - Setiap halaman penonton (TV /display, /live, halaman interaktif)
//   menulis heartbeat tiap 20 detik (singleton per tab — refcount,
//   komponen mana pun boleh memanggil ensurePresenceHeartbeat) + SEKALI
//   lagi saat tab kembali terlihat (visibilitychange).
// - Dianggap "online" bila heartbeat ≤ 105 detik lalu (tab latar belakang
//   di HP/Chrome dibatasi ±1 tick/menit — 105 dtk menjaga penonton tetap
//   terhitung sampai benar-benar menutup halaman).
// - Tab ditutup → best-effort deleteDoc (pagehide/beforeunload).
// - Admin memakai useLivePresence TANPA heartbeat agar tidak ikut terhitung.
// Nama penonton anonim: "Penonton-XXX" (disimpan di localStorage).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";

export interface PresenceViewer {
  id: string;
  name: string;
  /** epoch ms aktivitas terakhir (clientMs atau lastSeen.toMillis()). */
  ms: number;
}

const FRESH_MS = 105_000;
const TICK_MS = 20_000;

function getViewerId(): string {
  try {
    let id = sessionStorage.getItem("stikar.presence.id");
    if (!id) {
      id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem("stikar.presence.id", id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function getViewerName(): string {
  try {
    let name = localStorage.getItem("stikar.presence.name");
    if (!name) {
      name = `Penonton-${String(100 + Math.floor(Math.random() * 900))}`;
      localStorage.setItem("stikar.presence.name", name);
    }
    return name;
  } catch {
    return "Penonton";
  }
}

// ---------- Heartbeat singleton (per tab, per tid) ----------
type Heartbeat = { refs: number; stop: () => void };
const heartbeats = new Map<string, Heartbeat>();

export function ensurePresenceHeartbeat(tid: string | null | undefined) {
  if (!tid || !db || typeof window === "undefined") return;
  const existing = heartbeats.get(tid);
  if (existing) {
    existing.refs += 1;
    return;
  }
  const vid = getViewerId();
  const name = getViewerName();
  let first = true;
  const write = () => {
    if (!db) return;
    void setDoc(
      doc(db, `livePresence/${tid}/viewers/${vid}`),
      {
        name,
        lastSeen: serverTimestamp(),
        clientMs: Date.now(),
        ...(first ? { sinceMs: Date.now() } : {}),
      },
      { merge: true },
    ).catch(() => { /* offline / rules belum di-deploy — dicoba lagi di tick berikutnya */ });
    first = false;
  };
  write();
  const iv = setInterval(write, TICK_MS);
  // Tab disematukan kembali (dari latar belakang) → tulis SEKARANG supaya
  // penonton tidak sempat "hilang" dari daftar online saat balik membuka layar.
  const onVisible = () => {
    if (document.visibilityState === "visible") write();
  };
  document.addEventListener("visibilitychange", onVisible);
  const leave = () => {
    if (!db) return;
    void deleteDoc(doc(db, `livePresence/${tid}/viewers/${vid}`)).catch(() => { /* abaikan */ });
  };
  window.addEventListener("pagehide", leave);
  window.addEventListener("beforeunload", leave);
  const hb: Heartbeat = {
    refs: 1,
    stop: () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("beforeunload", leave);
      leave();
    },
  };
  heartbeats.set(tid, hb);
}

export function releasePresenceHeartbeat(tid: string | null | undefined) {
  if (!tid) return;
  const hb = heartbeats.get(tid);
  if (!hb) return;
  hb.refs -= 1;
  if (hb.refs <= 0) {
    hb.stop();
    heartbeats.delete(tid);
  }
}

// ---------- Hook pembaca realtime ----------
export function useLivePresence(
  tid: string | null | undefined,
  opts: { heartbeat?: boolean } = {},
): { count: number; viewers: PresenceViewer[]; status: "connecting" | "online" | "offline" } {
  const [raw, setRaw] = useState<{ id: string; name: string; ms: number }[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState<"connecting" | "online" | "offline">("connecting");

  useEffect(() => {
    if (opts.heartbeat) ensurePresenceHeartbeat(tid);
    return () => {
      if (opts.heartbeat) releasePresenceHeartbeat(tid);
    };
  }, [tid, opts.heartbeat]);

  useEffect(() => {
    if (!db || !tid) {
      setStatus("offline");
      return;
    }
    const unsub = onSnapshot(
      collection(db, `livePresence/${tid}/viewers`),
      (snap) => {
        setStatus("online");
        setRaw(
          snap.docs.map((d) => {
            const v = d.data() as { name?: string; lastSeen?: { toMillis?: () => number }; clientMs?: number };
            return {
              id: d.id,
              name: v.name ?? "Penonton",
              ms: v.lastSeen?.toMillis?.() ?? v.clientMs ?? 0,
            };
          }),
        );
      },
      () => setStatus("offline"),
    );
    return () => unsub();
  }, [tid]);

  // Segarkan filter "masih online" tiap 10 detik (dokumen lama terhapus sendiri dari daftar).
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(iv);
  }, []);

  const viewers = useMemo(
    () =>
      raw
        .filter((v) => now - (v.ms || 0) < FRESH_MS)
        .sort((a, b) => b.ms - a.ms),
    [raw, now],
  );

  return { count: viewers.length, viewers, status };
}

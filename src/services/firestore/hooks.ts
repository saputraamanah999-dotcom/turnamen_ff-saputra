"use client";
// ============================================================
// ZEROID ESPORTS — Hooks Firestore realtime dengan fallback offline
// Semua listener onSnapshot; jika Firebase tidak terjangkau
// (contoh: sandbox tanpa akses), status menjadi "offline" dan
// komponen dapat menampilkan DATA DEMO yang diberi label jelas.
// Listener dibatasi & efisien (satu dokumen ringkasan per klasemen).
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type {
  BroadcastSettings,
  Match,
  ObserverEvent,
  PublicLeaderboard,
  Team,
  Tournament,
} from "@/lib/types";
import { demoLeaderboard, demoMatches, demoTournament, demoTeams } from "@/lib/demo-data";

export interface SnapState<T> {
  data: T | null;
  status: "connecting" | "online" | "offline";
  error?: string;
}

const ONLINE_TIMEOUT_MS = 9000;

/** Hook dokumen tunggal realtime. */
export function useDoc<T>(
  path: string | null,
  opts?: { fallback?: () => T | null; disableFallback?: boolean },
): SnapState<T> {
  const [state, setState] = useState<SnapState<T>>({
    data: null,
    status: "connecting",
  });
  const gotSnapshot = useRef(false);

  useEffect(() => {
    gotSnapshot.current = false;
    if (!db || !path) return;
    const timer = setTimeout(() => {
      if (!gotSnapshot.current) {
        setState((s) =>
          s.status === "connecting"
            ? { ...s, status: "offline", data: opts?.disableFallback ? null : (opts?.fallback?.() ?? s.data) }
            : s,
        );
      }
    }, ONLINE_TIMEOUT_MS);

    const unsub = onSnapshot(
      doc(db, path),
      (snap) => {
        gotSnapshot.current = true;
        clearTimeout(timer);
        setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null, status: "online" });
      },
      (err: FirestoreError) => {
        clearTimeout(timer);
        setState({
          data: opts?.disableFallback ? null : (opts?.fallback?.() ?? null),
          status: "offline",
          error: err.code,
        });
      },
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
     
  }, [path]);

  const status: SnapState<T>["status"] = !db || !path ? "offline" : state.status;
  return { ...state, status };
}

/** Hook koleksi realtime dengan opsi sort/limit sederhana. */
export function useCollection<T>(
  path: string | null,
  opts?: {
    orderByField?: string;
    orderDir?: "asc" | "desc";
    limitCount?: number;
    whereField?: string;
    whereValue?: string;
    fallback?: () => T[];
  },
): SnapState<T[]> {
  const [state, setState] = useState<SnapState<T[]>>({
    data: null,
    status: "connecting",
  });
  const gotSnapshot = useRef(false);

  useEffect(() => {
    gotSnapshot.current = false;
    if (!db || !path) return;
    const ref = collection(db, path);
     
    const constraints: any[] = [];
    if (opts?.whereField && opts?.whereValue) constraints.push(where(opts.whereField, "==", opts.whereValue));
    if (opts?.orderByField) constraints.push(orderBy(opts.orderByField, opts.orderDir ?? "asc"));
    if (opts?.limitCount) constraints.push(limit(opts.limitCount));
    const q = constraints.length ? query(ref, ...constraints) : ref;

    const timer = setTimeout(() => {
      if (!gotSnapshot.current) {
        setState((s) =>
          s.status === "connecting"
            ? { ...s, status: "offline", data: opts?.fallback?.() ?? s.data }
            : s,
        );
      }
    }, ONLINE_TIMEOUT_MS);

    const unsub = onSnapshot(
      q,
      (snap) => {
        gotSnapshot.current = true;
        clearTimeout(timer);
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
        setState({ data: items, status: "online" });
      },
      (err: FirestoreError) => {
        clearTimeout(timer);
        setState({ data: opts?.fallback?.() ?? [], status: "offline", error: err.code });
      },
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
     
  }, [path, opts?.orderByField, opts?.orderDir, opts?.limitCount, opts?.whereField, opts?.whereValue]);

  const status: SnapState<T[]>["status"] = !db || !path ? "offline" : state.status;
  return { ...state, status };
}

// ---------- Hook spesifik domain ----------

/** Ambil turnamen aktif (atau turnamen pertama) untuk halaman publik. */
export function useActiveTournament() {
  const list = useCollection<Tournament>("tournaments", {
    fallback: () => [demoTournament],
  });
  const tournament =
    list.data?.find((t) => t.status === "active") ?? list.data?.[0] ?? null;
  return { ...list, tournament };
}

export function useTournament(tournamentId: string | null, fallback = true) {
  return useDoc<Tournament>(
    tournamentId ? `tournaments/${tournamentId}` : null,
    fallback ? { fallback: () => demoTournament } : undefined,
  );
}

export function useStandings(tournamentId: string | null, fallback = true) {
  return useDoc<PublicLeaderboard>(
    tournamentId ? `publicLeaderboards/${tournamentId}` : null,
    fallback ? { fallback: () => demoLeaderboard } : undefined,
  );
}

export function useBroadcast(tournamentId: string | null, fallback = true) {
  return useDoc<BroadcastSettings>(
    tournamentId ? `broadcastSettings/${tournamentId}` : null,
    fallback
      ? {
          fallback: () => ({
            tournamentId: tournamentId ?? "",
            streamMode: "youtube" as const,
            youtubeVideoId: "",
            streamTitle: "BATTLE OFF FRIENDS — Live Stream",
            showPublicTimeline: true,
          }),
        }
      : undefined,
  );
}

export function useMatches(tournamentId: string | null, fallback = true) {
  return useCollection<Match>(
    tournamentId ? `tournaments/${tournamentId}/matches` : null,
    fallback
      ? { orderByField: "matchNumber", orderDir: "asc", fallback: () => demoMatches }
      : { orderByField: "matchNumber", orderDir: "asc" },
  );
}

export function useTeams(tournamentId: string | null, fallback = true) {
  return useCollection<Team>(
    tournamentId ? `tournaments/${tournamentId}/teams` : null,
    fallback
      ? { orderByField: "number", orderDir: "asc", fallback: () => demoTeams }
      : { orderByField: "number", orderDir: "asc" },
  );
}

// ---------- Pembacaan sekali (admin) ----------

export async function fetchOnce<T>(path: string): Promise<T | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
}

export async function fetchResultsOnce(tournamentId: string, matchId: string) {
  if (!db) return [];
  const snap = await getDocs(collection(db, `tournaments/${tournamentId}/matches/${matchId}/results`));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Ambil event observer publik (hanya yang dikonfirmasi panitia). */
export function usePublicObserverEvents(tournamentId: string | null) {
  return useCollection<ObserverEvent>(
    tournamentId ? `observerEvents/${tournamentId}/events` : null,
    { orderByField: "timestamp", orderDir: "desc", limitCount: 30 },
  );
}

"use client";
// ============================================================
// ZEROID ESPORTS — Notification Center (PHASE 2 §18)
// Notifikasi HANYA dari event nyata: perubahan koneksi bridge,
// status siaran di Firestore, event broadcast, overlay push,
// pergantian match. Dengan filter kategori + timestamp.
// ============================================================

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { subscribeBridge, type BridgeState } from "@/services/broadcast/bridge";
import { useActiveTournament, useBroadcast, useMatches } from "@/services/firestore/hooks";
import type { BroadcastEventType } from "@/lib/types";

export type NotifyCategory = "streaming" | "network" | "obs" | "overlay" | "match";

export interface NotifyItem {
  id: string;
  category: NotifyCategory;
  message: string;
  at: number;
}

interface NotifyCtx {
  items: NotifyItem[];
  unread: number;
  filter: NotifyCategory | "all";
  setFilter: (f: NotifyCategory | "all") => void;
  push: (category: NotifyCategory, message: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

const Ctx = createContext<NotifyCtx | null>(null);

const MAX_ITEMS = 120;

export function useNotifications(): NotifyCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications harus dipakai di dalam NotificationCenterProvider");
  return ctx;
}

const EVENT_LABEL: Record<BroadcastEventType, string> = {
  LIVE_STARTING: "Siaran sedang disiapkan",
  LIVE_NOW: "SIARAN LIVE DIMULAI",
  MATCH_STARTED: "Match dimulai",
  MATCH_PAUSED: "Match dijeda",
  MATCH_RESUMED: "Match dilanjutkan",
  MATCH_COMPLETED: "Match selesai",
  RESULT_PUBLISHED: "Hasil resmi dipublikasikan",
  NEXT_ROUND: "Ronde berikutnya",
  STREAM_RECONNECTING: "Stream mencoba tersambung ulang",
  TECHNICAL_DIFFICULTIES: "Gangguan teknis siaran",
  BROADCAST_ENDED: "Siaran diakhiri",
  OVERLAY_PUSHED: "Overlay dipush ke siaran",
  MATCH_INFO_UPDATED: "Informasi match diperbarui",
};

export function NotificationCenterProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotifyItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<NotifyCategory | "all">("all");

  const push = useCallback((category: NotifyCategory, message: string) => {
    const item: NotifyItem = { id: crypto.randomUUID(), category, message, at: Date.now() };
    setItems((prev) => [item, ...prev].slice(0, MAX_ITEMS));
    setUnread((u) => Math.min(u + 1, 999));
  }, []);

  const markAllRead = useCallback(() => setUnread(0), []);
  const clear = useCallback(() => { setItems([]); setUnread(0); }, []);

  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const broadcast = useBroadcast(tid);
  const matches = useMatches(tid);

  // ---- Sumber 1: koneksi bridge lokal (nyata, dari WebSocket) ----
  const prevBridge = useRef<BridgeState | null>(null);
  useEffect(() => subscribeBridge((s) => {
    const prev = prevBridge.current;
    // queueMicrotask: setState hanya di callback async (aturan react-hooks).
    queueMicrotask(() => {
      if (prev?.connected !== s.connected) {
        push("network", s.connected ? "Local broadcast bridge tersambung" : "Local broadcast bridge terputus");
      }
      if (prev?.obsConnected !== s.obsConnected && s.obsConnected !== undefined) {
        push("obs", s.obsConnected ? `OBS Studio tersambung${s.obsVersion ? ` (v${s.obsVersion})` : ""}` : "OBS Studio terputus");
      }
      if (prev?.streaming !== s.streaming && s.streaming !== undefined && prev?.connected) {
        push("streaming", s.streaming ? "OBS output streaming AKTIF" : "OBS output berhenti");
      }
    });
    prevBridge.current = s;
  }), [push]);

  // ---- Sumber 2: mesin status live di broadcastSettings ----
  const prevLive = useRef<string | null>(null);
  useEffect(() => {
    const live = broadcast.data?.live;
    const key = live ? live.state : null;
    const prevKey = prevLive.current;
    if (key !== prevKey && prevKey !== undefined) {
      queueMicrotask(() => {
        if (key === "live") push("streaming", "SIARAN LIVE — video mengalir ke penonton");
        else if (key === "reconnecting") push("streaming", "Stream terganggu — recovery berjalan");
        else if (key === "error") push("streaming", `Stream error: ${live?.message ?? "tidak diketahui"}`);
        else if (key === "offline" && prevKey && prevKey !== "offline") push("streaming", "Siaran diakhiri (OFFLINE)");
        else if (key === "preparing" || key === "ready") push("streaming", "Broadcast sedang disiapkan (preflight)");
      });
    }
    prevLive.current = key;
  }, [broadcast.data?.live, push]);

  // ---- Sumber 3: event broadcast dari admin ----
  const prevEvent = useRef<string | null>(null);
  useEffect(() => {
    const ev = broadcast.data?.event;
    if (ev?.id && ev.id !== prevEvent.current) {
      const label = EVENT_LABEL[ev.type] ?? ev.type;
      const msg = ev.message;
      queueMicrotask(() => push("match", msg ? `${label} — ${msg}` : label));
    }
    prevEvent.current = ev?.id ?? null;
  }, [broadcast.data?.event, push]);

  // ---- Sumber 4: pergantian match current ----
  const prevMatch = useRef<string | null>(null);
  useEffect(() => {
    const current = matches.data?.find((m) => m.isCurrent);
    const id = current?.id ?? null;
    if (id !== prevMatch.current && prevMatch.current !== undefined && id) {
      const no = current?.matchNumber;
      const map = current?.map;
      queueMicrotask(() => push("match", `Match ${no} (${map}) sekarang LIVE`));
    }
    prevMatch.current = id;
  }, [matches.data, push]);

  const value = useMemo<NotifyCtx>(() => ({
    items, unread, filter, setFilter, push, markAllRead, clear,
  }), [items, unread, filter, push, markAllRead, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const CATEGORY_LABEL: Record<NotifyCategory | "all", string> = {
  all: "Semua",
  streaming: "Streaming",
  network: "Network",
  obs: "OBS",
  overlay: "Overlay",
  match: "Match",
};

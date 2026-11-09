"use client";
// ============================================================
// STIKAR ESPORTS — Klien AI Observer lokal (port 8077)
// Service ini berjalan di laptop produksi operator.
// Website TIDAK berjalan jika observer offline — hanya panel
// yang menampilkan status "tidak tersedia".
// ============================================================

import type { ObserverEvent } from "@/lib/types";

const OBSERVER_URL_KEY = "stikar.observer.url";
export const OBSERVER_DEFAULT_URL = "http://127.0.0.1:8077";

export function getObserverUrl(): string {
  if (typeof window === "undefined") return OBSERVER_DEFAULT_URL;
  return localStorage.getItem(OBSERVER_URL_KEY) ?? OBSERVER_DEFAULT_URL;
}
export function setObserverUrl(url: string) {
  if (typeof window !== "undefined") localStorage.setItem(OBSERVER_URL_KEY, url.replace(/\/$/, ""));
}

export interface ObserverStatus {
  online: boolean;
  ocrAvailable?: boolean;
  fps?: number;
  cpu?: number;
  memory?: number;
  lastFrameTime?: number;
  latencyMs?: number;
  message?: string;
}

export async function checkObserverStatus(): Promise<ObserverStatus> {
  try {
    const started = performance.now();
    const res = await fetch(`${getObserverUrl()}/status`, { signal: AbortSignal.timeout(3000) });
    const latency = Math.round(performance.now() - started);
    const data = await res.json();
    return {
      online: true,
      ocrAvailable: data.ocrAvailable,
      fps: data.fps,
      cpu: data.cpuPercent,
      memory: data.memoryPercent,
      lastFrameTime: data.lastFrameTime,
      latencyMs: latency,
    };
  } catch {
    return { online: false, message: "AI Observer tidak terjangkau di " + getObserverUrl() };
  }
}

export async function fetchObserverEvents(): Promise<ObserverEvent[]> {
  try {
    const res = await fetch(`${getObserverUrl()}/events`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    const events = Array.isArray(data) ? data : (data.events ?? []);
    // Observer mengirim ISO string (Python datetime.isoformat) — parse dengan
    // Date.parse; jangan Number(iso) yang menghasilkan NaN → Invalid Date.
    const parseObserverTimestamp = (v: unknown): number => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim()) { const t = Date.parse(v); if (Number.isFinite(t)) return t; }
      return Date.now();
    };
    return events.map((e: Record<string, unknown>, i: number) => ({
      id: String(e.eventId ?? i),
      tournamentId: "",
      type: String(e.type ?? "MANUAL_EVENT") as ObserverEvent["type"],
      timestamp: parseObserverTimestamp(e.timestamp),
      playerName: e.playerName as string | undefined,
      teamName: e.teamName as string | undefined,
      confidence: Number(e.confidence ?? 0),
      reason: e.reason as string | undefined,
      status: "pending",
    }));
  } catch {
    return [];
  }
}

export async function postObserverAction(path: string, body?: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${getObserverUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

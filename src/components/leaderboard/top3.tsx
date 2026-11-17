"use client";
// ============================================================
// STIKAR ESPORTS — Podium Top 3 (wrapper kompatibilitas)
// Dipakai homepage & admin presentation. Kini mendelegasikan ke
// EsportsPodium: podium emas/perak/perunggu broadcast-grade
// dengan rays juara + kontras tinggi untuk layar tancap.
// ============================================================

import { EsportsPodium } from "./broadcast";
import type { StandingsRow } from "@/lib/types";

export function Top3Podium({
  standings,
  className,
}: {
  standings: StandingsRow[];
  className?: string;
}) {
  return <EsportsPodium standings={standings} className={className} />;
}

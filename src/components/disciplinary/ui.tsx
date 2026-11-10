// ============================================================
// STIKAR ESPORTS — Komponen UI bersama modul disiplin (FIRESTORM)
// ============================================================
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DISCIPLINE_STATUS_LABEL,
  PENALTY_KIND_LABEL,
  VIOLATION_STATUS_LABEL,
  type AppealStatus,
  type DisciplineStatus,
  type PenaltyKind,
  type ViolationStatus,
} from "@/lib/disciplinary";

const TONE: Record<string, string> = {
  green: "border-fs-ok/60 text-fs-ok bg-fs-ok/10",
  red: "border-fs-err/70 text-fs-err bg-fs-err/10",
  gold: "border-fs-gold/60 text-fs-gold bg-fs-gold/10",
  cyan: "border-fs-cyan/60 text-fs-cyan bg-fs-cyan/10",
  muted: "border-fs-edge text-fs-muted bg-white/[0.03]",
  fire: "border-fs-fire/60 text-fs-fire bg-fs-fire/10",
};

export function Badge({ tone = "muted", children, className }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 border px-2 py-0.5 font-display text-[10px] font-black uppercase tracking-[0.14em]", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function ViolationStatusBadge({ status }: { status: ViolationStatus }) {
  const tone: Record<ViolationStatus, keyof typeof TONE> = {
    PENDING: "muted", UNDER_REVIEW: "cyan", VERIFIED: "gold", REJECTED: "muted",
    SANCTIONED: "red", APPEALED: "fire", CLOSED: "green",
  };
  return <Badge tone={tone[status]}>{VIOLATION_STATUS_LABEL[status]}</Badge>;
}

export function PenaltyStatusBadge({ status }: { status: "PROPOSED" | "APPLIED" | "CANCELLED" }) {
  const tone = status === "APPLIED" ? "red" : status === "PROPOSED" ? "cyan" : "muted";
  return <Badge tone={tone}>{status}</Badge>;
}

export function KindBadge({ kind }: { kind: PenaltyKind }) {
  const tone: Partial<Record<PenaltyKind, keyof typeof TONE>> = {
    VERBAL: "muted", WARNING: "gold", KILL_REMOVAL: "fire", POINT: "fire",
    ZERO_MATCH: "red", MATCH_EJECTION: "red", SUSPENSION: "gold",
    BAN: "red", DISQUALIFICATION: "red", EXCLUSION: "red",
  };
  return <Badge tone={tone[kind] ?? "muted"}>{PENALTY_KIND_LABEL[kind]}</Badge>;
}

export function DisciplineStatusBadge({ status }: { status: DisciplineStatus }) {
  const tone: Record<DisciplineStatus, keyof typeof TONE> = {
    REGISTERED: "muted", VERIFIED: "cyan", ACTIVE: "green", WARNING: "gold",
    SUSPENDED: "gold", BANNED: "red", DISQUALIFIED: "red", WITHDRAWN: "muted",
  };
  return <Badge tone={tone[status]}>{DISCIPLINE_STATUS_LABEL[status]}</Badge>;
}

export function AppealStatusBadge({ status }: { status: AppealStatus }) {
  const tone: Record<AppealStatus, keyof typeof TONE> = {
    SUBMITTED: "muted", UNDER_REVIEW: "cyan", ACCEPTED: "green", REJECTED: "red", CLOSED: "muted",
  };
  return <Badge tone={tone[status]}>{status}</Badge>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-black uppercase tracking-[0.16em] text-fs-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10.5px] font-semibold text-fs-muted">{hint}</span> : null}
    </label>
  );
}

export function PageHead({ kicker, title, desc, children }: { kicker: string; title: string; desc: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <span className="bo-kicker mb-2 inline-block">{kicker}</span>
        <h1 className="bo-title">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-fs-muted">{desc}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-fs-edge p-6 text-center text-xs font-bold uppercase tracking-[0.18em] text-fs-muted">
      {text}
    </div>
  );
}

export function Kpi({ label, value, tone = "cyan" }: { label: string; value: ReactNode; tone?: keyof typeof TONE }) {
  return (
    <div className={cn("fs-cut border bg-fs-panel/60 p-4", TONE[tone])}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fs-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-black text-fs-text">{value}</p>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn("border-b border-fs-edge px-2 py-2 text-left font-display text-[10px] font-black uppercase tracking-[0.16em] text-fs-muted", className)}>{children}</th>;
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("border-b border-fs-edge/50 px-2 py-2 align-top text-[12.5px] font-semibold text-fs-text", className)}>{children}</td>;
}

// ============================================================
// STIKAR ESPORTS — Hooks realtime untuk modul disiplin.
// Semua list memakai onSnapshot (realtime nyata).
// ============================================================
"use client";

import { useMemo } from "react";
import { useCollection } from "@/services/firestore/hooks";
import { useAdminSession } from "@/services/auth/admin";
import type { Actor } from "./store";
import type {
  Appeal,
  DisciplinaryLog,
  EvidenceDoc,
  Penalty,
  PenaltyConfig,
  TeamDiscipline,
  Violation,
} from "@/lib/disciplinary";

export function useViolations(tournamentId: string | null) {
  return useCollection<Violation>(
    tournamentId ? "disciplinaryViolations" : null,
    { orderByField: "createdAt", orderDir: "desc", limitCount: 200 },
  );
}

export function usePenalties(tournamentId: string | null) {
  // Filter per turnamen dilakukan di klien (hindari composite index).
  const all = useCollection<Penalty>("disciplinaryPenalties", {
    orderByField: "createdAt", orderDir: "desc", limitCount: 300,
  });
  const data = useMemo(
    () => (all.data ?? []).filter((p) => !tournamentId || p.tournamentId === tournamentId),
    [all.data, tournamentId],
  );
  return { ...all, data };
}

export function useTeamDisciplines() {
  return useCollection<TeamDiscipline>("disciplinaryTeams", { limitCount: 300 });
}

export function useEvidence(violationId: string | null) {
  const all = useCollection<EvidenceDoc>("disciplinaryEvidence", {
    orderByField: "createdAt", orderDir: "desc", limitCount: 300,
  });
  const data = useMemo(
    () => (all.data ?? []).filter((e) => !violationId || e.violationId === violationId),
    [all.data, violationId],
  );
  return { ...all, data };
}

export function useAppeals(tournamentId: string | null) {
  const all = useCollection<Appeal>("disciplinaryAppeals", {
    orderByField: "createdAt", orderDir: "desc", limitCount: 200,
  });
  const data = useMemo(
    () => (all.data ?? []).filter((a) => !tournamentId || a.tournamentId === tournamentId),
    [all.data, tournamentId],
  );
  return { ...all, data };
}

export function useDisciplinaryLogs() {
  return useCollection<DisciplinaryLog>("disciplinaryLogs", {
    orderByField: "createdAt", orderDir: "desc", limitCount: 400,
  });
}

export function usePenaltyConfig(): { data: PenaltyConfig | null; status: string } {
  const doc = useDocConfig();
  return doc;
}

// Config tunggal (disciplinaryConfig/default) — bungkus useCollection dan ambil [0].
import { useDoc } from "@/services/firestore/hooks";
function useDocConfig() {
  const d = useDoc<PenaltyConfig>("disciplinaryConfig/default");
  return { data: d.data, status: d.status };
}

/** Actor untuk store.* — dari sesi admin yang sedang login. */
export function useStaffActor(): Actor | null {
  const session = useAdminSession();
  return useMemo(() => {
    if (!session.user) return null;
    return {
      uid: session.user.uid ?? "",
      email: session.user.email ?? "admin",
      role: session.role,
    };
  }, [session.user, session.role]);
}

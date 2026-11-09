"use client";
// /admin/audit — audit logs
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { BoBadge, BoCard } from "@/components/common/bo";
import { EmptyState } from "@/components/common/stat";
import { formatDateTime } from "@/lib/constants";
import type { AuditLog } from "@/lib/types";

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [state, setState] = useState<"connecting" | "online" | "offline">(
    db ? "connecting" : "offline",
  );

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLog));
        setState("online");
      },
      () => setState("offline"),
    );
    return unsub;
  }, []);

  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Audit Logs</h1>
      <p className="mt-1 text-sm font-semibold text-fs-text/60">
        Semua tindakan admin tercatat — tidak dapat dihapus dari aplikasi.
      </p>

      {state === "offline" ? (
        <EmptyState className="mt-4" title="Database tidak terhubung" description="Audit log membutuhkan Firestore aktif." />
      ) : logs.length === 0 ? (
        <EmptyState className="mt-4" title="Belum ada aktivitas" description="Log akan muncul setelah ada tindakan admin." />
      ) : (
        <BoCard className="mt-4 overflow-x-auto bg-fs-panel">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-fs-head text-white">
                <th className="px-3 py-2 text-left font-display text-xs uppercase tracking-wider">Waktu</th>
                <th className="px-2 py-2 text-left font-display text-xs uppercase tracking-wider">Aksi</th>
                <th className="px-2 py-2 text-left font-display text-xs uppercase tracking-wider">Oleh</th>
                <th className="px-2 py-2 text-left font-display text-xs uppercase tracking-wider">Target</th>
                <th className="px-2 py-2 text-left font-display text-xs uppercase tracking-wider">Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b-2 border-fs-edge/10 bg-fs-panel">
                  <td className="px-3 py-1.5 text-xs font-bold text-fs-text/60">{formatDateTime(log.createdAt)}</td>
                  <td className="px-2 py-1.5">
                    <BoBadge className="bg-zb-yellow">{log.action}</BoBadge>
                  </td>
                  <td className="px-2 py-1.5 text-xs font-semibold">{log.actorEmail}</td>
                  <td className="px-2 py-1.5 text-xs font-semibold">
                    {log.targetType}:{log.targetId}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-fs-text/50">
                    {log.details ? JSON.stringify(log.details).slice(0, 80) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BoCard>
      )}
    </div>
  );
}

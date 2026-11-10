// Audit log generik — dipisah agar tidak ada circular import antara
// scoring/publish dan disciplinary/store. Impor lama tetap jalan karena
// publish.ts me-re-export fungsi ini.
"use client";

import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";

export async function writeAuditLog(payload: {
  action: string;
  actor?: { uid: string; email: string };
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}) {
  if (!db) return;
  try {
    await setDoc(doc(collection(db, "auditLogs")), {
      ...payload,
      actorUid: payload.actor?.uid ?? "system",
      actorEmail: payload.actor?.email ?? "system",
      createdAt: serverTimestamp(),
    });
  } catch {
    // Audit log tidak boleh memblokir operasi utama.
  }
}

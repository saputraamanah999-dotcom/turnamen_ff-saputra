"use client";
// ============================================================
// ZEROID ESPORTS — Autentikasi & peran admin (Firebase Auth)
// ============================================================

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/services/firebase/client";
import type { AdminRole, AdminRoleName } from "@/lib/types";

export interface AdminSession {
  user: User | null;
  role: AdminRoleName | null;
  roleLoaded: boolean;
}

/** Pantau sesi auth + dokumen adminRoles/{uid}. */
export function useAdminSession(): AdminSession & { logout: () => Promise<void> } {
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [role, setRole] = useState<AdminRoleName | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    if (!auth) {
      const t = setTimeout(() => setAuthLoaded(true), 0);
      return () => clearTimeout(t);
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoaded(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!db || !user) {
      const t = setTimeout(() => setRoleLoaded(true), 0);
      return () => clearTimeout(t);
    }
    const unsub = onSnapshot(
      doc(db, `adminRoles/${user.uid}`),
      (snap) => {
        const r = snap.data() as AdminRole | undefined;
        setRole((r?.role as AdminRoleName) ?? null);
        setRoleLoaded(true);
      },
      () => {
        setRole(null);
        setRoleLoaded(true);
      },
    );
    return unsub;
     
  }, [user]);

  async function logout() {
    if (auth) await signOut(auth);
  }

  return { user, role, roleLoaded: roleLoaded && authLoaded, logout };
}

export async function adminLogin(email: string, password: string) {
  if (!auth) throw new Error("Firebase Auth tidak terkonfigurasi.");
  return signInWithEmailAndPassword(auth, email, password);
}

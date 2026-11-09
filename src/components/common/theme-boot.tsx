"use client";
// Terapkan tema tersimpan segera setelah halaman dirender (tanpa flicker besar,
// token default FIRESTORM sudah aktif dari CSS). Dipasang di root layout.

import { useEffect } from "react";
import { applyTheme, getStoredTheme } from "@/lib/themes";

export function ThemeBoot() {
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);
  return null;
}

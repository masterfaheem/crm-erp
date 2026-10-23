"use client";

import { useEffect, useState } from "react";

/* Signed-in user + permissions, fetched once per page load and shared */
export interface Me {
  id: number;
  name: string;
  email: string | null;
  phone?: string | null;
  username?: string | null;
  company_name?: string | null;
  branch_name?: string | null;
  role?: string | null;
  is_super_admin?: boolean;
  permissions?: string[];
}

let mePromise: Promise<Me | null> | null = null;
export function loadMe(): Promise<Me | null> {
  if (!mePromise) {
    mePromise = fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return mePromise;
}

export function canDo(me: Me | null | undefined, ...keys: string[]): boolean {
  if (!me) return false;
  if (me.is_super_admin) return true;
  const set = new Set(me.permissions || []);
  return keys.some((k) => set.has(k));
}

export function useAccess() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadMe().then((m) => {
      if (!alive) return;
      setMe(m);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { me, ready, can: (...keys: string[]) => canDo(me, ...keys) };
}

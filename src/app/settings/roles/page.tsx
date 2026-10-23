"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import PermissionMatrix from "@/app/settings/PermissionMatrix";
import { ROLE_TEMPLATES, ALL_PERMISSION_KEYS } from "@/lib/permissions";

/* ============================================================
   ROLES — saved permission sets (Sales Team, Inventory, Accounts…)
============================================================ */
interface Role {
  id: number;
  name: string;
  description: string | null;
  is_system_role: number;
  permission_keys: string[];
  user_count: number;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

export default function RolesPage() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(localStorage.getItem("erp_sidebar_collapsed") === "true");
      } catch {
        /* ignore */
      }
    };
    read();
    window.addEventListener("erp:sidebar-collapse", read);
    return () => window.removeEventListener("erp:sidebar-collapse", read);
  }, []);
  return (
    <>
      <Navbar />
      <main className={`min-h-screen bg-gray-50 pt-16 transition-[padding] duration-200 ease-out ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <RolesContent />
        </div>
      </main>
    </>
  );
}

function RolesContent() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ role: Role | null; preset?: { name: string; description: string; keys: string[] } } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/roles", { credentials: "include" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Unable to load roles");
        if (alive) setRoles(j.data || []);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Unable to load roles"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [version]);

  const remove = async (r: Role) => {
    if (!window.confirm(`Delete role "${r.name}"?`)) return;
    const res = await fetch(`/api/roles/${r.id}`, { method: "DELETE", credentials: "include" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return window.alert(j.error || "Could not delete");
    setVersion((v) => v + 1);
  };

  const existingNames = new Set(roles.map((r) => r.name.toLowerCase()));
  const missingTemplates = ROLE_TEMPLATES.filter((t) => !existingNames.has(t.name.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Roles &amp; Permissions</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            A role is a saved set of ticks. Give a role to a person, or give them custom ticks from{" "}
            <Link href="/settings/users" className="font-medium text-[#0fa846] hover:underline">Team &amp; Access</Link>.
          </p>
        </div>
        <button onClick={() => setEditing({ role: null })} className="rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455]">
          + New role
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const admin = Number(r.is_system_role) === 1;
            return (
              <div key={r.id} className="flex flex-col rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {admin ? "👑 " : ""}
                      {r.name}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">{r.description || (admin ? "Full access to everything" : "—")}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {r.user_count} user{Number(r.user_count) === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-3 text-xs text-gray-600">
                  {admin ? "All permissions" : `${r.permission_keys.length} of ${ALL_PERMISSION_KEYS.length} permissions`}
                </div>
                <div className="mt-3 flex gap-2">
                  {admin ? (
                    <span className="text-xs text-gray-400">Can&apos;t be edited</span>
                  ) : (
                    <>
                      <button onClick={() => setEditing({ role: r })} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-[#17D65D]">
                        Edit permissions
                      </button>
                      <button onClick={() => remove(r)} className="rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && missingTemplates.length > 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">Ready-made roles</div>
          <p className="mt-0.5 text-xs text-gray-500">Start from one of these and adjust the ticks before saving.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missingTemplates.map((t) => (
              <button
                key={t.name}
                onClick={() => setEditing({ role: null, preset: t })}
                className="rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-[#17D65D]"
              >
                <div className="text-sm font-medium text-gray-900">+ {t.name}</div>
                <div className="text-[11px] text-gray-500">{t.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <RoleModal
          role={editing.role}
          preset={editing.preset}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

function RoleModal({
  role,
  preset,
  onClose,
  onSaved,
}: {
  role: Role | null;
  preset?: { name: string; description: string; keys: string[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name || preset?.name || "");
  const [description, setDescription] = useState(role?.description || preset?.description || "");
  const [keys, setKeys] = useState<string[]>(role?.permission_keys || preset?.keys || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Role name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(role ? `/api/roles/${role.id}` : "/api/roles", {
        method: role ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, permission_keys: keys }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not save");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{role ? `Edit role: ${role.name}` : "New role"}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {role && Number(role.user_count) > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Changes apply to {role.user_count} user(s) with this role (except people on custom ticks).
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">Role name *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Sales Team" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">Description</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="What this role is for" />
            </label>
          </div>
          <PermissionMatrix value={keys} onChange={setKeys} />
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-[#17D65D] px-5 py-2 text-sm font-semibold text-black hover:bg-[#15c455] disabled:opacity-50">
            {saving ? "Saving…" : "Save role"}
          </button>
        </div>
      </div>
    </div>
  );
}

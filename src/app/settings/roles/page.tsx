"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface RoleRow {
  id: number;
  name: string;
  description: string | null;
  is_system_role: number;
  permission_count: number;
  user_count: number;
  created_at: string;
}

interface PermissionItem {
  id: number;
  module: string;
  action: string;
  permission_key: string;
  description: string | null;
}

type GroupedPermissions = Record<string, PermissionItem[]>;

/* ============================================================
   HELPERS
============================================================ */
const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  pipeline: "Pipeline",
  whatsapp: "WhatsApp",
  customers: "Customers",
  suppliers: "Suppliers",
  products: "Products",
  sales: "Sales",
  purchases: "Purchases",
  inventory: "Inventory",
  expenses: "Expenses",
  hr: "Employees",
  accounting: "Accounting",
  reports: "Reports",
  users: "Users",
  roles: "Roles",
  settings: "Settings",
};

const MODULE_ORDER = [
  "dashboard",
  "leads",
  "pipeline",
  "whatsapp",
  "customers",
  "suppliers",
  "products",
  "sales",
  "purchases",
  "inventory",
  "expenses",
  "hr",
  "accounting",
  "reports",
  "users",
  "roles",
  "settings",
];

function moduleLabel(key: string): string {
  return MODULE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const checkboxCls =
  "h-4 w-4 cursor-pointer rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]";

/* ============================================================
   PAGE
============================================================ */
export default function RolesPage() {
  return (
    <>
      <Navbar />
      <RolesMain />
    </>
  );
}

/* ============================================================
   MAIN WRAPPER
============================================================ */
function RolesMain() {
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
    const onCustom = () => read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "erp_sidebar_collapsed") read();
    };
    window.addEventListener("erp:sidebar-collapse", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("erp:sidebar-collapse", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <main
      className={`min-h-screen bg-gray-50 pt-16 transition-[padding] duration-200 ease-out ${
        collapsed ? "lg:pl-[72px]" : "lg:pl-64"
      }`}
    >
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <RolesContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function RolesContent() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);

  /* ---- Fetch ---- */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/roles", { credentials: "include" }),
        fetch("/api/permissions", { credentials: "include" }),
      ]);

      if (!rRes.ok) {
        if (rRes.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Unable to load roles.");
      }

      const rJson = await rRes.json();
      const pJson = await pRes.json();

      setRoles(rJson.data || []);
      setPermissions(pJson.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ---- Filter ---- */
  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roles.filter((r) => {
      if (typeFilter === "system" && !r.is_system_role) return false;
      if (typeFilter === "custom" && r.is_system_role) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
      );
    });
  }, [roles, search, typeFilter]);

  /* ---- Grouped permissions ---- */
  const groupedPermissions: GroupedPermissions = useMemo(() => {
    const grouped: GroupedPermissions = {};
    for (const p of permissions) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push(p);
    }
    const ordered: GroupedPermissions = {};
    for (const mod of MODULE_ORDER) {
      if (grouped[mod]) ordered[mod] = grouped[mod];
    }
    for (const mod of Object.keys(grouped)) {
      if (!ordered[mod]) ordered[mod] = grouped[mod];
    }
    return ordered;
  }, [permissions]);

  /* ---- Delete ---- */
  const handleDelete = async (role: RoleRow) => {
    if (
      !window.confirm(`Delete the role "${role.name}"? This cannot be undone.`)
    )
      return;
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Delete failed");
      }
      fetchAll();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete role"
      );
    }
  };

  const openCreate = () => {
    setEditingRole(null);
    setShowModal(true);
  };
  const openEdit = (role: RoleRow) => {
    setEditingRole(role);
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      {/* ============ HEADER ============ */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Roles &amp; Permissions
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Manage what each role can access in your workspace.
        </p>
      </div>

      {/* ============ TOOLBAR ============ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search roles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All roles</option>
            <option value="system">System roles</option>
            <option value="custom">Custom roles</option>
          </select>
        </div>

        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New role
        </button>
      </div>

      {/* ============ TABLE ============ */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Role
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 sm:table-cell">
                Type
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                Permissions
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                Members
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-6 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-600">{error}</p>
                  <button
                    onClick={fetchAll}
                    className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline"
                  >
                    Try again
                  </button>
                </td>
              </tr>
            ) : filteredRoles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-500">
                    {search || typeFilter
                      ? "No roles match your search."
                      : "No roles yet. Create one to get started."}
                  </p>
                </td>
              </tr>
            ) : (
              filteredRoles.map((role) => (
                <tr key={role.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3.5">
                    <div className="text-sm font-medium text-gray-900">
                      {role.name}
                    </div>
                    {role.description && (
                      <div className="mt-0.5 text-xs text-gray-500">
                        {role.description}
                      </div>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 sm:table-cell">
                    {role.is_system_role ? (
                      <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                        System
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md border border-[#17D65D]/30 bg-[#17D65D]/10 px-2 py-0.5 text-xs font-medium text-[#0fa846]">
                        Custom
                      </span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">
                    {role.permission_count} of {permissions.length}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">
                    {role.user_count}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <button
                      onClick={() => openEdit(role)}
                      className="text-sm font-medium text-[#0fa846] hover:text-[#0c8a3a]"
                    >
                      Edit
                    </button>
                    <span className="mx-2 text-gray-300">·</span>
                    <button
                      onClick={() => handleDelete(role)}
                      disabled={
                        role.is_system_role === 1 || role.user_count > 0
                      }
                      title={
                        role.is_system_role
                          ? "System roles cannot be deleted"
                          : role.user_count > 0
                          ? "Reassign members before deleting"
                          : "Delete"
                      }
                      className="text-sm font-medium text-gray-700 hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:text-gray-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ============ MODAL ============ */}
      {showModal && (
        <RoleModal
          role={editingRole}
          groupedPermissions={groupedPermissions}
          totalPermissions={permissions.length}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   ROLE MODAL
============================================================ */
function RoleModal({
  role,
  groupedPermissions,
  totalPermissions,
  onClose,
  onSaved,
}: {
  role: RoleRow | null;
  groupedPermissions: GroupedPermissions;
  totalPermissions: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!role;

  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(Object.keys(groupedPermissions))
  );

  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* ---- Load role permissions when editing ---- */
  useEffect(() => {
    if (!isEdit || !role) return;
    let cancelled = false;
    (async () => {
      setLoadingPerms(true);
      try {
        const res = await fetch(`/api/roles/${role.id}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load role details.");
        const json = await res.json();
        if (cancelled) return;
        setSelected(new Set<number>(json.permission_ids || []));
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoadingPerms(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, role]);

  /* ---- Toggles ---- */
  const togglePermission = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModule = (mod: string) => {
    const items = groupedPermissions[mod] || [];
    const allSelected = items.every((p) => selected.has(p.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const p of items) next.delete(p.id);
      } else {
        for (const p of items) next.add(p.id);
      }
      return next;
    });
  };

  const toggleExpanded = (mod: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  /* ---- Submit ---- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        permission_ids: Array.from(selected),
      };

      const url = isEdit ? `/api/roles/${role!.id}` : "/api/roles";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error || "Failed to save role."
        );
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit role" : "Create role"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit
                ? `Update details for ${role?.name}`
                : "Give the role a name and pick its permissions."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Name + Description */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Role name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Sales Manager"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Permissions */}
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">
                    Permissions
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selected.size} of {totalPermissions} selected
                  </p>
                </div>
              </div>

              {loadingPerms ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 animate-pulse rounded-md bg-gray-100"
                    />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200">
                  {Object.entries(groupedPermissions).map(([mod, items]) => {
                    const allSelected = items.every((p) => selected.has(p.id));
                    const someSelected = items.some((p) => selected.has(p.id));
                    const isExpanded = expandedModules.has(mod);
                    const selectedCount = items.filter((p) =>
                      selected.has(p.id)
                    ).length;

                    return (
                      <div key={mod} className="bg-white">
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(mod)}
                            className="flex flex-1 items-center gap-2 text-left"
                          >
                            <svg
                              className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                            <span className="text-sm font-medium text-gray-900">
                              {moduleLabel(mod)}
                            </span>
                            <span className="text-xs text-gray-400">
                              {selectedCount}/{items.length}
                            </span>
                          </button>

                          <label className="flex cursor-pointer items-center gap-2">
                            <span className="text-xs text-gray-500">All</span>
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => {
                                if (el)
                                  el.indeterminate =
                                    !allSelected && someSelected;
                              }}
                              onChange={() => toggleModule(mod)}
                              className={checkboxCls}
                            />
                          </label>
                        </div>

                        {isExpanded && (
                          <div className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-gray-100 bg-gray-50 px-3 py-2 sm:grid-cols-2">
                            {items.map((p) => (
                              <label
                                key={p.id}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.has(p.id)}
                                  onChange={() => togglePermission(p.id)}
                                  className={checkboxCls}
                                />
                                <span className="text-xs capitalize text-gray-700">
                                  {p.action.replace(/_/g, " ")}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loadingPerms}
              className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-50"
            >
              {saving ? "Saving..." : isEdit ? "Save changes" : "Create role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
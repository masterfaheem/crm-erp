"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface GroupRow {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  discount_percent: number;
  status: "active" | "inactive";
  created_at: string;
  member_count: number;
}

interface CustomerLite {
  id: number;
  customer_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
}

/* ============================================================
   HELPERS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const STATUS_STYLE: Record<string, string> = {
  active: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  inactive: "border-gray-200 bg-gray-50 text-gray-600",
};

const PRESET_COLORS = [
  "#17D65D",
  "#3B82F6",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#14B8A6",
  "#6366F1",
];

/* ============================================================
   PAGE
============================================================ */
export default function CustomerGroupsPage() {
  return (
    <>
      <Navbar />
      <GroupsMain />
    </>
  );
}

function GroupsMain() {
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
        <GroupsContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function GroupsContent() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(
        `/api/customer-groups?${params.toString()}`,
        { credentials: "include" }
      );

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Unable to load customer groups.");
      }

      const json = await res.json();
      setGroups(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchAll, 250);
    return () => clearTimeout(timer);
  }, [fetchAll]);

  const handleDelete = async (g: GroupRow) => {
    if (
      !window.confirm(
        `Delete the group "${g.name}"? Customers will not be deleted, only the grouping will be removed.`
      )
    )
      return;

    try {
      const res = await fetch(`/api/customer-groups/${g.id}`, {
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
        err instanceof Error ? err.message : "Failed to delete group"
      );
    }
  };

  const openCreate = () => {
    setEditingGroup(null);
    setShowModal(true);
  };
  const openEdit = (g: GroupRow) => {
    setEditingGroup(g);
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      {/* ============ HEADER ============ */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Customer Groups</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Organize customers into groups for targeted discounts and reporting.
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
              placeholder="Search groups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
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
          New group
        </button>
      </div>

      {/* ============ LIST ============ */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Group
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 sm:table-cell">
                  Discount
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                  Members
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Status
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
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-500">
                      {search || statusFilter
                        ? "No groups match your filters."
                        : "No groups yet. Create one to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-8 w-8 flex-shrink-0 rounded-md"
                          style={{ backgroundColor: g.color || "#17D65D" }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">
                            {g.name}
                          </div>
                          {g.description && (
                            <div className="truncate text-xs text-gray-500">
                              {g.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-700 sm:table-cell">
                      {Number(g.discount_percent) > 0
                        ? `${Number(g.discount_percent).toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-700 md:table-cell">
                      {g.member_count}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_STYLE[g.status] || STATUS_STYLE.inactive
                        }`}
                      >
                        {g.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button
                        onClick={() => openEdit(g)}
                        className="text-sm font-medium text-[#0fa846] hover:text-[#0c8a3a]"
                      >
                        Edit
                      </button>
                      <span className="mx-2 text-gray-300">·</span>
                      <button
                        onClick={() => handleDelete(g)}
                        className="text-sm font-medium text-gray-700 hover:text-red-600"
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
      </div>

      {/* ============ MODAL ============ */}
      {showModal && (
        <GroupModal
          group={editingGroup}
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
   GROUP MODAL
============================================================ */
function GroupModal({
  group,
  onClose,
  onSaved,
}: {
  group: GroupRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!group;

  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");
  const [color, setColor] = useState(group?.color || "#17D65D");
  const [discount, setDiscount] = useState<string>(
    group?.discount_percent != null
      ? String(group.discount_percent)
      : ""
  );
  const [status, setStatus] = useState<string>(group?.status || "active");

  /* ---- Members tab ---- */
  const [tab, setTab] = useState<"details" | "members">("details");
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(
    new Set()
  );
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* ---- Load customers (for member picker) ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/customers?search=${encodeURIComponent(customerSearch)}`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setCustomers(json.data || []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerSearch]);

  /* ---- Load current members when editing ---- */
  useEffect(() => {
    if (!isEdit || !group) return;
    let cancelled = false;
    (async () => {
      setLoadingMembers(true);
      try {
        const res = await fetch(`/api/customer-groups/${group.id}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const ids: number[] = (json.members || []).map(
          (m: CustomerLite) => m.id
        );
        setSelectedMembers(new Set(ids));
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, group]);

  /* ---- Toggles ---- */
  const toggleMember = (id: number) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ---- Submit ---- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Group name is required.");
      return;
    }

    const discountNum = discount ? Number(discount) : 0;
    if (Number.isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
      setError("Discount must be a number between 0 and 100.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        discount_percent: discountNum,
        status,
        member_ids: Array.from(selectedMembers),
      };

      const url = isEdit
        ? `/api/customer-groups/${group!.id}`
        : "/api/customer-groups";
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
          (j as { error?: string }).error || "Failed to save group."
        );
      }

      /* If creating fresh, attach selected members */
      if (!isEdit && selectedMembers.size > 0) {
        const j = await res.json().catch(() => ({}));
        const newId = (j as { id?: number }).id;
        if (newId) {
          await fetch(`/api/customer-groups/${newId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              name: name.trim(),
              description: description.trim() || null,
              color,
              discount_percent: discountNum,
              status,
              member_ids: Array.from(selectedMembers),
            }),
          });
        }
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
              {isEdit ? "Edit group" : "Create group"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit
                ? `Update details for ${group?.name}`
                : "Give the group a name and pick its members."}
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

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => setTab("details")}
            className={`px-6 py-2.5 text-sm font-medium transition ${
              tab === "details"
                ? "border-b-2 border-[#17D65D] text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setTab("members")}
            className={`px-6 py-2.5 text-sm font-medium transition ${
              tab === "members"
                ? "border-b-2 border-[#17D65D] text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Members
            {selectedMembers.size > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-[#17D65D]/15 px-2 py-0.5 text-[10px] font-bold text-[#0fa846]">
                {selectedMembers.size}
              </span>
            )}
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

            {tab === "details" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Group name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. VIP Customers"
                    className={inputCls}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional short description"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Applied automatically to invoices for members.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={inputCls}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Color
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`h-8 w-8 rounded-md border-2 transition ${
                          color === c
                            ? "border-gray-900"
                            : "border-transparent hover:border-gray-300"
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-8 w-12 cursor-pointer rounded-md border border-gray-200"
                      title="Custom color"
                    />
                    <span className="ml-1 font-mono text-xs text-gray-500">
                      {color}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <div className="relative flex-1">
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
                      placeholder="Search customers..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
                    />
                  </div>
                </div>

                {loadingMembers ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-10 animate-pulse rounded-md bg-gray-100"
                      />
                    ))}
                  </div>
                ) : customers.length === 0 ? (
                  <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-sm text-gray-500">
                    No customers found.
                  </p>
                ) : (
                  <div className="max-h-[22rem] overflow-y-auto rounded-md border border-gray-200">
                    <div className="divide-y divide-gray-100">
                      {customers.map((c) => {
                        const checked = selectedMembers.has(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition ${
                              checked
                                ? "bg-[#17D65D]/5"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMember(c.id)}
                              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-gray-900">
                                {c.name}
                              </div>
                              <div className="truncate text-xs text-gray-500">
                                {c.customer_code}
                                {c.email ? ` · ${c.email}` : ""}
                                {c.phone ? ` · ${c.phone}` : ""}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3.5">
            <p className="text-xs text-gray-500">
              {tab === "members"
                ? `${selectedMembers.size} selected`
                : ""}
            </p>
            <div className="flex items-center gap-2">
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
                disabled={saving}
                className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-50"
              >
                {saving ? "Saving..." : isEdit ? "Save changes" : "Create group"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
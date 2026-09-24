"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface CategoryRow {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  parent_id: number | null;
  status: "active" | "inactive";
  created_at: string;
  parent_name: string | null;
  product_count: number;
  subcategory_count: number;
}

/* ============================================================
   CONSTANTS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const STATUS_STYLE: Record<string, string> = {
  active: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  inactive: "border-gray-200 bg-gray-50 text-gray-600",
};

const PRESET_COLORS = [
  "#17D65D", "#3B82F6", "#8B5CF6", "#F59E0B",
  "#EF4444", "#EC4899", "#14B8A6", "#6366F1",
];

/* ============================================================
   PAGE
============================================================ */
export default function ProductCategoriesPage() {
  return (
    <>
      <Navbar />
      <CategoriesMain />
    </>
  );
}

function CategoriesMain() {
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
        <CategoriesContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function CategoriesContent() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/product-categories?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Unable to load categories.");
      }
      const json = await res.json();
      setCategories(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchCategories, 250);
    return () => clearTimeout(t);
  }, [fetchCategories]);

  const handleDelete = async (c: CategoryRow) => {
    if (!window.confirm(`Delete category "${c.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/product-categories/${c.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Delete failed");
      }
      fetchCategories();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete category"
      );
    }
  };

  const openCreate = () => {
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (c: CategoryRow) => {
    setEditing(c);
    setShowModal(true);
  };

  const hasFilters = !!search || !!statusFilter;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Product Categories
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Organize your products into categories and subcategories.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {categories.length.toLocaleString()} total categories
        </div>
      </div>

      {/* TOOLBAR */}
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
              placeholder="Search categories..."
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

          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
              }}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline"
            >
              Clear
            </button>
          )}
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
          New category
        </button>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Category
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                  Parent
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">
                  Products
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">
                  Sub-categories
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
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-6 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-600">{error}</p>
                    <button
                      onClick={fetchCategories}
                      className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline"
                    >
                      Try again
                    </button>
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-500">
                      {hasFilters
                        ? "No categories match your filters."
                        : "No categories yet. Create one to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-6 w-1.5 rounded-full"
                          style={{ backgroundColor: c.color || "#17D65D" }}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {c.name}
                          </div>
                          {c.description && (
                            <div className="text-xs text-gray-500">
                              {c.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">
                      {c.parent_name || (
                        <span className="text-xs text-gray-400">Top-level</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 lg:table-cell">
                      {c.product_count}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 lg:table-cell">
                      {c.subcategory_count}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_STYLE[c.status] || STATUS_STYLE.inactive
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-sm font-medium text-[#0fa846] hover:text-[#0c8a3a]"
                      >
                        Edit
                      </button>
                      <span className="mx-2 text-gray-300">·</span>
                      <button
                        onClick={() => handleDelete(c)}
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

      {/* MODAL */}
      {showModal && (
        <CategoryModal
          category={editing}
          allCategories={categories}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchCategories();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   CATEGORY MODAL
============================================================ */
function CategoryModal({
  category,
  allCategories,
  onClose,
  onSaved,
}: {
  category: CategoryRow | null;
  allCategories: CategoryRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!category;

  const [name, setName] = useState(category?.name || "");
  const [description, setDescription] = useState(category?.description || "");
  const [color, setColor] = useState(category?.color || "#17D65D");
  const [parentId, setParentId] = useState<string>(
    category?.parent_id ? String(category.parent_id) : ""
  );
  const [status, setStatus] = useState<string>(category?.status || "active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* Exclude self from parent list (keeps cycles out of the UI too) */
  const parentOptions = allCategories.filter((c) => !category || c.id !== category.id);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }

    setSaving(true);
    try {
      const url = isEdit
        ? `/api/product-categories/${category!.id}`
        : "/api/product-categories";
      const httpMethod = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method: httpMethod,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          parent_id: parentId ? Number(parentId) : null,
          status,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error || "Failed to save category."
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
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit category" : "Create category"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit
                ? `Update details for ${category?.name}`
                : "Add a new product category."}
            </p>
          </div>
          <button
            type="button"
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

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Laptops"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Parent category
                </label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">None (top-level)</option>
                  {parentOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
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
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded-md border border-gray-200"
                  />
                  <span className="ml-1 font-mono text-xs text-gray-500">
                    {color}
                  </span>
                </div>
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
              disabled={saving}
              className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : isEdit
                ? "Save changes"
                : "Create category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

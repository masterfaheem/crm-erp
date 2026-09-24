"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface ProductRow {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  product_type: "product" | "service";
  purchase_price: number;
  sale_price: number;
  wholesale_price: number;
  tax_rate: number;
  discount_percent: number;
  min_stock: number;
  max_stock: number;
  reorder_level: number;
  opening_stock: number;
  track_inventory: number;
  image_path: string | null;
  status: "active" | "inactive" | "discontinued";
  notes: string | null;
  created_at: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  unit_id: number | null;
  unit_name: string | null;
  unit_short_name: string | null;
}

interface CategoryLite {
  id: number;
  name: string;
  color: string | null;
}

interface UnitLite {
  id: number;
  name: string;
  short_name: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/* ============================================================
   HELPERS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const STATUS_STYLE: Record<string, string> = {
  active: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  inactive: "border-gray-200 bg-gray-50 text-gray-600",
  discontinued: "border-red-200 bg-red-50 text-red-600",
};

function formatCurrency(n: number): string {
  return "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

/* ============================================================
   PAGE
============================================================ */
export default function ProductsPage() {
  return (
    <>
      <Navbar />
      <ProductsMain />
    </>
  );
}

function ProductsMain() {
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
        <ProductsContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function ProductsContent() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [units, setUnits] = useState<UnitLite[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    total_pages: 0,
  });
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);

  /* ---- Load reference data (categories + units) ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, uRes] = await Promise.all([
          fetch("/api/product-categories", { credentials: "include" }),
          fetch("/api/units", { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (cRes.ok) {
          const j = await cRes.json();
          setCategories(j.data || []);
        }
        if (uRes.ok) {
          const j = await uRes.json();
          setUnits(j.data || []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Fetch products ---- */
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("product_type", typeFilter);
      if (categoryFilter) params.set("category_id", categoryFilter);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/products?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Unable to load products.");
      }
      const json = await res.json();
      setProducts(json.data || []);
      setPagination(
        json.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 }
      );
      setTotalProducts(json.total_products || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, categoryFilter, page]);

  useEffect(() => {
    const t = setTimeout(fetchProducts, 250);
    return () => clearTimeout(t);
  }, [fetchProducts]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter, categoryFilter]);

  const handleDelete = async (p: ProductRow) => {
    if (!window.confirm(`Delete product "${p.name}"? This cannot be undone.`))
      return;
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Delete failed");
      }
      fetchProducts();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete product"
      );
    }
  };

  const openCreate = () => {
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (p: ProductRow) => {
    setEditing(p);
    setShowModal(true);
  };

  const hasFilters =
    !!search || !!statusFilter || !!typeFilter || !!categoryFilter;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Products</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Manage your products, services, and pricing.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {totalProducts.toLocaleString()} total products
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
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
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20 sm:max-w-[180px]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All types</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="discontinued">Discontinued</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setTypeFilter("");
                setCategoryFilter("");
                setPage(1);
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
          New product
        </button>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Product
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                  Category
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">
                  SKU
                </th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                  Purchase
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Sale
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 xl:table-cell">
                  Type
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
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <div className="h-6 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-600">{error}</p>
                    <button
                      onClick={fetchProducts}
                      className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline"
                    >
                      Try again
                    </button>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-500">
                      {hasFilters
                        ? "No products match your filters."
                        : "No products yet. Create one to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {p.name}
                        </div>
                        {p.description && (
                          <div className="truncate text-xs text-gray-500">
                            {p.description}
                          </div>
                        )}
                        {p.unit_short_name && (
                          <div className="mt-0.5 text-[11px] text-gray-400">
                            Per {p.unit_short_name}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 md:table-cell">
                      {p.category_name ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: p.category_color || "#17D65D",
                            }}
                          />
                          {p.category_name}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 lg:table-cell">
                      <span className="font-mono text-xs text-gray-600">
                        {p.sku}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600 md:table-cell">
                      {formatCurrency(Number(p.purchase_price))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(Number(p.sale_price))}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 xl:table-cell">
                      <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                        {p.product_type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_STYLE[p.status] || STATUS_STYLE.inactive
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-sm font-medium text-[#0fa846] hover:text-[#0c8a3a]"
                      >
                        Edit
                      </button>
                      <span className="mx-2 text-gray-300">·</span>
                      <button
                        onClick={() => handleDelete(p)}
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

        {!loading &&
          !error &&
          products.length > 0 &&
          pagination.total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(
                  pagination.page * pagination.limit,
                  pagination.total
                )}{" "}
                of {pagination.total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page === 1}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-3 text-xs font-medium text-gray-700">
                  {pagination.page} / {pagination.total_pages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(pagination.total_pages, p + 1))
                  }
                  disabled={pagination.page === pagination.total_pages}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
      </div>

      {showModal && (
        <ProductModal
          product={editing}
          categories={categories}
          units={units}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchProducts();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   PRODUCT MODAL
============================================================ */
function ProductModal({
  product,
  categories,
  units,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  categories: CategoryLite[];
  units: UnitLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [tab, setTab] = useState<"general" | "pricing" | "inventory">("general");

  const [name, setName] = useState(product?.name || "");
  const [sku, setSku] = useState(product?.sku || "");
  const [barcode, setBarcode] = useState(product?.barcode || "");
  const [description, setDescription] = useState(product?.description || "");
  const [productType, setProductType] = useState<"product" | "service">(
    product?.product_type || "product"
  );
  const [categoryId, setCategoryId] = useState<string>(
    product?.category_id ? String(product.category_id) : ""
  );
  const [unitId, setUnitId] = useState<string>(
    product?.unit_id ? String(product.unit_id) : ""
  );
  const [status, setStatus] = useState<string>(product?.status || "active");
  const [notes, setNotes] = useState(product?.notes || "");

  const [purchasePrice, setPurchasePrice] = useState(
    String(product?.purchase_price ?? 0)
  );
  const [salePrice, setSalePrice] = useState(String(product?.sale_price ?? 0));
  const [wholesalePrice, setWholesalePrice] = useState(
    String(product?.wholesale_price ?? 0)
  );
  const [taxRate, setTaxRate] = useState(String(product?.tax_rate ?? 0));
  const [discountPercent, setDiscountPercent] = useState(
    String(product?.discount_percent ?? 0)
  );

  const [minStock, setMinStock] = useState(String(product?.min_stock ?? 0));
  const [maxStock, setMaxStock] = useState(String(product?.max_stock ?? 0));
  const [reorderLevel, setReorderLevel] = useState(
    String(product?.reorder_level ?? 0)
  );
  const [openingStock, setOpeningStock] = useState(
    String(product?.opening_stock ?? 0)
  );
  const [trackInventory, setTrackInventory] = useState(
    product ? product.track_inventory !== 0 : true
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Product name is required.");
      return;
    }
    if (!sku.trim()) {
      setError("SKU is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode.trim() || null,
        description: description.trim() || null,
        product_type: productType,
        category_id: categoryId ? Number(categoryId) : null,
        unit_id: unitId ? Number(unitId) : null,
        status,
        notes: notes.trim() || null,
        purchase_price: Number(purchasePrice) || 0,
        sale_price: Number(salePrice) || 0,
        wholesale_price: Number(wholesalePrice) || 0,
        tax_rate: Number(taxRate) || 0,
        discount_percent: Number(discountPercent) || 0,
        min_stock: Number(minStock) || 0,
        max_stock: Number(maxStock) || 0,
        reorder_level: Number(reorderLevel) || 0,
        opening_stock: Number(openingStock) || 0,
        track_inventory: trackInventory,
      };

      const url = isEdit ? `/api/products/${product!.id}` : "/api/products";
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
          (j as { error?: string }).error || "Failed to save product."
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
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit product" : "Create product"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit
                ? `Update details for ${product?.name}`
                : "Add a new product or service."}
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

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          {(["general", "pricing", "inventory"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-6 py-2.5 text-sm font-medium capitalize transition ${
                tab === t
                  ? "border-b-2 border-[#17D65D] text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

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

            {/* GENERAL */}
            {tab === "general" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Product name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Dell Latitude E7470"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    SKU <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    required
                    placeholder="e.g. DELL-LAT-7470"
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Barcode
                  </label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Optional"
                    className={`${inputCls} font-mono`}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Type
                  </label>
                  <select
                    value={productType}
                    onChange={(e) =>
                      setProductType(e.target.value as "product" | "service")
                    }
                    className={inputCls}
                  >
                    <option value="product">Product</option>
                    <option value="service">Service</option>
                  </select>
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
                    <option value="discontinued">Discontinued</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Unit
                  </label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">No unit</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.short_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
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
              </div>
            )}

            {/* PRICING */}
            {tab === "pricing" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Purchase price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Sale price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Wholesale price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Tax rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {/* INVENTORY */}
            {tab === "inventory" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 transition hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={trackInventory}
                      onChange={(e) => setTrackInventory(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]"
                    />
                    <div>
                      <span className="block text-sm font-medium text-gray-800">
                        Track inventory
                      </span>
                      <span className="block text-xs text-gray-500">
                        Keep stock levels for this item.
                      </span>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Opening stock
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={openingStock}
                    onChange={(e) => setOpeningStock(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Minimum stock
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Maximum stock
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={maxStock}
                    onChange={(e) => setMaxStock(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Reorder level
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional internal notes"
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>

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
                : "Create product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

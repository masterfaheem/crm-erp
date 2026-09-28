"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface TicketRow {
  id: number;
  ticket_code: string;
  ticket_type: "general" | "warranty";
  subject: string;
  description: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  category: string | null;
  priority: "very_high" | "high" | "medium" | "low";
  status:
    | "open"
    | "in_progress"
    | "pending"
    | "resolved"
    | "closed"
    | "cancelled";
  assigned_to: number | null;
  assigned_name: string | null;
  linked_customer_name: string | null;
  source: string | null;
  due_date: string | null;
  sla_hours: number | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  activity_count: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface WarrantyForm {
  warranty_source: string;
  model: string;
  specs: string;
  product_condition: string;
  serial_no: string;
  accessories_received: string;
  purchase_date: string;
  tested_by: string;
  warranty_status: "" | "in_warranty" | "out_of_warranty";
  issue_types: string[];
  issue_type_other: string;
  issue_description: string;
  initial_diagnosis_done: boolean;
  diagnosis_checked_by: string;
  issue_verified: boolean;
  root_cause: "" | "misuse" | "technical_issue" | "software_issue" | "other";
  root_cause_other: string;
  service_steps: string[];
  solution: string;
  solution_type: "" | "online_resolve" | "repair" | "replacement" | "return";
  additional_support: string[];
  warranty_cost: string;
  time_taken: string;
  repeat_issue: boolean;
  customer_satisfaction: "" | "happy" | "satisfied" | "not_satisfied" | "angry";
  notes: string;
}

const EMPTY_WARRANTY: WarrantyForm = {
  warranty_source: "",
  model: "",
  specs: "",
  product_condition: "",
  serial_no: "",
  accessories_received: "",
  purchase_date: "",
  tested_by: "",
  warranty_status: "",
  issue_types: [],
  issue_type_other: "",
  issue_description: "",
  initial_diagnosis_done: false,
  diagnosis_checked_by: "",
  issue_verified: false,
  root_cause: "",
  root_cause_other: "",
  service_steps: [],
  solution: "",
  solution_type: "",
  additional_support: [],
  warranty_cost: "",
  time_taken: "",
  repeat_issue: false,
  customer_satisfaction: "",
  notes: "",
};

/* ============================================================
   CONSTANTS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const STATUS_STYLE: Record<string, string> = {
  open: "border-blue-200 bg-blue-50 text-blue-700",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  pending: "border-purple-200 bg-purple-50 text-purple-700",
  resolved: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  closed: "border-gray-200 bg-gray-50 text-gray-600",
  cancelled: "border-red-200 bg-red-50 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

const PRIORITY_STYLE: Record<string, string> = {
  very_high: "border-red-300 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-yellow-200 bg-yellow-50 text-yellow-700",
  low: "border-gray-200 bg-gray-50 text-gray-600",
};

const PRIORITY_LABEL: Record<string, string> = {
  very_high: "Very High",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const ISSUE_TYPES = [
  "Battery",
  "Display",
  "Keyboard",
  "Charging",
  "Motherboard",
  "Heating",
  "Software",
  "Other",
];

const SERVICE_STEPS = [
  { key: "initial_call", label: "Initial Call Done" },
  { key: "laptop_received", label: "Laptop Received" },
  { key: "sms_after_diagnose", label: "SMS sent after diagnose" },
  { key: "handed_to_technician", label: "Handed to Technician" },
  { key: "issue_clear", label: "Issue Clear" },
  { key: "retested_supervisor", label: "Re-tested (Supervisor)" },
  { key: "video_sent", label: "Video Sent to Customer" },
  { key: "dispatched", label: "Dispatched" },
  { key: "received_by_customer", label: "Received by Customer" },
  { key: "satisfaction_confirmed", label: "Customer satisfaction confirmation" },
];

const ADDITIONAL_SUPPORT = [
  { key: "delivery_charges_covered", label: "Delivery Charges Covered" },
  { key: "gift_added", label: "Gift Added" },
  { key: "upgrade_model", label: "Upgrade Model" },
  { key: "upgrade_specs", label: "Upgrade Specs" },
];

/* ============================================================
   PAGE
============================================================ */
export default function TicketsPage() {
  return (
    <>
      <Navbar />
      <TicketsMain />
    </>
  );
}

function TicketsMain() {
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
        <TicketsContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function TicketsContent() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketRow | null>(null);
  const [initialType, setInitialType] = useState<"general" | "warranty">(
    "general"
  );

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (typeFilter) params.set("ticket_type", typeFilter);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/tickets?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401)
          throw new Error("Your session has expired. Please sign in again.");
        throw new Error("Unable to load tickets.");
      }

      const json = await res.json();
      setTickets(json.data || []);
      setPagination(
        json.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, priorityFilter, typeFilter, page]);

  useEffect(() => {
    const t = setTimeout(fetchTickets, 250);
    return () => clearTimeout(t);
  }, [fetchTickets]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, priorityFilter, typeFilter]);

  const handleDelete = async (t: TicketRow) => {
    if (!window.confirm(`Delete ticket "${t.ticket_code}"?`)) return;
    try {
      const res = await fetch(`/api/tickets/${t.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Delete failed");
      }
      fetchTickets();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete ticket"
      );
    }
  };

  const openCreate = (type: "general" | "warranty" = "general") => {
    setEditingTicket(null);
    setInitialType(type);
    setShowModal(true);
  };

  const openEdit = (t: TicketRow) => {
    setEditingTicket(t);
    setInitialType(t.ticket_type);
    setShowModal(true);
  };

  const hasFilters =
    !!search || !!statusFilter || !!priorityFilter || !!typeFilter;

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setTypeFilter("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tickets</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Manage support tickets and warranty claims.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {pagination.total.toLocaleString()} total tickets
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
              placeholder="Search tickets..."
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
            <option value="">All types</option>
            <option value="general">General</option>
            <option value="warranty">Warranty</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={resetFilters}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreate("general")}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 active:scale-[0.98]"
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
            New General
          </button>
          <button
            onClick={() => openCreate("warranty")}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#17D65D] px-3 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]"
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
                d="M9 12l2 2 4-4M12 3l7 4v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z"
              />
            </svg>
            New Warranty
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Ticket
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                  Customer
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">
                  Assigned
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Priority
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 xl:table-cell">
                  Created
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
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-6 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-600">{error}</p>
                    <button
                      onClick={fetchTickets}
                      className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline"
                    >
                      Try again
                    </button>
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-500">
                      {hasFilters
                        ? "No tickets match your filters."
                        : "No tickets yet. Create one to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-gray-500">
                            {t.ticket_code}
                          </span>
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              t.ticket_type === "warranty"
                                ? "border-[#17D65D]/40 bg-[#17D65D]/10 text-[#0fa846]"
                                : "border-gray-200 bg-gray-50 text-gray-500"
                            }`}
                          >
                            {t.ticket_type}
                          </span>
                        </div>
                        <span className="truncate text-sm font-medium text-gray-900">
                          {t.subject}
                        </span>
                        {t.category && (
                          <span className="text-xs text-gray-500">
                            {t.category}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 md:table-cell">
                      <div className="text-sm text-gray-700">
                        {t.customer_name || t.linked_customer_name || "—"}
                      </div>
                      {t.customer_phone && (
                        <div className="text-xs text-gray-500">
                          {t.customer_phone}
                        </div>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-700 lg:table-cell">
                      {t.assigned_name || (
                        <span className="text-xs text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                          PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.low
                        }`}
                      >
                        {PRIORITY_LABEL[t.priority] || t.priority}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLE[t.status] || STATUS_STYLE.closed
                        }`}
                      >
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-xs text-gray-500 xl:table-cell">
                      {new Date(t.created_at).toLocaleDateString("en-PK", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <Link
                        href={`/tickets/${t.id}`}
                        className="text-sm font-medium text-gray-700 hover:text-gray-900"
                      >
                        View
                      </Link>
                      <span className="mx-2 text-gray-300">·</span>
                      <button
                        onClick={() => openEdit(t)}
                        className="text-sm font-medium text-[#0fa846] hover:text-[#0c8a3a]"
                      >
                        Edit
                      </button>
                      <span className="mx-2 text-gray-300">·</span>
                      <button
                        onClick={() => handleDelete(t)}
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
          tickets.length > 0 &&
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
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
      </div>

      {showModal && (
        <TicketModal
          ticket={editingTicket}
          initialType={initialType}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchTickets();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   TICKET MODAL
============================================================ */
function TicketModal({
  ticket,
  initialType,
  onClose,
  onSaved,
}: {
  ticket: TicketRow | null;
  initialType: "general" | "warranty";
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!ticket;

  const [ticketType, setTicketType] = useState<"general" | "warranty">(
    ticket?.ticket_type || initialType
  );
  const [tab, setTab] = useState<"details" | "warranty">(
    ticketType === "warranty" ? "warranty" : "details"
  );

  const [subject, setSubject] = useState(ticket?.subject || "");
  const [description, setDescription] = useState(ticket?.description || "");
  const [customerName, setCustomerName] = useState(ticket?.customer_name || "");
  const [customerPhone, setCustomerPhone] = useState(
    ticket?.customer_phone || ""
  );
  const [category, setCategory] = useState(ticket?.category || "");
  const [priority, setPriority] = useState<string>(
    ticket?.priority || "medium"
  );
  const [status, setStatus] = useState<string>(ticket?.status || "open");
  const [assignedTo, setAssignedTo] = useState(
    ticket?.assigned_to != null ? String(ticket.assigned_to) : ""
  );
  const [dueDate, setDueDate] = useState(ticket?.due_date || "");

  const [warranty, setWarranty] = useState<WarrantyForm>(EMPTY_WARRANTY);

  useEffect(() => {
    if (!isEdit || !ticket || ticket.ticket_type !== "warranty") return;
    (async () => {
      try {
        const res = await fetch(`/api/tickets/${ticket.id}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.warranty) {
          const w = json.warranty;
          setWarranty({
            warranty_source: w.warranty_source || "",
            model: w.model || "",
            specs: w.specs || "",
            product_condition: w.product_condition || "",
            serial_no: w.serial_no || "",
            accessories_received: w.accessories_received || "",
            purchase_date: w.purchase_date
              ? String(w.purchase_date).slice(0, 10)
              : "",
            tested_by: w.tested_by || "",
            warranty_status: w.warranty_status || "",
            issue_types: Array.isArray(w.issue_types)
              ? w.issue_types
              : typeof w.issue_types === "string"
              ? JSON.parse(w.issue_types || "[]")
              : [],
            issue_type_other: w.issue_type_other || "",
            issue_description: w.issue_description || "",
            initial_diagnosis_done: !!w.initial_diagnosis_done,
            diagnosis_checked_by: w.diagnosis_checked_by || "",
            issue_verified: !!w.issue_verified,
            root_cause: w.root_cause || "",
            root_cause_other: w.root_cause_other || "",
            service_steps: Array.isArray(w.service_steps)
              ? w.service_steps
              : typeof w.service_steps === "string"
              ? JSON.parse(w.service_steps || "[]")
              : [],
            solution: w.solution || "",
            solution_type: w.solution_type || "",
            additional_support: Array.isArray(w.additional_support)
              ? w.additional_support
              : typeof w.additional_support === "string"
              ? JSON.parse(w.additional_support || "[]")
              : [],
            warranty_cost:
              w.warranty_cost != null ? String(w.warranty_cost) : "",
            time_taken: w.time_taken || "",
            repeat_issue: !!w.repeat_issue,
            customer_satisfaction: w.customer_satisfaction || "",
            notes: w.notes || "",
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [isEdit, ticket]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleArrayItem = (
    key: "issue_types" | "service_steps" | "additional_support",
    value: string
  ) => {
    setWarranty((prev) => {
      const arr = prev[key];
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      return { ...prev, [key]: next };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        ticket_type: ticketType,
        subject: subject.trim(),
        description: description.trim() || null,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        category: category.trim() || null,
        priority,
        status,
        assigned_to: assignedTo ? Number(assignedTo) : null,
        due_date: dueDate || null,
      };

      if (ticketType === "warranty") {
        payload.warranty = {
          ...warranty,
          warranty_cost: warranty.warranty_cost || null,
        };
      }

      const url = isEdit ? `/api/tickets/${ticket!.id}` : "/api/tickets";
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
          (j as { error?: string }).error || "Failed to save ticket."
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
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit ticket" : "Create ticket"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit
                ? `Update details for ${ticket?.ticket_code}`
                : "Create a new support or warranty ticket."}
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

        {!isEdit && (
          <div className="grid grid-cols-2 gap-2 border-b border-gray-200 bg-gray-50 px-6 py-3">
            <button
              type="button"
              onClick={() => {
                setTicketType("general");
                setTab("details");
              }}
              className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                ticketType === "general"
                  ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="block">General Ticket</span>
              <span className="mt-0.5 block text-[11px] font-normal text-gray-500">
                Simple support request
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTicketType("warranty");
                setTab("warranty");
              }}
              className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                ticketType === "warranty"
                  ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="block">Warranty Ticket</span>
              <span className="mt-0.5 block text-[11px] font-normal text-gray-500">
                Full warranty claim form
              </span>
            </button>
          </div>
        )}

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
          {ticketType === "warranty" && (
            <button
              type="button"
              onClick={() => setTab("warranty")}
              className={`px-6 py-2.5 text-sm font-medium transition ${
                tab === "warranty"
                  ? "border-b-2 border-[#17D65D] text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Warranty Form
            </button>
          )}
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

            {tab === "details" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    placeholder="e.g. Laptop not charging"
                    className={inputCls}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the issue in detail"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Customer name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in customer"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Customer phone
                  </label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+92 300 0000000"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Category / Issue Type
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Hardware"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className={inputCls}
                  >
                    <option value="very_high">Very High</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
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
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Assigned to (user ID)
                  </label>
                  <input
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="Optional"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Due date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {tab === "warranty" && ticketType === "warranty" && (
              <div className="space-y-6">
                <SectionTitle n={1} title="Customer Details" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Name
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Source
                    </label>
                    <input
                      type="text"
                      value={warranty.warranty_source}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          warranty_source: e.target.value,
                        })
                      }
                      placeholder="e.g. Facebook, Referral"
                      className={inputCls}
                    />
                  </div>
                </div>

                <SectionTitle n={2} title="Product Details" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Model
                    </label>
                    <input
                      type="text"
                      value={warranty.model}
                      onChange={(e) =>
                        setWarranty({ ...warranty, model: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Specs
                    </label>
                    <input
                      type="text"
                      value={warranty.specs}
                      onChange={(e) =>
                        setWarranty({ ...warranty, specs: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Condition
                    </label>
                    <input
                      type="text"
                      value={warranty.product_condition}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          product_condition: e.target.value,
                        })
                      }
                      placeholder="e.g. Used, New"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Serial No
                    </label>
                    <input
                      type="text"
                      value={warranty.serial_no}
                      onChange={(e) =>
                        setWarranty({ ...warranty, serial_no: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Accessories Received                    </label>
                    <input
                      type="text"
                      value={warranty.accessories_received}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          accessories_received: e.target.value,
                        })
                      }
                      placeholder="e.g. Charger, Bag, Mouse"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Purchase Date
                    </label>
                    <input
                      type="date"
                      value={warranty.purchase_date}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          purchase_date: e.target.value,
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Tested By
                    </label>
                    <input
                      type="text"
                      value={warranty.tested_by}
                      onChange={(e) =>
                        setWarranty({ ...warranty, tested_by: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                </div>

                <SectionTitle n={3} title="Warranty Status" />
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: "in_warranty", l: "In Warranty" },
                    { v: "out_of_warranty", l: "Out of Warranty" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() =>
                        setWarranty({
                          ...warranty,
                          warranty_status: o.v as any,
                        })
                      }
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                        warranty.warranty_status === o.v
                          ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>

                <SectionTitle n={4} title="Issue Details" />
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="mb-2 block text-xs font-medium text-gray-700">
                      Issue Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ISSUE_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleArrayItem("issue_types", t)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                            warranty.issue_types.includes(t)
                              ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {warranty.issue_types.includes("Other") && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-gray-700">
                        Specify other issue
                      </label>
                      <input
                        type="text"
                        value={warranty.issue_type_other}
                        onChange={(e) =>
                          setWarranty({
                            ...warranty,
                            issue_type_other: e.target.value,
                          })
                        }
                        className={inputCls}
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={warranty.issue_description}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          issue_description: e.target.value,
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                </div>

                <SectionTitle n={5} title="Priority Level" />
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: "very_high", l: "Very High" },
                    { v: "high", l: "High" },
                    { v: "medium", l: "Medium" },
                    { v: "low", l: "Low" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setPriority(o.v)}
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                        priority === o.v
                          ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>

                <SectionTitle n={6} title="Initial Diagnosis" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={warranty.initial_diagnosis_done}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          initial_diagnosis_done: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]"
                    />
                    <span className="text-sm text-gray-800">
                      Initial Diagnosis Done
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={warranty.issue_verified}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          issue_verified: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]"
                    />
                    <span className="text-sm text-gray-800">
                      Issue Verified
                    </span>
                  </label>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Checked By
                    </label>
                    <input
                      type="text"
                      value={warranty.diagnosis_checked_by}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          diagnosis_checked_by: e.target.value,
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                </div>

                <SectionTitle n={7} title="Root Cause" />
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { v: "misuse", l: "Misuse" },
                      { v: "technical_issue", l: "Technical Issue" },
                      { v: "software_issue", l: "Software Issue" },
                      { v: "other", l: "Other" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() =>
                          setWarranty({
                            ...warranty,
                            root_cause: o.v as any,
                          })
                        }
                        className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                          warranty.root_cause === o.v
                            ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                  {warranty.root_cause === "other" && (
                    <input
                      type="text"
                      value={warranty.root_cause_other}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          root_cause_other: e.target.value,
                        })
                      }
                      placeholder="Specify other root cause"
                      className={inputCls}
                    />
                  )}
                </div>

                <SectionTitle n={8} title="Service Process Tracking" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SERVICE_STEPS.map((s) => (
                    <label
                      key={s.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition ${
                        warranty.service_steps.includes(s.key)
                          ? "border-[#17D65D]/40 bg-[#17D65D]/5"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={warranty.service_steps.includes(s.key)}
                        onChange={() => toggleArrayItem("service_steps", s.key)}
                        className="h-4 w-4 rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]"
                      />
                      <span className="text-sm text-gray-800">{s.label}</span>
                    </label>
                  ))}
                </div>

                <SectionTitle n={9} title="Solution & Support" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Solution
                    </label>
                    <textarea
                      rows={2}
                      value={warranty.solution}
                      onChange={(e) =>
                        setWarranty({ ...warranty, solution: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-gray-700">
                      Solution Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { v: "online_resolve", l: "Online Resolve" },
                        { v: "repair", l: "Repair" },
                        { v: "replacement", l: "Replacement" },
                        { v: "return", l: "Return" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() =>
                            setWarranty({
                              ...warranty,
                              solution_type: o.v as any,
                            })
                          }
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                            warranty.solution_type === o.v
                              ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-gray-700">
                      Additional Support
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ADDITIONAL_SUPPORT.map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          onClick={() =>
                            toggleArrayItem("additional_support", o.key)
                          }
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                            warranty.additional_support.includes(o.key)
                              ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <SectionTitle n={10} title="Final Summary" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Warranty Cost
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={warranty.warranty_cost}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          warranty_cost: e.target.value,
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Time Taken
                    </label>
                    <input
                      type="text"
                      value={warranty.time_taken}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          time_taken: e.target.value,
                        })
                      }
                      placeholder="e.g. 3 days"
                      className={inputCls}
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={warranty.repeat_issue}
                      onChange={(e) =>
                        setWarranty({
                          ...warranty,
                          repeat_issue: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]"
                    />
                    <span className="text-sm text-gray-800">Repeat Issue</span>
                  </label>

                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-xs font-medium text-gray-700">
                      Customer Satisfaction
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        {
                          v: "happy",
                          l: "Happy",
                          c: "text-green-700 border-green-300 bg-green-50",
                        },
                        {
                          v: "satisfied",
                          l: "Satisfied",
                          c: "text-emerald-700 border-emerald-300 bg-emerald-50",
                        },
                        {
                          v: "not_satisfied",
                          l: "Not Satisfied",
                          c: "text-amber-700 border-amber-300 bg-amber-50",
                        },
                        {
                          v: "angry",
                          l: "Angry",
                          c: "text-red-700 border-red-300 bg-red-50",
                        },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() =>
                            setWarranty({
                              ...warranty,
                              customer_satisfaction: o.v as any,
                            })
                          }
                          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                            warranty.customer_satisfaction === o.v
                              ? o.c
                              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Notes
                    </label>
                    <textarea
                      rows={3}
                      value={warranty.notes}
                      onChange={(e) =>
                        setWarranty({ ...warranty, notes: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
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
                : "Create ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#17D65D]/10 text-xs font-bold text-[#0fa846]">
        {n}
      </span>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface User {
  id: number;
  name: string;
  email: string;
  company_name?: string | null;
  branch_name?: string | null;
}

/* ============================================================
   PAGE
============================================================ */
export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <DashboardMain />
    </>
  );
}

/* ============================================================
   MAIN WRAPPER
   Syncs left padding with the sidebar collapse state by
   listening to the "erp:sidebar-collapse" event dispatched
   by the Navbar, plus the storage event for cross-tab sync.
============================================================ */
function DashboardMain() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(
          localStorage.getItem("erp_sidebar_collapsed") === "true"
        );
      } catch {
        /* ignore */
      }
    };

    // Initial read
    read();

    // Same-tab custom event (dispatched by Navbar on toggle)
    const onCustom = () => read();
    // Cross-tab storage event
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
      <div className="p-4 sm:p-6 lg:p-8">
        <DashboardContent />
      </div>
    </main>
  );
}

/* ============================================================
   DASHBOARD CONTENT
============================================================ */
function DashboardContent() {
  const [user, setUser] = useState<User | null>(null);
  const [greeting, setGreeting] = useState("Welcome back");

  /* ---- Greeting by time of day ---- */
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  /* ---- Load current user ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setUser(json);
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = user?.name ? user.name.trim().split(/\s+/)[0] : "there";

  return (
    <div className="space-y-6">
      {/* ============ WELCOME HEADER ============ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {greeting}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Here&apos;s what&apos;s happening in your business today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/invoices/new"
            prefetch
            className="inline-flex items-center gap-2 rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]"
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
                strokeWidth={2.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Invoice
          </Link>
          <Link
            href="/leads/new"
            prefetch
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-[0.98]"
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
                strokeWidth={2.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Lead
          </Link>
        </div>
      </div>

      {/* ============ EMPTY STATE ============ */}
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#17D65D]/10">
          <svg
            className="h-7 w-7 text-[#17D65D]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          Welcome to your workspace!
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          Your dashboard will show KPIs, revenue, pipeline, invoices, and
          activity once you start adding data.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/leads/new"
            prefetch
            className="inline-flex items-center gap-2 rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#15c455] active:scale-[0.98]"
          >
            Create first lead
          </Link>
          <Link
            href="/products/new"
            prefetch
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-[0.98]"
          >
            Add first product
          </Link>
        </div>
      </div>

      {/* ============ QUICK ACTIONS ============ */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Quick Actions
          </h2>
          <p className="text-xs text-gray-500">
            Jump straight to what you need
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "New Invoice", href: "/invoices/new" },
            { label: "New Lead", href: "/leads/new" },
            { label: "New Order", href: "/orders/new" },
            { label: "Add Product", href: "/products/new" },
            { label: "New Purchase", href: "/purchases/new" },
            { label: "Add Expense", href: "/expenses/new" },
          ].map((a) => (
            <Link
              key={a.label}
              href={a.href}
              prefetch
              className="group flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-center transition hover:border-[#17D65D]/40 hover:bg-[#17D65D]/5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm transition group-hover:bg-[#17D65D]">
                <svg
                  className="h-4 w-4 text-gray-600 transition group-hover:text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-900">
                {a.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
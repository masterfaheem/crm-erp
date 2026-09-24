"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

/* ============================================================
   TYPES
============================================================ */
interface User {
  id: number;
  name: string;
  email: string;
  company_name?: string | null;
  branch_name?: string | null;
  role?: string | null;
}

interface NavChild {
  label: string;
  href: string;
  badge?: string;
  children?: NavChild[]; // supports nested (3rd level)
}

interface NavGroup {
  label: string;
  icon: string;
  href?: string;
  badge?: string;
  children?: NavChild[];
}

/* ============================================================
   ICONS
============================================================ */
const ICONS: Record<string, string> = {
  dashboard:
    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  crm: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  users:
    "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  customers:
    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  suppliers:
    "M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0",
  products:
    "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  purchases:
    "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
  sales:
    "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  inventory:
    "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  expenses:
    "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  employees:
    "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  accounting:
    "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  reports:
    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  settings:
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z",
  chevronDown: "M19 9l-7 7-7-7",
  menu: "M4 6h16M4 12h16M4 18h16",
  bell: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  logout:
    "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  building:
    "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  search:
    "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  collapse:
    "M11 19l-7-7 7-7m8 14l-7-7 7-7",
  expand: "M13 5l7 7-7 7M5 5l7 7-7 7",
};

/* ============================================================
   NAV CONFIG
============================================================ */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    icon: ICONS.dashboard,
    href: "/dashboard",
  },
  {
    label: "CRM",
    icon: ICONS.crm,
    children: [
      { label: "Leads", href: "/leads" },
      { label: "Pipeline", href: "/leads/pipeline" },
      { label: "WhatsApp", href: "/whatsapp" },
      { label: "WhatsApp Settings", href: "/whatsapp/settings" },
    ],
  },
  {
    label: "User Management",
    icon: ICONS.users,
    children: [
      { label: "Users", href: "/settings/users" },
      { label: "Roles & Permissions", href: "/settings/roles" },
      { label: "Branches", href: "/settings/branches" },
      { label: "Audit Logs", href: "/settings/audit-logs" },
    ],
  },
  {
    label: "Customers",
    icon: ICONS.customers,
    children: [
      { label: "All Customers", href: "/customers" },
      { label: "Contacts", href: "/contacts" },
      { label: "Customer Groups", href: "/customers/groups" },
    ],
  },
  {
    label: "Suppliers",
    icon: ICONS.suppliers,
    children: [
      { label: "All Suppliers", href: "/suppliers" },
      { label: "Supplier Payments", href: "/supplier-payments" },
    ],
  },
  {
    label: "Products",
    icon: ICONS.products,
    children: [
      { label: "Products", href: "/products" },
      { label: "Categories", href: "/product-categories" },
      { label: "Units", href: "/units" },
    ],
  },
  {
    label: "Purchases",
    icon: ICONS.purchases,
    children: [
      { label: "Purchase Orders", href: "/purchase/purchase-orders" },
      { label: "Purchase Bills", href: "/purchase-bills" },
    ],
  },
  {
    label: "Sales",
    icon: ICONS.sales,
    children: [
      { label: "Quotations", href: "/quotations" },
      { label: "Sales Orders", href: "/orders" },
      { label: "Invoices", href: "/invoices" },
      { label: "Customer Payments", href: "/payments" },
    ],
  },
  {
    label: "Inventory",
    icon: ICONS.inventory,
    children: [
      { label: "Stock Levels", href: "/inventory" },
      { label: "Warehouses", href: "/warehouses" },
      { label: "Adjustments", href: "/inventory/adjustments" },
      { label: "Transfers", href: "/inventory/transfers" },
    ],
  },
  {
    label: "Expenses",
    icon: ICONS.expenses,
    children: [
      { label: "All Expenses", href: "/expenses" },
      { label: "Categories", href: "/expenses/categories" },
    ],
  },
  {
    label: "Employees",
    icon: ICONS.employees,
    children: [
      { label: "Employees", href: "/employees" },
      { label: "Departments", href: "/departments" },
      { label: "Attendance", href: "/attendance" },
      { label: "Leave Management", href: "/leaves" },
      { label: "Payroll", href: "/payroll" },
    ],
  },
  {
    label: "Accounting",
    icon: ICONS.accounting,
    children: [
      { label: "Chart of Accounts", href: "/accounting/accounts" },
      { label: "Journal Entries", href: "/accounting/journal-entries" },
      { label: "Trial Balance", href: "/accounting/reports/trial-balance" },
      { label: "Profit & Loss", href: "/accounting/reports/profit-loss" },
      { label: "Balance Sheet", href: "/accounting/reports/balance-sheet" },
    ],
  },
  {
    label: "Reports",
    icon: ICONS.reports,
    children: [
      { label: "Sales Report", href: "/reports/sales" },
      { label: "Purchase Report", href: "/reports/purchases" },
      { label: "Inventory Report", href: "/reports/inventory" },
      { label: "Customer Report", href: "/reports/customers" },
      { label: "Employee Report", href: "/reports/employees" },
      {
        label: "Lead Reports",
        href: "/reports/leads",
        children: [
          { label: "By Source", href: "/reports/leads/source" },
          { label: "By City", href: "/reports/leads/city" },
          { label: "By Profession", href: "/reports/leads/profession" },
        ],
      },
    ],
  },
  {
    label: "Settings",
    icon: ICONS.settings,
    children: [
      { label: "Company", href: "/settings/company" },
      { label: "Notifications", href: "/settings/notifications" },
      { label: "Attachments", href: "/settings/attachments" },
      { label: "System", href: "/settings/system" },
    ],
  },
];

/* ============================================================
   LOCALSTORAGE KEY
============================================================ */
const COLLAPSE_KEY = "erp_sidebar_collapsed";
const OPEN_GROUPS_KEY = "erp_sidebar_open_groups";

/* ============================================================
   NAVBAR (SIDEBAR) COMPONENT
============================================================ */
export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [openSubGroups, setOpenSubGroups] = useState<string[]>([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const userRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  /* ---- Restore persisted state ---- */
  useEffect(() => {
    try {
      const c = localStorage.getItem(COLLAPSE_KEY);
      if (c === "true") setCollapsed(true);
      const g = localStorage.getItem(OPEN_GROUPS_KEY);
      if (g) setOpenGroups(JSON.parse(g));
    } catch {
      /* ignore */
    }
  }, []);

  /* ---- Persist collapse + open groups ---- */
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
      window.dispatchEvent(new Event("erp:sidebar-collapse"));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(openGroups));
    } catch {
      /* ignore */
    }
  }, [openGroups]);

  /* ---- Load user ---- */
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

  /* ---- Auto-open group based on current route ---- */
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) => {
      if (g.href) return pathname === g.href;
      const walk = (items?: NavChild[]): boolean =>
        (items || []).some((c) => {
          if (pathname === c.href || pathname.startsWith(c.href + "/"))
            return true;
          return walk(c.children);
        });
      return walk(g.children);
    });
    if (activeGroup) {
      setOpenGroups((prev) =>
        prev.includes(activeGroup.label)
          ? prev
          : [...prev, activeGroup.label]
      );
    }
  }, [pathname]);

  /* ---- Close user/notif menus on outside click ---- */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (userRef.current && !userRef.current.contains(t))
        setUserMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(t))
        setNotifOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  /* ---- Lock body scroll when mobile drawer open ---- */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  /* ---- Close mobile drawer on route change ---- */
  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  /* ---- Helpers ---- */
  const isActive = useCallback(
    (href?: string) => {
      if (!href) return false;
      if (href === "/dashboard") return pathname === "/dashboard";
      return pathname === href || pathname.startsWith(href + "/");
    },
    [pathname]
  );

  const groupIsActive = useCallback(
    (group: NavGroup) => {
      if (group.href) return isActive(group.href);
      const walk = (items?: NavChild[]): boolean =>
        (items || []).some((c) => isActive(c.href) || walk(c.children));
      return walk(group.children);
    },
    [isActive]
  );

  const initials = useMemo(() => {
    if (!user?.name) return "U";
    return user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("");
  }, [user?.name]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  const toggleSubGroup = (label: string) => {
    setOpenSubGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    } finally {
      window.location.href = "/login";
    }
  }, []);

  /* ============================================================
     SIDEBAR CONTENT (shared between desktop + mobile)
  ============================================================ */
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    const isCollapsed = !isMobile && collapsed;

    return (
      <div className="flex h-full flex-col">
        {/* ============ LOGO / BRAND ============ */}
        <div
          className={`flex h-16 shrink-0 items-center border-b border-gray-100 ${
            isCollapsed ? "justify-center px-2" : "px-4"
          }`}
        >
          <Link
            href="/dashboard"
            prefetch
            className="flex items-center gap-2.5 overflow-hidden"
          >
            {isCollapsed ? (
              // Collapsed: show black logo (small) — the mark
              <Image
                src="/technox-logo-black.png"
                alt="Techno X"
                width={36}
                height={36}
                priority
                className="h-9 w-9 shrink-0 object-contain"
              />
            ) : (
              // Expanded: full logo (black) with subtext
              <div className="flex min-w-0 items-center gap-2.5">
                <Image
                  src="/technox-logo-black.png"
                  alt="Techno X"
                  width={40}
                  height={40}
                  priority
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <div className="flex min-w-0 flex-col leading-none">
                  <span className="truncate text-sm font-bold tracking-tight text-gray-900">
                    {user?.company_name || "Techno X"}
                  </span>
                  
                </div>
              </div>
            )}
          </Link>
        </div>

        {/* ============ NAV ============ */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {!isCollapsed && (
            <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Main Menu
            </p>
          )}

          <ul className="space-y-0.5">
            {NAV_GROUPS.map((group) => {
              const active = groupIsActive(group);
              const isOpen = openGroups.includes(group.label);

              // Simple link
              if (!group.children) {
                return (
                  <li key={group.label}>
                    <Link
                      href={group.href!}
                      prefetch
                      title={isCollapsed ? group.label : undefined}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                        isCollapsed ? "justify-center" : ""
                      } ${
                        active
                          ? "bg-[#17D65D]/10 text-[#0fa846]"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <svg
                        className={`h-5 w-5 shrink-0 transition-colors ${
                          active
                            ? "text-[#0fa846]"
                            : "text-gray-400 group-hover:text-gray-600"
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={group.icon}
                        />
                      </svg>
                      {!isCollapsed && (
                        <span className="truncate">{group.label}</span>
                      )}
                    </Link>
                  </li>
                );
              }

              // Group with children
              return (
                <li key={group.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    title={isCollapsed ? group.label : undefined}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                      isCollapsed ? "justify-center" : "justify-between"
                    } ${
                      active
                        ? "bg-[#17D65D]/10 text-[#0fa846]"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <span className="flex items-center gap-3 overflow-hidden">
                      <svg
                        className={`h-5 w-5 shrink-0 transition-colors ${
                          active
                            ? "text-[#0fa846]"
                            : "text-gray-400 group-hover:text-gray-600"
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={group.icon}
                        />
                      </svg>
                      {!isCollapsed && (
                        <span className="truncate">{group.label}</span>
                      )}
                    </span>
                    {!isCollapsed && (
                      <svg
                        className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d={ICONS.chevronDown}
                        />
                      </svg>
                    )}
                  </button>

                  {/* Children */}
                  {!isCollapsed && isOpen && (
                    <ul className="mt-0.5 space-y-0.5 border-l border-gray-100 pl-4 ml-4">
                      {group.children.map((child) => {
                        const childActive =
                          pathname === child.href ||
                          pathname.startsWith(child.href + "/");

                        // Nested (3rd level)
                        if (child.children) {
                          const subOpen = openSubGroups.includes(child.label);
                          return (
                            <li key={child.label}>
                              <button
                                type="button"
                                onClick={() => toggleSubGroup(child.label)}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                                  childActive
                                    ? "text-[#0fa846]"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                }`}
                              >
                                <span className="truncate">{child.label}</span>
                                <svg
                                  className={`h-3 w-3 shrink-0 text-gray-400 transition-transform duration-200 ${
                                    subOpen ? "rotate-180" : ""
                                  }`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2.5}
                                    d={ICONS.chevronDown}
                                  />
                                </svg>
                              </button>

                              {subOpen && (
                                <ul className="mt-0.5 space-y-0.5 border-l border-gray-100 pl-3 ml-3">
                                  {child.children.map((sub) => {
                                    const subActive = isActive(sub.href);
                                    return (
                                      <li key={sub.href}>
                                        <Link
                                          href={sub.href}
                                          prefetch
                                          className={`block rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150 ${
                                            subActive
                                              ? "bg-[#17D65D]/10 font-semibold text-[#0fa846]"
                                              : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                          }`}
                                        >
                                          {sub.label}
                                        </Link>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </li>
                          );
                        }

                        // Simple child link
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              prefetch
                              className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors duration-150 ${
                                childActive
                                  ? "bg-[#17D65D]/10 font-semibold text-[#0fa846]"
                                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                              }`}
                            >
                              <span className="truncate">{child.label}</span>
                              {child.badge && (
                                <span className="rounded-full bg-[#17D65D]/15 px-2 py-0.5 text-[10px] font-bold text-[#0fa846]">
                                  {child.badge}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ============ COLLAPSE TOGGLE (desktop only) ============ */}
        {!isMobile && (
          <div className="hidden shrink-0 border-t border-gray-100 p-2 lg:block">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-900"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
                  d={collapsed ? ICONS.expand : ICONS.collapse}
                />
              </svg>
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        )}
      </div>
    );
  };

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <>
      {/* ============ DESKTOP SIDEBAR ============ */}
      <aside
        className={`fixed left-0 top-0 z-40 hidden h-screen border-r border-gray-200 bg-white transition-[width] duration-200 ease-out lg:flex lg:flex-col ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* ============ MOBILE DRAWER ============ */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed left-0 top-0 z-50 h-screen w-72 max-w-[85vw] border-r border-gray-200 bg-white lg:hidden">
            <SidebarContent isMobile />
          </aside>
        </>
      )}

      {/* ============ TOP BAR ============ */}
      <header
        className={`sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-gray-200 bg-white/95 px-3 backdrop-blur transition-[padding] duration-200 ease-out sm:px-6 ${
          collapsed ? "lg:pl-[88px]" : "lg:pl-[272px]"
        }`}
      >
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors duration-150 hover:bg-gray-50 lg:hidden"
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
              d={ICONS.menu}
            />
          </svg>
        </button>

        {/* Mobile brand */}
        <Link
          href="/dashboard"
          prefetch
          className="flex items-center gap-2 lg:hidden"
        >
          <Image
            src="/technox-logo-black.png"
            alt="Techno X"
            width={32}
            height={32}
            priority
            className="h-8 w-8 object-contain"
          />
          <span className="truncate text-sm font-bold tracking-tight text-gray-900">
            {user?.company_name || "Techno X"}
          </span>
        </Link>

        {/* Search */}
        <div className="relative ml-2 hidden max-w-md flex-1 md:block">
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
              d={ICONS.search}
            />
          </svg>
          <input
            type="search"
            placeholder="Search anything…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-[#17D65D] focus:bg-white focus:ring-2 focus:ring-[#17D65D]/20"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-900"
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
                  d={ICONS.bell}
                />
              </svg>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#17D65D] ring-2 ring-white" />
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Notifications
                  </h3>
                  <Link
                    href="/notifications"
                    prefetch
                    className="text-xs font-semibold text-[#17D65D] hover:underline"
                  >
                    View all
                  </Link>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {[
                    {
                      id: 1,
                      title: "New lead assigned",
                      desc: "Ahmed Khan has been assigned to you",
                      time: "5 min ago",
                    },
                    {
                      id: 2,
                      title: "Invoice #INV-1024 paid",
                      desc: "Rs 125,000 received from Techno Traders",
                      time: "1 hour ago",
                    },
                    {
                      id: 3,
                      title: "Low stock alert",
                      desc: "Dell Latitude E7470 is below minimum",
                      time: "3 hours ago",
                    },
                  ].map((n) => (
                    <div
                      key={n.id}
                      className="border-b border-gray-50 px-4 py-3 transition hover:bg-gray-50/70"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">{n.desc}</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                        {n.time}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div ref={userRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-label="User menu"
              className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors duration-150 hover:bg-gray-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#17D65D] to-[#0fa846] text-xs font-bold text-black">
                {initials}
              </span>
              <div className="hidden flex-col items-start leading-tight md:flex">
                <span className="max-w-[120px] truncate text-xs font-semibold text-gray-900">
                  {user?.name || "User"}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  {user?.role || "Member"}
                </span>
              </div>
              <svg
                className={`hidden h-3 w-3 text-gray-400 transition-transform duration-200 md:block ${
                  userMenuOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d={ICONS.chevronDown}
                />
              </svg>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg ring-1 ring-black/5">
                <div className="border-b border-gray-100 px-3 py-2">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {user?.name || "User"}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {user?.email || ""}
                  </p>
                </div>
                <Link
                  href="/profile"
                  prefetch
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
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
                      d={ICONS.user}
                    />
                  </svg>
                  My Profile
                </Link>
                <Link
                  href="/settings/company"
                  prefetch
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
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
                      d={ICONS.building}
                    />
                  </svg>
                  Company Settings
                </Link>
                <div className="my-1 h-px bg-gray-100" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
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
                      d={ICONS.logout}
                    />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

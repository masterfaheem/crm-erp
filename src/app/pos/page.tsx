"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/app/components/Navbar";
import { useAccess } from "@/app/components/useAccess";
import { OrderBoard, type Order as BoardOrder } from "@/app/dispatch/OrderBoard";
import { LEAD_SOURCES, LEAD_SOURCE_GROUPS, PROFESSIONS } from "@/lib/leadOptions";

/* ============================================================
   TYPES
============================================================ */
interface Customer {
  id: number;
  customer_code: string;
  customer_type: "individual" | "business";
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  tax_number: string | null;
  billing_address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  current_balance: number;
  balance_type: "debit" | "credit";
  credit_limit: number;
  credit_days: number;
  currency_code: string;
  status: "active" | "inactive";
}

interface Product {
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
  current_stock: number;
  unit_name: string | null;
  unit_short_name: string | null;
  category_name: string | null;
  category_color: string | null;
  status: string;
}

interface CartItem {
  key: string;
  product_id: number;
  name: string;
  sku: string;
  barcode: string | null;
  unit_short_name: string;
  category_name: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
  line_total: number;
  available_stock: number;
}

/* online order handed over from a won lead (see /dispatch) */
interface OnlineOrder {
  id: number;
  sales_order_id: number;
  order_number: string;
  customer_id: number;
  advance_amount: number;
  cod_amount: number;
  total_amount: number;
  specs_note: string | null;
  delivery_name: string;
  delivery_phone: string;
  delivery_phone2: string | null;
  delivery_house: string | null;
  delivery_street: string | null;
  delivery_area: string | null;
  delivery_landmark: string | null;
  delivery_city: string;
  items: {
    product_id: number | null;
    description: string;
    product_name: string | null;
    sku: string | null;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    discount_percent: number;
  }[];
}

/* walk-in bill -> CRM lead (marked Won on sale) */
interface WalkInLead {
  lead_id: number | null;
  source: string;
  profession: string;
  profession_other: string;
}
interface LeadMatch {
  open_leads: { id: number; lead_number: string; first_name: string; last_name: string | null; status: string; source: string | null; profession: string | null }[];
  last: { lead_number: string; status: string; source: string | null; profession: string | null; profession_other: string | null } | null;
  past_purchases: number;
}
const EMPTY_WALK_IN: WalkInLead = { lead_id: null, source: "", profession: "", profession_other: "" };

function newCheckoutRef(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

interface InvoiceResult {
  id: number;
  lead_text?: string | null;
  lead_warning?: string | null;
  invoice_number: string;
  customer_name: string;
  grand_total: number;
  paid_amount: number;
  change_due: number;
  payment_method: string;
  created_at: string;
}

/* ============================================================
   HELPERS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

function formatCurrency(n: number, currency = "PKR"): string {
  const code = currency === "PKR" ? "Rs " : currency + " ";
  return (
    code +
    (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })
  );
}

function genKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

function computeLineTotal(item: {
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
}): number {
  const gross = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  const discount = gross * ((Number(item.discount_percent) || 0) / 100);
  const taxable = gross - discount;
  const tax = taxable * ((Number(item.tax_rate) || 0) / 100);
  return Math.round((taxable + tax) * 100) / 100;
}

function stockColor(stock: number): string {
  if (stock <= 0) return "text-red-600";
  if (stock <= 10) return "text-amber-600";
  return "text-gray-500";
}

/* ============================================================
   PAGE
============================================================ */
export default function POSPage() {
  return (
    <>
      <Navbar />
      <POSMain />
    </>
  );
}

function POSMain() {
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
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
        <POSContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function POSContent() {
  const { can } = useAccess();
  /* ---------- Customer state ---------- */
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );

  /* ---------- Cart state ---------- */
  const [cart, setCart] = useState<CartItem[]>([]);

  /* ---------- Order-level state ---------- */
  const [orderDiscountPercent, setOrderDiscountPercent] = useState(0);
  const [shippingFee, setShippingFee] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");

  /* ---------- UI state ---------- */
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState<InvoiceResult | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<OnlineOrder[]>([]);
  const [linkedOrder, setLinkedOrder] = useState<OnlineOrder | null>(null);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [notice, setNotice] = useState("");
  const [showOrders, setShowOrders] = useState(false);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const [boardKey, setBoardKey] = useState(0);
  /* walk-in lead details + one id per checkout (double-click / retry safe) */
  const [walkIn, setWalkIn] = useState<WalkInLead>(EMPTY_WALK_IN);
  const [leadMatch, setLeadMatch] = useState<LeadMatch | null>(null);
  const checkoutRef = useRef("");

  /* online-order counts for the header badge (refresh every minute) */
  const refreshCounts = useCallback(async () => {
    try {
      const r = await fetch("/api/dispatch?status=pending", { credentials: "include" });
      if (r.ok) setOrderCounts((await r.json()).counts || {});
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCounts();
    const t = setInterval(refreshCounts, 60000);
    return () => clearInterval(t);
  }, [refreshCounts]);

  /* ---------- Online orders (won leads) ---------- */
  const loadOrderIntoCart = useCallback((o: OnlineOrder) => {
    const items: CartItem[] = o.items.map((it) => {
      const item: CartItem = {
        key: genKey(),
        product_id: it.product_id || 0,
        name: it.product_name || it.description || "Item",
        sku: it.sku || (it.product_id ? "" : "CUSTOM"),
        barcode: null,
        unit_short_name: "pcs",
        category_name: null,
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        tax_rate: Number(it.tax_rate) || 0,
        discount_percent: Number(it.discount_percent) || 0,
        available_stock: 0,
        line_total: 0,
      };
      item.line_total = computeLineTotal(item);
      return item;
    });
    setCart(items);
    setLinkedOrder(o);
    setReference(o.order_number);
    setNotes(
      `Deliver to ${o.delivery_name}, ${o.delivery_phone}${o.delivery_phone2 ? " / " + o.delivery_phone2 : ""} — ` +
        [o.delivery_house, o.delivery_street, o.delivery_area, o.delivery_landmark && (/^near\b/i.test(o.delivery_landmark) ? o.delivery_landmark : `Near ${o.delivery_landmark}`), o.delivery_city]
          .filter(Boolean)
          .join(", ")
    );
    setAmountPaid(String(Number(o.advance_amount) || 0));
    setOrderDiscountPercent(0);
    setShippingFee(0);
  }, []);

  const selectCustomer = useCallback(async (c: Customer | null) => {
    setSelectedCustomer(c);
    setPendingOrders([]);
    setWalkIn(EMPTY_WALK_IN);
    setLeadMatch(null);
    if (!c) {
      setLinkedOrder(null);
      return;
    }
    /* walk-in: find the customer's open lead / last known source to pre-fill */
    fetch(`/api/pos/lead-match?customer_id=${c.id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const m: LeadMatch | null = j?.data || null;
        setLeadMatch(m);
        if (!m) return;
        const open = m.open_leads[0];
        /* open lead keeps its source; a returning buyer is "Repeat" */
        const src = open?.source || (m.past_purchases > 0 ? "repeat" : m.last?.source || "");
        setWalkIn({
          lead_id: open ? open.id : null,
          source: src || "",
          profession: open?.profession || m.last?.profession || "",
          profession_other: m.last?.profession_other || "",
        });
      })
      .catch(() => {});
    try {
      const r = await fetch(`/api/dispatch?status=pending&customer_id=${c.id}`, { credentials: "include" });
      if (r.ok) setPendingOrders((await r.json()).data || []);
    } catch {
      /* ignore */
    }
  }, []);

  /* "Load & Bill" from the Online Orders panel */
  const billFromBoard = useCallback(
    async (o: BoardOrder) => {
      try {
        const cr = await fetch(`/api/customers/${o.customer_id}`, { credentials: "include" });
        if (!cr.ok) throw new Error();
        const c = (await cr.json()) as Customer;
        const order = o as unknown as OnlineOrder;
        setSelectedCustomer(c);
        setPendingOrders([order]);
        loadOrderIntoCart(order);
        setShowOrders(false);
        setNotice(`Order ${o.order_number} loaded — check the cart and click Charge to bill.`);
      } catch {
        setNotice("Could not load this order's customer.");
      }
    },
    [loadOrderIntoCart]
  );

  /* open POS with ?order=<sales_order_id> from the dispatch page */
  useEffect(() => {
    const soId = Number(new URLSearchParams(window.location.search).get("order"));
    if (!soId) return;
    (async () => {
      try {
        const r = await fetch(`/api/dispatch?status=all&sales_order_id=${soId}`, { credentials: "include" });
        const o: OnlineOrder | undefined = r.ok ? (await r.json()).data?.[0] : undefined;
        if (!o) return;
        const cr = await fetch(`/api/customers/${o.customer_id}`, { credentials: "include" });
        if (!cr.ok) return;
        const c = (await cr.json()) as Customer;
        setSelectedCustomer(c);
        setPendingOrders([o]);
        loadOrderIntoCart(o);
      } catch {
        /* ignore */
      }
    })();
  }, [loadOrderIntoCart]);

  /* a changed bill is a new checkout */
  useEffect(() => {
    checkoutRef.current = "";
  }, [cart, selectedCustomer, linkedOrder]);

  /* ---------- Cart ops ---------- */
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((x) => x.product_id === product.id);
      if (existing) {
        if (product.product_type === "product" && existing.quantity + 1 > product.current_stock) {
          // allow overselling for service-type only
          return prev;
        }
        return prev.map((x) =>
          x.product_id === product.id
            ? {
                ...x,
                quantity: x.quantity + 1,
                line_total: computeLineTotal({
                  ...x,
                  quantity: x.quantity + 1,
                }),
              }
            : x
        );
      }
      const item: CartItem = {
        key: genKey(),
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        unit_short_name: product.unit_short_name || "pcs",
        category_name: product.category_name,
        quantity: 1,
        unit_price: Number(product.sale_price) || 0,
        tax_rate: Number(product.tax_rate) || 0,
        discount_percent: Number(product.discount_percent) || 0,
        available_stock: Number(product.current_stock) || 0,
        line_total: 0,
      };
      item.line_total = computeLineTotal(item);
      return [...prev, item];
    });
  }, []);

  const updateCartItem = (key: string, patch: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        next.line_total = computeLineTotal(next);
        return next;
      })
    );
  };

  const removeCartItem = (key: string) =>
    setCart((prev) => prev.filter((it) => it.key !== key));

  const changeQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const nextQty = Math.max(1, it.quantity + delta);
        const next = { ...it, quantity: nextQty };
        next.line_total = computeLineTotal(next);
        return next;
      })
    );
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm("Clear all items from the cart?")) setCart([]);
  };

  /* ---------- Totals ---------- */
  const totals = useMemo(() => {
    const subtotal = cart.reduce((acc, it) => {
      const gross = it.quantity * it.unit_price;
      const discount = gross * (it.discount_percent / 100);
      return acc + (gross - discount);
    }, 0);

    const itemDiscountTotal = cart.reduce((acc, it) => {
      const gross = it.quantity * it.unit_price;
      return acc + gross * (it.discount_percent / 100);
    }, 0);

    const taxTotal = cart.reduce((acc, it) => {
      const gross = it.quantity * it.unit_price;
      const discount = gross * (it.discount_percent / 100);
      return acc + (gross - discount) * (it.tax_rate / 100);
    }, 0);

    // Order-level discount applied on (subtotal + tax)
    const orderDiscountAmt =
      (subtotal + taxTotal) * (orderDiscountPercent / 100);

    const grandTotal =
      subtotal + taxTotal - orderDiscountAmt + (Number(shippingFee) || 0);

    const totalQty = cart.reduce((acc, it) => acc + it.quantity, 0);

    return {
      subtotal,
      itemDiscountTotal,
      taxTotal,
      orderDiscountAmt,
      shipping: Number(shippingFee) || 0,
      grandTotal: Math.max(0, grandTotal),
      totalQty,
      itemCount: cart.length,
    };
  }, [cart, orderDiscountPercent, shippingFee]);

  const paid = Number(amountPaid) || 0;
  const changeDue = Math.max(0, paid - totals.grandTotal);
  const balanceDue = Math.max(0, totals.grandTotal - paid);

  /* ---------- Submit ---------- */
  const handleSubmit = async () => {
    setError("");
    if (!selectedCustomer) {
      setError("Please select a customer.");
      return;
    }
    if (cart.length === 0) {
      setError("Cart is empty.");
      return;
    }
    if (!linkedOrder && !walkIn.lead_id && !walkIn.source) {
      setError("Select the lead source (how the customer found Techno X) — it is saved on the CRM lead.");
      return;
    }
    if (paid < totals.grandTotal) {
      if (
        !window.confirm(
          `Received ${formatCurrency(paid)} of ${formatCurrency(totals.grandTotal)}.\n` +
            `${formatCurrency(totals.grandTotal - paid)} will go to ${selectedCustomer.name}'s khata as credit (balance due). Continue?`
        )
      )
        return;
    }

    setSaving(true);
    try {
      if (!checkoutRef.current) checkoutRef.current = newCheckoutRef();
      const payload = {
        client_ref: checkoutRef.current,
        walk_in_lead: linkedOrder
          ? null
          : {
              lead_id: walkIn.lead_id,
              source: walkIn.source || null,
              profession: walkIn.profession || null,
              profession_other: walkIn.profession === "other" ? walkIn.profession_other || null : null,
            },
        customer_id: selectedCustomer.id,
        invoice_date: new Date().toISOString().slice(0, 10),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        payment_method: paymentMethod === "credit" ? "none" : paymentMethod,
        payment_reference: paymentRef.trim() || null,
        amount_paid: paymentMethod === "credit" ? 0 : paid,
        order_discount_percent: Number(orderDiscountPercent) || 0,
        shipping_fee: Number(shippingFee) || 0,
        subtotal: Math.round(totals.subtotal * 100) / 100,
        item_discount_total:
          Math.round(totals.itemDiscountTotal * 100) / 100,
        order_discount_amount:
          Math.round(totals.orderDiscountAmt * 100) / 100,
        tax_total: Math.round(totals.taxTotal * 100) / 100,
        shipping_total: Math.round(totals.shipping * 100) / 100,
        grand_total: Math.round(totals.grandTotal * 100) / 100,
        sales_order_id: linkedOrder ? linkedOrder.sales_order_id : null,
        items: cart.map((it) => ({
          product_id: it.product_id || null,
          description: it.name,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          tax_rate: Number(it.tax_rate) || 0,
          discount_percent: Number(it.discount_percent) || 0,
          line_total: computeLineTotal(it),
        })),
      };

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error || "Failed to create invoice."
        );
      }

      const json = await res.json();
      checkoutRef.current = "";
      setShowSuccess({
        id: json.data?.id ?? 0,
        lead_text: json.lead
          ? `${json.lead.lead_number} ${json.lead.created ? "created" : "updated"} — marked Won (walk-in)`
          : linkedOrder
          ? "Online order — its lead is already Won"
          : null,
        lead_warning: json.lead_warning || null,
        invoice_number: json.data?.invoice_number ?? "INV-XXX",
        customer_name: selectedCustomer.name,
        grand_total: totals.grandTotal,
        paid_amount: paid,
        change_due: changeDue,
        payment_method: paymentMethod,
        created_at: new Date().toISOString(),
      });

      /* reset */
      setCart([]);
      setSelectedCustomer(null);
      setLinkedOrder(null);
      setPendingOrders([]);
      setWalkIn(EMPTY_WALK_IN);
      setLeadMatch(null);
      refreshCounts();
      setAmountPaid("");
      setPaymentRef("");
      setPaymentMethod("bank_transfer");
      setOrderDiscountPercent(0);
      setShippingFee(0);
      setNotes("");
      setReference("");
      setShowCheckout(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Point of Sale
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Create invoices at the counter — stock updates automatically.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="hidden sm:inline">
            {new Date().toLocaleDateString("en-PK", {
              weekday: "long",
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              setShowOrders(true);
              setBoardKey((k) => k + 1);
            }}
            className="relative inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
          >
            📦 Online Orders
            {!!orderCounts.pending && (
              <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {orderCounts.pending} to bill
              </span>
            )}
            {!!orderCounts.invoiced && (
              <span className="rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
                {orderCounts.invoiced} to dispatch
              </span>
            )}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#17D65D]/30 bg-[#17D65D]/10 px-2.5 py-1 text-[11px] font-semibold text-[#0fa846]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#17D65D]" />
            Register open
          </span>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* ============== LEFT: Customer + Products ============== */}
        <div className="space-y-4 xl:col-span-7">
          {/* CUSTOMER SEARCH */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                Customer
              </h2>
              {selectedCustomer ? (
                <button
                  type="button"
                  onClick={() => selectCustomer(null)}
                  className="text-xs font-medium text-gray-500 hover:text-red-600"
                >
                  Change
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowQuickCustomer(true)}
                  className="text-xs font-semibold text-[#0fa846] hover:underline"
                >
                  + New Customer
                </button>
              )}
            </div>
            {notice && (
              <div className="mb-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
                {notice}
                <button className="ml-2 font-semibold underline" onClick={() => setNotice("")}>OK</button>
              </div>
            )}
            {selectedCustomer ? (
              <CustomerCard customer={selectedCustomer} />
            ) : (
              <CustomerSearch onSelect={selectCustomer} />
            )}
            {selectedCustomer && pendingOrders.length > 0 && (
              <div className="mt-3 space-y-2">
                {pendingOrders.map((o) => {
                  const active = linkedOrder?.sales_order_id === o.sales_order_id;
                  return (
                    <div
                      key={o.id}
                      className={`rounded-md border px-3 py-2 text-xs ${
                        active ? "border-[#17D65D] bg-[#17D65D]/10" : "border-green-200 bg-green-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900">
                          🟢 Online order {o.order_number}
                        </span>
                        {active ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLinkedOrder(null);
                              setCart([]);
                              setReference("");
                              setNotes("");
                              setAmountPaid("");
                            }}
                            className="font-semibold text-gray-500 hover:text-red-600"
                          >
                            Unlink
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => loadOrderIntoCart(o)}
                            className="rounded bg-[#17D65D] px-2 py-1 font-bold text-black hover:bg-[#15c455]"
                          >
                            Load order
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-gray-700">
                        {o.items.map((it) => `${it.product_name || it.description} ×${Number(it.quantity)}`).join(", ")}
                      </p>
                      <p className="mt-0.5 text-gray-600">
                        Total {formatCurrency(o.total_amount)} · Paid{" "}
                        <b className="text-green-700">{formatCurrency(o.advance_amount)}</b>
                        {Number(o.cod_amount) > 0 ? (
                          <>
                            {" "}· Balance due <b className="text-red-600">{formatCurrency(o.cod_amount)}</b>
                          </>
                        ) : (
                          <b className="text-green-700"> · Fully paid</b>
                        )}
                      </p>
                      {active && (
                        <p className="mt-1 font-semibold text-[#0fa846]">
                          ✓ Loaded — the bill will be linked to this order (its payment is already counted).
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PRODUCT SEARCH */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                Products
              </h2>
              <span className="text-[11px] text-gray-400">
                Search by name, SKU, or scan barcode
              </span>
            </div>
            <ProductSearch onAdd={addToCart} cart={cart} />
          </div>
        </div>

        {/* ============== RIGHT: Cart / Checkout ============== */}
        <div className="xl:col-span-5">
          <div className="sticky top-20 flex flex-col rounded-lg border border-gray-200 bg-white">
            {/* CART HEADER */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <h2 className="text-sm font-semibold text-gray-800">
                  Current Sale
                </h2>
                <span className="rounded-full bg-[#17D65D]/15 px-2 py-0.5 text-[11px] font-semibold text-[#0fa846]">
                  {totals.itemCount}
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs font-medium text-gray-500 hover:text-red-600"
                >
                  Clear
                </button>
              )}
            </div>

            {/* CART ITEMS */}
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <svg
                    className="h-7 w-7 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700">
                  No items yet
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Add products from the left to start a sale.
                </p>
              </div>
            ) : (
              <>
                <div className="max-h-[42vh] overflow-y-auto">
                  <ul className="divide-y divide-gray-100">
                    {cart.map((it) => (
                      <li key={it.key} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-900">
                              {it.name}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                              <span className="font-mono">{it.sku}</span>
                              <span>·</span>
                              <span>{formatCurrency(it.unit_price)}</span>
                              <span>·</span>
                              <span
                                className={stockColor(it.available_stock)}
                              >
                                Stock: {it.available_stock}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCartItem(it.key)}
                            className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <svg
                              className="h-3.5 w-3.5"
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

                        {/* Qty + line total */}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="inline-flex items-center rounded-md border border-gray-300">
                            <button
                              type="button"
                              onClick={() => changeQty(it.key, -1)}
                              className="px-2 py-1 text-gray-600 transition hover:bg-gray-50"
                            >
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M20 12H4"
                                />
                              </svg>
                            </button>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={it.quantity}
                              onChange={(e) =>
                                updateCartItem(it.key, {
                                  quantity: Math.max(
                                    1,
                                    Number(e.target.value) || 1
                                  ),
                                })
                              }
                              className="w-14 border-x border-gray-300 bg-white px-1 py-1 text-center text-sm outline-none focus:bg-[#17D65D]/5"
                            />
                            <button
                              type="button"
                              onClick={() => changeQty(it.key, 1)}
                              className="px-2 py-1 text-gray-600 transition hover:bg-gray-50"
                            >
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                            </button>
                          </div>
                          <div className="text-sm font-semibold text-gray-900">
                            {formatCurrency(computeLineTotal(it))}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* TOTALS */}
                <div className="space-y-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
                  <Row label="Subtotal" value={formatCurrency(totals.subtotal)} />
                  {totals.itemDiscountTotal > 0 && (
                    <Row
                      label="Item discount"
                      value={`− ${formatCurrency(totals.itemDiscountTotal)}`}
                      muted
                    />
                  )}
                  <Row
                    label="Tax"
                    value={formatCurrency(totals.taxTotal)}
                    muted
                  />

                  {/* Order discount input (needs "Give discount" permission) */}
                  {can("sales.discount") && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-500">Order discount %</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={orderDiscountPercent}
                      onChange={(e) =>
                        setOrderDiscountPercent(Number(e.target.value) || 0)
                      }
                      className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-[#17D65D]"
                    />
                  </div>
                  )}
                  {totals.orderDiscountAmt > 0 && (
                    <Row
                      label="Order discount"
                      value={`− ${formatCurrency(totals.orderDiscountAmt)}`}
                      muted
                    />
                  )}

                  {/* Shipping input */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-500">Shipping</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={shippingFee}
                      onChange={(e) =>
                        setShippingFee(Number(e.target.value) || 0)
                      }
                      className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-[#17D65D]"
                    />
                  </div>

                  <div className="my-1 border-t border-gray-200" />

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">
                      Total
                    </span>
                    <span className="text-lg font-bold text-[#0fa846]">
                      {formatCurrency(totals.grandTotal)}
                    </span>
                  </div>
                </div>

                {/* CHECKOUT BUTTON */}
                <div className="border-t border-gray-200 p-4">
                  <button
                    type="button"
                    onClick={() => {
                      // prepaid: default to the full bill. Online order -> what was already received
                      setAmountPaid(
                        String(
                          linkedOrder
                            ? Math.min(Number(linkedOrder.advance_amount) || 0, totals.grandTotal)
                            : totals.grandTotal
                        )
                      );
                      if (paymentMethod === "credit") setPaymentMethod("bank_transfer");
                      setShowCheckout(true);
                    }}
                    disabled={!selectedCustomer}
                    className={`${btnPrimary} w-full py-3 text-base`}
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
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    Charge {formatCurrency(totals.grandTotal)}
                  </button>
                  {!selectedCustomer && (
                    <p className="mt-2 text-center text-[11px] text-amber-600">
                      Select a customer to continue
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* CHECKOUT MODAL */}
      {showOrders && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setShowOrders(false)}>
          <div
            className="h-full w-full max-w-xl overflow-y-auto bg-gray-50 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">📦 Online Orders</h2>
                <p className="text-xs text-gray-500">Bill → Dispatch → Deliver → Review</p>
              </div>
              <button onClick={() => setShowOrders(false)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200">✕</button>
            </div>
            <OrderBoard
              compact
              initialTab={orderCounts.pending ? "pending" : "invoiced"}
              refreshKey={boardKey}
              onBill={billFromBoard}
              onTabChange={() => refreshCounts()}
            />
          </div>
        </div>
      )}

      {showQuickCustomer && (
        <QuickCustomerModal
          onClose={() => setShowQuickCustomer(false)}
          onDone={(c, existing) => {
            setShowQuickCustomer(false);
            selectCustomer(c);
            setNotice(
              existing
                ? `This number already belongs to ${c.customer_code} — ${c.name}. Selected the existing customer (no duplicate).`
                : `New customer ${c.customer_code} added.`
            );
          }}
        />
      )}

      {showCheckout && selectedCustomer && (
        <CheckoutModal
          customer={selectedCustomer}
          totals={totals}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          amountPaid={amountPaid}
          setAmountPaid={setAmountPaid}
          paymentRef={paymentRef}
          setPaymentRef={setPaymentRef}
          alreadyPaid={linkedOrder ? Math.min(Number(linkedOrder.advance_amount) || 0, totals.grandTotal) : 0}
          changeDue={changeDue}
          balanceDue={balanceDue}
          reference={reference}
          setReference={setReference}
          notes={notes}
          setNotes={setNotes}
          saving={saving}
          error={error}
          walkIn={linkedOrder ? null : walkIn}
          setWalkIn={setWalkIn}
          leadMatch={leadMatch}
          onClose={() => setShowCheckout(false)}
          onSubmit={handleSubmit}
        />
      )}

      {/* SUCCESS MODAL */}
      {showSuccess && (
        <SuccessModal
          result={showSuccess}
          onClose={() => setShowSuccess(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   SMALL HELPERS
============================================================ */
function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={muted ? "text-gray-700" : "font-medium text-gray-800"}>
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   CUSTOMER CARD
============================================================ */
function CustomerCard({ customer }: { customer: Customer }) {
  const bal = Number(customer.current_balance) || 0;
  const balanceLabel = bal > 0 ? "Balance due" : bal < 0 ? "Advance (credit)" : "Khata clear";
  const balanceColor = bal > 0 ? "text-red-600" : "text-[#0fa846]";

  return (
    <div className="rounded-md border border-[#17D65D]/30 bg-[#17D65D]/5 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#17D65D]/20 text-sm font-bold text-[#0fa846]">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <div className="text-sm font-semibold text-gray-900">
              {customer.name}
            </div>
            <span className="font-mono text-[11px] text-gray-500">
              {customer.customer_code}
            </span>
            <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              {customer.customer_type}
            </span>
          </div>
          {customer.company_name && (
            <div className="text-xs text-gray-600">
              {customer.company_name}
            </div>
          )}
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
            {customer.phone && (
              <div className="truncate">
                <span className="text-gray-400">📞 </span>
                {customer.phone}
              </div>
            )}
            {customer.email && (
              <div className="truncate">
                <span className="text-gray-400">✉ </span>
                {customer.email}
              </div>
            )}
            {customer.city && (
              <div className="truncate">
                <span className="text-gray-400">📍 </span>
                {customer.city}
              </div>
            )}
            {customer.tax_number && (
              <div className="truncate">
                <span className="text-gray-400">NTN </span>
                <span className="font-mono">{customer.tax_number}</span>
              </div>
            )}
          </div>
        </div>
        {customer.current_balance !== null && customer.current_balance !== undefined && (
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">
            {balanceLabel}
          </div>
          <div className={`text-sm font-semibold ${balanceColor}`}>
            {formatCurrency(
              Math.abs(customer.current_balance),
              customer.currency_code
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   QUICK ADD CUSTOMER (walk-in) — phone checked for duplicates
============================================================ */
function QuickCustomerModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (c: Customer, existing: boolean) => void;
}) {
  const [f, setF] = useState({ name: "", phone: "", whatsapp: "", city: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!f.name.trim()) return setError("Name is required");
    if (f.phone.replace(/\D/g, "").length < 10) return setError("Enter a valid phone number");
    setSaving(true);
    try {
      const r = await fetch("/api/customers/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(f),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to add customer");
      onDone(j.data as Customer, !!j.existing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">New Customer (walk-in)</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          If this number is already a customer, the existing one is selected — no duplicates.
        </p>
        <div className="mt-4 space-y-3">
          <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name *" className={inputCls} />
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone * (03XX XXXXXXX)" inputMode="tel" className={inputCls} />
          <input value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder="WhatsApp (if different)" inputMode="tel" className={inputCls} />
          <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="City" className={inputCls} />
          <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Address" className={inputCls} />
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Saving..." : "Add & Select"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============================================================
   CUSTOMER SEARCH (real-time)
============================================================ */
function CustomerSearch({
  onSelect,
}: {
  onSelect: (c: Customer) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("search", query.trim());
        params.set("status", "active");
        params.set("limit", "20");
        const res = await fetch(`/api/customers?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        const json = await res.json();
        setResults(json.data || []);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[highlight];
      if (pick) {
        onSelect(pick);
        setQuery("");
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
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
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search customer by name, phone, email, or code..."
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-10 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
        />
        {loading && (
          <div className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#17D65D]" />
          </div>
        )}
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              Searching customers...
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              {query
                ? `No customers match "${query}".`
                : "Start typing to search customers..."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((c, idx) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => {
                      onSelect(c);
                      setQuery("");
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${
                      idx === highlight ? "bg-[#17D65D]/10" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {c.name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                          <span className="font-mono">
                            {c.customer_code}
                          </span>
                          {c.phone && (
                            <>
                              <span>·</span>
                              <span>{c.phone}</span>
                            </>
                          )}
                          {c.city && (
                            <>
                              <span>·</span>
                              <span>{c.city}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {c.current_balance !== null && c.current_balance !== undefined && (
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">
                        {Number(c.current_balance) > 0 ? "Due" : Number(c.current_balance) < 0 ? "Advance" : "Clear"}
                      </div>
                      <div
                        className={`text-xs font-semibold ${
                          Number(c.current_balance) > 0
                            ? "text-red-600"
                            : "text-gray-700"
                        }`}
                      >
                        {formatCurrency(
                          Math.abs(c.current_balance),
                          c.currency_code
                        )}
                      </div>
                    </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PRODUCT SEARCH (real-time)
============================================================ */
function ProductSearch({
  onAdd,
  cart,
}: {
  onAdd: (p: Product) => void;
  cart: CartItem[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cartQtyMap = useMemo(() => {
    const m = new Map<number, number>();
    cart.forEach((it) => m.set(it.product_id, it.quantity));
    return m;
  }, [cart]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("search", query.trim());
        params.set("status", "active");
        params.set("limit", "25");
        const res = await fetch(`/api/products?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        const json = await res.json();
        setResults(json.data || []);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAdd = (p: Product) => {
    onAdd(p);
    setJustAdded(p.id);
    setTimeout(() => setJustAdded(null), 900);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[highlight];
      if (pick) handleAdd(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
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
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search product by name, SKU, or barcode..."
          className="w-full rounded-md border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
        />
        {loading && (
          <div className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#17D65D]" />
          </div>
        )}
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              Searching products...
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              {query
                ? `No products match "${query}".`
                : "Start typing to search products..."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((p, idx) => {
                const inCart = cartQtyMap.get(p.id) || 0;
                const stock = Number(p.current_stock) || 0;
                const outOfStock =
                  p.product_type === "product" && stock <= 0;
                const justWasAdded = justAdded === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={outOfStock}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => handleAdd(p)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${
                        outOfStock
                          ? "cursor-not-allowed opacity-50"
                          : justWasAdded
                          ? "bg-[#17D65D]/20"
                          : idx === highlight
                          ? "bg-[#17D65D]/10"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {p.category_color ? (
                          <span
                            className="h-8 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: p.category_color }}
                          />
                        ) : (
                          <span className="h-8 w-1 shrink-0 rounded-full bg-gray-200" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-gray-900">
                              {p.name}
                            </span>
                            {justWasAdded && (
                              <span className="shrink-0 rounded bg-[#17D65D] px-1.5 py-0.5 text-[10px] font-semibold text-black">
                                +1
                              </span>
                            )}
                            {inCart > 0 && !justWasAdded && (
                              <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                {inCart} in cart
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                            <span className="font-mono">{p.sku}</span>
                            {p.barcode && (
                              <>
                                <span>·</span>
                                <span className="font-mono">{p.barcode}</span>
                              </>
                            )}
                            {p.unit_short_name && (
                              <>
                                <span>·</span>
                                <span>Per {p.unit_short_name}</span>
                              </>
                            )}
                            <span>·</span>
                            <span className={stockColor(stock)}>
                              {outOfStock ? "Out of stock" : `Stock: ${stock}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end">
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(Number(p.sale_price))}
                        </span>
                        {!outOfStock && (
                          <span className="mt-0.5 inline-flex items-center gap-1 rounded border border-[#17D65D]/40 bg-[#17D65D]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#0fa846]">
                            <svg
                              className="h-2.5 w-2.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                            ADD
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CHECKOUT MODAL
============================================================ */
function CheckoutModal({
  customer,
  totals,
  paymentMethod,
  setPaymentMethod,
  amountPaid,
  setAmountPaid,
  paymentRef,
  setPaymentRef,
  alreadyPaid,
  changeDue,
  balanceDue,
  reference,
  setReference,
  notes,
  setNotes,
  saving,
  error,
  walkIn,
  setWalkIn,
  leadMatch,
  onClose,
  onSubmit,
}: {
  walkIn: WalkInLead | null;
  setWalkIn: (v: WalkInLead) => void;
  leadMatch: LeadMatch | null;
  customer: Customer;
  totals: {
    subtotal: number;
    itemDiscountTotal: number;
    taxTotal: number;
    orderDiscountAmt: number;
    shipping: number;
    grandTotal: number;
    totalQty: number;
    itemCount: number;
  };
  paymentMethod: string;
  setPaymentMethod: (v: string) => void;
  amountPaid: string;
  setAmountPaid: (v: string) => void;
  paymentRef: string;
  setPaymentRef: (v: string) => void;
  alreadyPaid: number;
  changeDue: number;
  balanceDue: number;
  reference: string;
  setReference: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const quickAmounts = useMemo(() => {
    const base = Math.ceil(totals.grandTotal / 500) * 500;
    return [
      totals.grandTotal,
      base,
      base + 500,
      base + 1000,
      base + 2000,
    ].filter((v, i, a) => a.indexOf(v) === i);
  }, [totals.grandTotal]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Complete Sale
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {customer.name} · {customer.customer_code}
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

        {/* BODY */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* TOTAL */}
          <div className="rounded-lg border border-[#17D65D]/30 bg-[#17D65D]/5 p-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-[#0fa846]">
              Amount due
            </div>
            <div className="mt-1 text-3xl font-bold text-gray-900">
              {formatCurrency(totals.grandTotal)}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              {totals.itemCount} item{totals.itemCount !== 1 ? "s" : ""} ·{" "}
              {totals.totalQty} qty
            </div>
          </div>

          {/* PAYMENT METHOD */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">
              Payment method
            </label>
            {alreadyPaid > 0 && (
              <div className="mb-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                Already received with the order: <b>{formatCurrency(alreadyPaid)}</b>
                {alreadyPaid < totals.grandTotal
                  ? ` — enter the total received (incl. this) if the customer paid the rest.`
                  : " — fully paid."}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {[
                { id: "bank_transfer", label: "Bank Transfer", icon: "🏦" },
                { id: "cash", label: "Cash", icon: "💵" },
                { id: "wallet", label: "JazzCash / Easypaisa", icon: "📱" },
                { id: "card", label: "Card (POS)", icon: "💳" },
                { id: "credit", label: "Credit (khata)", icon: "🧾" },
              ].map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(pm.id);
                    if (pm.id === "credit") setAmountPaid(String(alreadyPaid));
                    else if (paymentMethod === "credit") setAmountPaid(String(totals.grandTotal));
                  }}
                  className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs font-medium transition ${
                    paymentMethod === pm.id
                      ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base">{pm.icon}</span>
                  <span className="text-center leading-tight">{pm.label}</span>
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === "credit" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Nothing received now — {formatCurrency(Math.max(0, totals.grandTotal - alreadyPaid))} will be added to the
              customer&apos;s khata as balance due.
            </div>
          )}

          {/* AMOUNT PAID */}
          {paymentMethod !== "credit" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Amount received
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className={`${inputCls} text-lg font-semibold`}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(paymentMethod === "cash" ? quickAmounts : [totals.grandTotal]).map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmountPaid(String(amt))}
                    className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
                  >
                    {formatCurrency(amt)}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-gray-500">{paymentMethod === "cash" ? "Change to return" : "Extra received"}</div>
                  <div className="mt-0.5 text-sm font-semibold text-[#0fa846]">
                    {formatCurrency(changeDue)}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-gray-500">Credit (balance due)</div>
                  <div
                    className={`mt-0.5 text-sm font-semibold ${
                      balanceDue > 0 ? "text-red-600" : "text-gray-700"
                    }`}
                  >
                    {formatCurrency(balanceDue)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {paymentMethod !== "credit" && paymentMethod !== "cash" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Transaction ID / last 4 digits
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder={paymentMethod === "bank_transfer" ? "e.g. IBFT ref or sender name" : "Optional"}
                className={inputCls}
              />
            </div>
          )}

          {/* WALK-IN -> CRM LEAD */}
          {walkIn && (
            <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-900">Walk-in customer — CRM lead</span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Will be marked Won</span>
              </div>
              {leadMatch && leadMatch.open_leads.length > 0 ? (
                <select
                  value={walkIn.lead_id ?? ""}
                  onChange={(e) => setWalkIn({ ...walkIn, lead_id: Number(e.target.value) || null })}
                  className={`${inputCls} mb-2`}
                >
                  {leadMatch.open_leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      Use existing lead {l.lead_number} — {[l.first_name, l.last_name].filter(Boolean).join(" ")} ({l.status})
                    </option>
                  ))}
                  <option value="">Create a new lead instead</option>
                </select>
              ) : (
                <p className="mb-2 text-[11px] text-blue-800">
                  No open lead with this number — a new lead will be created
                  {leadMatch?.past_purchases ? " (repeat customer)" : ""}.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-700">
                    Lead source {walkIn.lead_id ? "" : "*"}
                  </label>
                  <select
                    value={walkIn.source}
                    onChange={(e) => setWalkIn({ ...walkIn, source: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {LEAD_SOURCE_GROUPS.map((g) => (
                      <optgroup key={g} label={g}>
                        {LEAD_SOURCES.filter((s) => s.group === g).map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-700">Profession</label>
                  <select
                    value={walkIn.profession}
                    onChange={(e) => setWalkIn({ ...walkIn, profession: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {PROFESSIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {walkIn.profession === "other" && (
                <input
                  value={walkIn.profession_other}
                  onChange={(e) => setWalkIn({ ...walkIn, profession_other: e.target.value })}
                  placeholder="Profession (write)"
                  className={`${inputCls} mt-2`}
                />
              )}
              {walkIn.lead_id ? (
                <p className="mt-1.5 text-[10.5px] text-gray-500">The existing lead keeps its own source; these only fill empty fields.</p>
              ) : null}
            </div>
          )}

          {/* REFERENCE */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">
              Reference / PO number
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              className={inputCls}
            />
          </div>

          {/* NOTES */}
          <div>
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

          {/* SUMMARY */}
          <div className="space-y-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
            <Row label="Subtotal" value={formatCurrency(totals.subtotal)} />
            {totals.itemDiscountTotal > 0 && (
              <Row
                label="Item discount"
                value={`− ${formatCurrency(totals.itemDiscountTotal)}`}
                muted
              />
            )}
            <Row label="Tax" value={formatCurrency(totals.taxTotal)} muted />
            {totals.orderDiscountAmt > 0 && (
              <Row
                label="Order discount"
                value={`− ${formatCurrency(totals.orderDiscountAmt)}`}
                muted
              />
            )}
            {totals.shipping > 0 && (
              <Row
                label="Shipping"
                value={formatCurrency(totals.shipping)}
                muted
              />
            )}
            <div className="my-1 border-t border-gray-200" />
            <Row
              label="Grand total"
              value={formatCurrency(totals.grandTotal)}
            />
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className={btnPrimary}
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                Processing...
              </>
            ) : (
              <>
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Complete Sale
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SUCCESS MODAL
============================================================ */
function SuccessModal({
  result,
  onClose,
}: {
  result: InvoiceResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="bg-[#17D65D]/10 px-6 py-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#17D65D] text-white shadow-lg">
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-gray-900">
            Sale Complete
          </h2>
          <p className="mt-0.5 text-xs text-gray-600">
            Invoice created successfully
          </p>
        </div>

        <div className="space-y-3 px-6 py-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Invoice #</span>
            <span className="font-mono font-semibold text-gray-900">
              {result.invoice_number}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Customer</span>
            <span className="font-medium text-gray-900">
              {result.customer_name}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Total</span>
            <span className="font-semibold text-gray-900">
              {formatCurrency(result.grand_total)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Paid</span>
            <span className="font-medium text-gray-900">
              {formatCurrency(result.paid_amount)}
            </span>
          </div>
          {result.lead_text && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              CRM lead: {result.lead_text}
            </div>
          )}
          {result.lead_warning && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {result.lead_warning}
            </div>
          )}
          {result.change_due > 0 && (
            <div className="flex items-center justify-between rounded-md border border-[#17D65D]/30 bg-[#17D65D]/5 px-3 py-2">
              <span className="text-sm font-medium text-[#0fa846]">
                Change due
              </span>
              <span className="text-lg font-bold text-[#0fa846]">
                {formatCurrency(result.change_due)}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3.5">
          {result.id > 0 && (
            <a
              href={`/print/invoice/${result.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              🧾 Invoice / PDF / WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`${btnPrimary} flex-1`}
          >
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}

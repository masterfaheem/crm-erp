"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface SettingsRow {
  phone_number_id: string;
  business_account_id: string;
  display_phone_number: string;
  verified_name: string;
  access_token: string; // masked from server
  access_token_set: boolean;
  webhook_verify_token: string;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; data: Record<string, any> }
  | { status: "error"; message: string };

/* ============================================================
   CONSTANTS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const EMPTY: SettingsRow = {
  phone_number_id: "",
  business_account_id: "",
  display_phone_number: "",
  verified_name: "",
  access_token: "",
  access_token_set: false,
  webhook_verify_token: "",
  is_active: true,
  last_tested_at: null,
  last_test_ok: null,
};

/* ============================================================
   PAGE
============================================================ */
export default function WhatsAppSettingsPage() {
  return (
    <>
      <Navbar />
      <WhatsAppSettingsMain />
    </>
  );
}

function WhatsAppSettingsMain() {
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
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <WhatsAppSettingsContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function WhatsAppSettingsContent() {
  const [form, setForm] = useState<SettingsRow>(EMPTY);
  const [originalTokenSet, setOriginalTokenSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [showToken, setShowToken] = useState(false);

  // Debounced real-time test whenever credentials change
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  /* ---- Load existing settings ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/whatsapp/settings", {
          credentials: "include",
        });
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        if (!res.ok) throw new Error("Unable to load settings.");
        const json = await res.json();
        if (cancelled) return;
        if (json.data) {
          const d = json.data;
          setForm({
            phone_number_id: d.phone_number_id || "",
            business_account_id: d.business_account_id || "",
            display_phone_number: d.display_phone_number || "",
            verified_name: d.verified_name || "",
            access_token: "", // leave blank; token already set server-side
            access_token_set: !!d.access_token_set,
            webhook_verify_token: d.webhook_verify_token || "",
            is_active: !!d.is_active,
            last_tested_at: d.last_tested_at || null,
            last_test_ok:
              d.last_test_ok == null ? null : !!d.last_test_ok,
          });
          setOriginalTokenSet(!!d.access_token_set);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Real-time connection test (debounced) ---- */
  const runTest = useCallback(
    async (tokenOverride?: string) => {
      if (!form.phone_number_id) {
        setTest({ status: "idle" });
        return;
      }

      // If no token typed and no saved token → can't test
      const hasToken = !!tokenOverride || originalTokenSet;
      if (!hasToken) {
        setTest({ status: "idle" });
        return;
      }

      const myId = ++requestIdRef.current;
      setTest({ status: "testing" });

      try {
        const res = await fetch("/api/whatsapp/settings/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            phone_number_id: form.phone_number_id,
            access_token: tokenOverride || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (myId !== requestIdRef.current) return; // stale

        if (!res.ok || !json.ok) {
          setTest({
            status: "error",
            message:
              json?.error ||
              `Meta API returned HTTP ${res.status}`,
          });
        } else {
          setTest({ status: "ok", data: json.data || {} });
        }
      } catch (err) {
        if (myId !== requestIdRef.current) return;
        setTest({
          status: "error",
          message:
            err instanceof Error ? err.message : "Failed to reach server.",
        });
      }
    },
    [form.phone_number_id, originalTokenSet]
  );

  // Debounce on changes
  useEffect(() => {
    if (loading) return;
    if (!form.phone_number_id) {
      setTest({ status: "idle" });
      return;
    }
    if (!form.access_token && !originalTokenSet) {
      setTest({ status: "idle" });
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runTest(form.access_token || undefined);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    form.phone_number_id,
    form.access_token,
    loading,
    originalTokenSet,
    runTest,
  ]);

  const set = <K extends keyof SettingsRow>(k: K, v: SettingsRow[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!form.phone_number_id.trim()) {
      setError("Phone Number ID is required.");
      return;
    }
    if (!form.access_token.trim() && !originalTokenSet) {
      setError("Access Token is required on first setup.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        phone_number_id: form.phone_number_id.trim(),
        business_account_id: form.business_account_id.trim() || null,
        display_phone_number: form.display_phone_number.trim() || null,
        verified_name: form.verified_name.trim() || null,
        webhook_verify_token: form.webhook_verify_token.trim() || null,
        is_active: form.is_active,
      };
      // Only send token if user typed a new one
      if (form.access_token.trim()) {
        payload.access_token = form.access_token.trim();
      }

      const res = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error || "Failed to save settings."
        );
      }

      setSaved(true);
      if (form.access_token.trim()) {
        // Token now persisted server-side
        setOriginalTokenSet(true);
        set("access_token", "");
        set("access_token_set", true);
      }

      // Refresh test status (confirms saved creds work)
      runTest();

      setTimeout(() => setSaved(false), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  /* ---- Render ---- */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            WhatsApp API Settings
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Connect your Meta WhatsApp Cloud API to send and receive messages.
          </p>
        </div>
        <ConnectionBadge test={test} form={form} originalTokenSet={originalTokenSet} />
      </div>

      {/* STATUS / ERROR BANNERS */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-[#17D65D]/30 bg-[#17D65D]/10 px-4 py-3 text-sm text-[#0fa846]">
          Settings saved successfully.
        </div>
      )}

      {/* MAIN CARD */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Live test panel */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Real-time connection test
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Verified automatically when credentials change.
              </p>
            </div>
            <button
              type="button"
              onClick={() => runTest(form.access_token || undefined)}
              disabled={
                test.status === "testing" ||
                !form.phone_number_id ||
                (!form.access_token && !originalTokenSet)
              }
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {test.status === "testing" ? "Testing…" : "Test connection"}
            </button>
          </div>

          <div className="mt-4">
            <TestResultPanel test={test} />
          </div>
        </div>

        {/* Credentials */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-900">
            Meta App Credentials
          </h2>
          <p className="mt-0.5 mb-4 text-xs text-gray-500">
            Found in Meta for Developers → your app → WhatsApp → API Setup.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Phone Number ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.phone_number_id}
                onChange={(e) => set("phone_number_id", e.target.value)}
                required
                placeholder="e.g. 123456789012345"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Business Account ID
              </label>
              <input
                type="text"
                value={form.business_account_id}
                onChange={(e) => set("business_account_id", e.target.value)}
                placeholder="e.g. 098765432109876"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Display Phone Number
              </label>
              <input
                type="text"
                value={form.display_phone_number}
                onChange={(e) => set("display_phone_number", e.target.value)}
                placeholder="+92 300 1234567"
                className={inputCls}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Access Token <span className="text-red-500">*</span>
              </label>
              <div className="flex items-stretch gap-2">
                <div className="relative flex-1">
                  <input
                    type={showToken ? "text" : "password"}
                    value={form.access_token}
                    onChange={(e) => set("access_token", e.target.value)}
                    placeholder={
                      originalTokenSet
                        ? "•••••• (already saved — leave blank to keep)"
                        : "Paste the System User / Temporary access token"
                    }
                    className={`${inputCls} pr-20`}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                For production use a long-lived System User token. It is stored
                encrypted in the database and never sent back to the client.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Verified Name
              </label>
              <input
                type="text"
                value={form.verified_name}
                onChange={(e) => set("verified_name", e.target.value)}
                placeholder="Your business display name"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Webhook Verify Token
              </label>
              <input
                type="text"
                value={form.webhook_verify_token}
                onChange={(e) => set("webhook_verify_token", e.target.value)}
                placeholder="A secret string you choose"
                className={inputCls}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Used by Meta to verify your webhook URL. Keep it secret.
              </p>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]"
              />
              <span className="text-sm text-gray-800">
                Enable WhatsApp integration
              </span>
            </label>
          </div>
        </div>

        {/* Webhook hint */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-900">
            Webhook Configuration
          </h2>
          <p className="mt-0.5 mb-3 text-xs text-gray-500">
            Set this callback URL in Meta → WhatsApp → Configuration →
            Webhook.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Callback URL
              </label>
              <input
                type="text"
                readOnly
                value={
                  typeof window !== "undefined"
                    ? `${window.location.origin}/api/whatsapp/webhook`
                    : "/api/whatsapp/webhook"
                }
                className={`${inputCls} bg-gray-50 font-mono text-xs`}
              />
            </div>
            <div className="sm:w-64">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Verify Token
              </label>
              <input
                type="text"
                readOnly
                value={form.webhook_verify_token || "(not set)"}
                className={`${inputCls} bg-gray-50 font-mono text-xs`}
              />
            </div>
          </div>
        </div>

        {/* Save footer */}
        <div className="flex items-center justify-end gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>

      <p className="text-center text-[11px] text-gray-400">
        Credentials are stored securely in MySQL. Only a masked token is ever
        shown.
      </p>
    </div>
  );
}

/* ============================================================
   SUB-COMPONENTS
============================================================ */
function ConnectionBadge({
  test,
  form,
  originalTokenSet,
}: {
  test: TestState;
  form: SettingsRow;
  originalTokenSet: boolean;
}) {
  let cls =
    "border-gray-200 bg-gray-50 text-gray-600";
  let label = "Not configured";
  let dot = "bg-gray-400";

  if (!form.phone_number_id || (!form.access_token && !originalTokenSet)) {
    // stay default
  } else if (test.status === "testing") {
    cls = "border-amber-200 bg-amber-50 text-amber-700";
    label = "Testing…";
    dot = "bg-amber-500 animate-pulse";
  } else if (test.status === "ok") {
    cls = "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]";
    label = "Connected";
    dot = "bg-[#17D65D]";
  } else if (test.status === "error") {
    cls = "border-red-200 bg-red-50 text-red-700";
    label = "Connection failed";
    dot = "bg-red-500";
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium ${cls}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function TestResultPanel({ test }: { test: TestState }) {
  if (test.status === "idle") {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
        Enter Phone Number ID and Access Token to test the connection.
      </div>
    );
  }
  if (test.status === "testing") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        Contacting Meta Graph API…
      </div>
    );
  }
  if (test.status === "error") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
        <div className="font-medium">Connection failed</div>
        <div className="mt-0.5 break-words">{test.message}</div>
      </div>
    );
  }
  // ok
  const d = test.data || {};
  return (
    <div className="rounded-md border border-[#17D65D]/30 bg-[#17D65D]/5 px-3 py-2.5 text-xs text-[#0fa846]">
      <div className="font-medium">Connection successful</div>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
        <span className="text-gray-500">Verified name</span>
        <span className="font-medium">{d.verified_name || "—"}</span>
        <span className="text-gray-500">Display number</span>
        <span className="font-medium">{d.display_phone_number || "—"}</span>
        <span className="text-gray-500">Quality rating</span>
        <span className="font-medium">{d.quality_rating || "—"}</span>
        <span className="text-gray-500">Status</span>
        <span className="font-medium">{d.status || "—"}</span>
      </div>
    </div>
  );
}

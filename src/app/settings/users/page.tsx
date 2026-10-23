"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import PermissionMatrix from "@/app/settings/PermissionMatrix";

/* ============================================================
   TEAM & ACCESS — add people, choose what they can see / do
============================================================ */
interface UserRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  status: "active" | "inactive" | "suspended";
  last_login_at: string | null;
  created_at: string;
  branch_id: number | null;
  branch_name: string | null;
  roles: string | null;
  primary_role_id: number | null;
  is_super_admin: number;
  custom_access: number;
  custom_count: number;
}
interface RoleOption {
  id: number;
  name: string;
  description: string | null;
  is_system_role: number;
  permission_keys: string[];
  user_count: number;
}
interface BranchOption {
  id: number;
  name: string;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const STATUS_STYLE: Record<string, string> = {
  active: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  inactive: "border-gray-200 bg-gray-50 text-gray-600",
  suspended: "border-red-200 bg-red-50 text-red-600",
};

function initials(name: string) {
  const p = (name || "?").trim().split(/\s+/);
  return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")).toUpperCase();
}
function relativeTime(iso: string | null) {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Never";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  for (const n of arr) out += chars[n % chars.length];
  return out.slice(0, 6) + "@" + out.slice(6);
}

export default function UsersPage() {
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
          <UsersContent />
        </div>
      </main>
    </>
  );
}

function UsersContent() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState<{ user: UserRow | null } | null>(null);
  const [version, setVersion] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (status) p.set("status", status);
    const t = setTimeout(async () => {
      try {
        const [u, r, b] = await Promise.all([
          fetch(`/api/users?${p}`, { credentials: "include" }).then((x) => x.json().then((j) => ({ ok: x.ok, j }))),
          fetch("/api/roles", { credentials: "include" }).then((x) => (x.ok ? x.json() : { data: [] })),
          fetch("/api/branches", { credentials: "include" }).then((x) => (x.ok ? x.json() : { data: [] })),
        ]);
        if (!alive) return;
        if (!u.ok) throw new Error(u.j.error || "Unable to load team");
        setUsers(u.j.data || []);
        setMeId(u.j.me ?? null);
        setCanManage(!!u.j.can_manage);
        setRoles(r.data || []);
        setBranches(b.data || []);
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Unable to load team");
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, status, version]);

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.status === "active").length,
      admins: users.filter((u) => Number(u.is_super_admin) === 1).length,
      custom: users.filter((u) => Number(u.custom_access) === 1).length,
    }),
    [users]
  );

  const remove = async (u: UserRow) => {
    if (!window.confirm(`Delete ${u.name}? They won't be able to log in.\n\nTip: set status to Inactive instead to keep their history.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE", credentials: "include" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return window.alert(j.error || "Could not delete");
    setFlash(`${u.name} deleted`);
    setVersion((v) => v + 1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Team &amp; Access</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Add team members and choose exactly what each person can see and do. They log in with email, phone or username + password.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings/roles" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-[#17D65D]">
            Roles
          </Link>
          {canManage && (
            <button
              onClick={() => setModal({ user: null })}
              className="rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455]"
            >
              + Add team member
            </button>
          )}
        </div>
      </div>

      {flash && (
        <div className="flex items-center justify-between rounded-lg border border-[#17D65D]/30 bg-[#17D65D]/10 px-4 py-2 text-sm text-[#0a7a33]">
          {flash}
          <button onClick={() => setFlash(null)} className="text-xs">✕</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Team members", stats.total],
          ["Active", stats.active],
          ["Super Admins", stats.admins],
          ["Custom access", stats.custom],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{l}</div>
            <div className="mt-1 text-xl font-semibold text-gray-900">{v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, username…" className={`${inputCls} sm:max-w-sm`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} sm:w-44`}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">No team members found.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {users.map((u) => {
              const admin = Number(u.is_super_admin) === 1;
              const custom = Number(u.custom_access) === 1;
              return (
                <li key={u.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#17D65D]/15 text-sm font-bold text-[#0fa846]">
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-gray-900">{u.name}</span>
                        {u.id === meId && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">You</span>}
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[u.status] || STATUS_STYLE.inactive}`}>{u.status}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {u.email && <span>✉ {u.email}</span>}
                        {u.phone && <span>📞 {u.phone}</span>}
                        {u.username && <span>@{u.username}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:w-64">
                    {admin ? (
                      <span className="rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">👑 Super Admin</span>
                    ) : custom ? (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        ✎ Custom · {u.custom_count} permissions
                      </span>
                    ) : u.roles ? (
                      <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">{u.roles}</span>
                    ) : (
                      <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">No access</span>
                    )}
                    {u.branch_name && <span className="text-xs text-gray-400">{u.branch_name}</span>}
                  </div>
                  <div className="text-xs text-gray-400 sm:w-28">Last login: {relativeTime(u.last_login_at)}</div>
                  {canManage && (
                    <div className="flex gap-2 sm:w-36 sm:justify-end">
                      <button onClick={() => setModal({ user: u })} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-[#17D65D]">
                        Edit access
                      </button>
                      {u.id !== meId && (
                        <button onClick={() => remove(u)} className="rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {modal && (
        <UserModal
          user={modal.user}
          roles={roles}
          branches={branches}
          isSelf={!!modal.user && modal.user.id === meId}
          onClose={() => setModal(null)}
          onSaved={(msg) => {
            setModal(null);
            setFlash(msg);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   ADD / EDIT MODAL
============================================================ */
function UserModal({
  user,
  roles,
  branches,
  isSelf,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  roles: RoleOption[];
  branches: BranchOption[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isNew = !user;
  const defaultRole = roles.find((r) => !r.is_system_role) || roles[0];
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [username, setUsername] = useState(user?.username || "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(true);
  const [branchId, setBranchId] = useState(user?.branch_id ? String(user.branch_id) : "");
  const [status, setStatus] = useState<string>(user?.status || "active");
  const [roleId, setRoleId] = useState<string>(user?.primary_role_id ? String(user.primary_role_id) : defaultRole ? String(defaultRole.id) : "");
  const [custom, setCustom] = useState<boolean>(!!user && Number(user.custom_access) === 1);
  const [perms, setPerms] = useState<string[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"details" | "access">("details");

  const role = roles.find((r) => String(r.id) === roleId);
  const isAdminRole = !!role && Number(role.is_system_role) === 1;

  // load this user's own ticks (edit)
  useEffect(() => {
    if (isNew) return;
    let alive = true;
    fetch(`/api/users/${user!.id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (Array.isArray(j.permissions)) setPerms(j.permissions);
      })
      .finally(() => alive && setLoadingPerms(false));
    return () => {
      alive = false;
    };
  }, [isNew, user]);

  const switchToCustom = (on: boolean) => {
    setCustom(on);
    // start from what the role gives
    if (on && perms.length === 0 && role) setPerms(role.permission_keys || []);
  };

  const save = async () => {
    setError(null);
    const fail = (msg: string, t: "details" | "access") => {
      setError(msg);
      setTab(t);
    };
    if (!name.trim()) return fail("Name is required", "details");
    if (!email.trim() && !phone.trim() && !username.trim()) return fail("Add an email, phone or username for login", "details");
    if (isNew && password.length < 8) return fail("Password must be at least 8 characters", "details");
    if (!custom && !roleId) return fail("Choose a role or tick custom permissions", "access");
    setSaving(true);
    try {
      const res = await fetch(isNew ? "/api/users" : `/api/users/${user!.id}`, {
        method: isNew ? "POST" : "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          username,
          password: password || undefined,
          branch_id: branchId || null,
          status,
          role_id: roleId || null,
          custom: custom && !isAdminRole,
          permissions: custom && !isAdminRole ? perms : [],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not save");
      const how = [email && "email", phone && "phone", username && "username"].filter(Boolean).join(" / ");
      onSaved(
        isNew
          ? `${name} added. They can log in with ${how} + the password you set.`
          : `${name} updated${password ? " (new password set, old sessions signed out)" : ""}.`
      );
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
          <div>
            <h2 className="text-base font-semibold text-gray-900">{isNew ? "Add team member" : `Edit ${user!.name}`}</h2>
            <p className="text-xs text-gray-500">Login: email, phone or username + password</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">✕</button>
        </div>
        <div className="flex gap-1 border-b border-gray-100 px-5">
          {(["details", "access"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium ${tab === t ? "border-[#17D65D] text-gray-900" : "border-transparent text-gray-500"}`}
            >
              {t === "details" ? "1 · Details & login" : "2 · Access & permissions"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {tab === "details" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name *">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Ali Raza" />
              </Field>
              <Field label="Phone (WhatsApp)" hint="Can be used to log in">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="0300 1234567" inputMode="tel" />
              </Field>
              <Field label="Email" hint="Optional if phone or username is set">
                <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="ali@technox.pk" type="email" />
              </Field>
              <Field label="Username" hint="Optional · letters / numbers, no spaces">
                <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))} className={inputCls} placeholder="ali.sales" autoCapitalize="none" />
              </Field>
              <Field label={isNew ? "Password *" : "New password"} hint={isNew ? "At least 8 characters" : "Leave empty to keep the current password"}>
                <div className="flex gap-2">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={isNew ? "" : "••••••••"}
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="shrink-0 rounded-lg border border-gray-200 px-2 text-xs text-gray-600">
                    {showPw ? "Hide" : "Show"}
                  </button>
                  <button type="button" onClick={() => { setPassword(genPassword()); setShowPw(true); }} className="shrink-0 rounded-lg border border-gray-200 px-2 text-xs text-gray-600">
                    Generate
                  </button>
                </div>
              </Field>
              <Field label="Branch">
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status" hint="Inactive / suspended users can't log in">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls} disabled={isSelf}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </Field>
              <div className="flex items-end sm:col-span-2">
                <button onClick={() => setTab("access")} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-[#17D65D]">
                  Next: choose access →
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Role" hint="A role is a saved set of permissions you can give to many people">
                <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputCls} disabled={isSelf && isAdminRole}>
                  <option value="">— No role —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {Number(r.is_system_role) === 1 ? " (full access)" : ` (${r.permission_keys.length} permissions)`}
                    </option>
                  ))}
                </select>
              </Field>

              {isAdminRole ? (
                <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
                  👑 <b>Super Admin</b> can see and do everything, including reports, profit, khata and user management.
                  {isSelf && " You can't remove your own Super Admin access."}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => switchToCustom(false)}
                      className={`rounded-lg border px-4 py-3 text-left ${!custom ? "border-[#17D65D] bg-[#17D65D]/5" : "border-gray-200"}`}
                    >
                      <div className="text-sm font-semibold text-gray-900">Use the role&apos;s permissions</div>
                      <div className="text-xs text-gray-500">Changes to the role apply to this person too</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => switchToCustom(true)}
                      className={`rounded-lg border px-4 py-3 text-left ${custom ? "border-[#17D65D] bg-[#17D65D]/5" : "border-gray-200"}`}
                    >
                      <div className="text-sm font-semibold text-gray-900">Custom ticks for this person</div>
                      <div className="text-xs text-gray-500">Starts from the role — tick / untick anything</div>
                    </button>
                  </div>
                  {loadingPerms ? (
                    <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
                  ) : custom ? (
                    <PermissionMatrix value={perms} onChange={setPerms} />
                  ) : role ? (
                    <PermissionMatrix value={role.permission_keys || []} readOnly />
                  ) : (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      No role and no custom ticks = this person can only open the dashboard.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <span className="hidden text-xs text-gray-400 sm:block">
            {custom && !isAdminRole ? `${perms.length} permissions ticked` : role ? `Role: ${role.name}` : ""}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={saving} className="rounded-lg bg-[#17D65D] px-5 py-2 text-sm font-semibold text-black hover:bg-[#15c455] disabled:opacity-50">
              {saving ? "Saving…" : isNew ? "Add member" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

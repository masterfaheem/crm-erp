/* ============================================================
   PERMISSIONS CATALOG — single source of truth
   Used by: the Users / Roles screens (tick boxes), the proxy
   (blocks API calls + pages) and the menu (hides links).
   Safe to import on the client (no DB code here).
============================================================ */

export interface PermItem {
  key: string;
  label: string;
  hint?: string;
  /** confidential = money / cost / profit data — highlighted in the UI */
  confidential?: boolean;
}
export interface PermGroup {
  module: string;
  label: string;
  icon: string;
  items: PermItem[];
}

export const PERMISSION_GROUPS: PermGroup[] = [
  {
    module: "dashboard",
    label: "Dashboard",
    icon: "🏠",
    items: [
      { key: "dashboard.view", label: "Open dashboard" },
      { key: "dashboard.financials", label: "See sales & money figures on dashboard", confidential: true },
    ],
  },
  {
    module: "leads",
    label: "Leads (CRM)",
    icon: "🎯",
    items: [
      { key: "leads.view", label: "Open leads", hint: "Only leads assigned to or added by this user" },
      { key: "leads.view_all", label: "See everyone's leads", hint: "Without this, only their own leads are shown" },
      { key: "leads.create", label: "Add leads" },
      { key: "leads.edit", label: "Edit leads / follow-ups" },
      { key: "leads.delete", label: "Delete leads" },
      { key: "leads.assign", label: "Assign leads to other users" },
      { key: "leads.convert", label: "Convert won lead to order" },
      { key: "leads.import", label: "Import leads (CSV / Excel)" },
      { key: "leads.export", label: "Export / download leads", confidential: true },
    ],
  },
  {
    module: "customers",
    label: "Customers",
    icon: "👥",
    items: [
      { key: "customers.view", label: "View customers" },
      { key: "customers.create", label: "Add customers" },
      { key: "customers.edit", label: "Edit customers, contacts & groups" },
      { key: "customers.delete", label: "Delete customers" },
      { key: "customers.balance", label: "See khata / balance", confidential: true },
    ],
  },
  {
    module: "sales",
    label: "Sales & POS",
    icon: "🧾",
    items: [
      { key: "sales.view", label: "View quotations, sales orders & invoices" },
      { key: "sales.create", label: "Make bills in POS + create quotations / orders" },
      { key: "sales.edit", label: "Edit bills / orders" },
      { key: "sales.delete", label: "Cancel bills / delete orders", hint: "Bills are never deleted — they are cancelled with a reason" },
      { key: "sales.exchange", label: "Exchange laptops on old bills", hint: "Return a sold unit and give another; stock, khata and profit adjust" },
      { key: "sales.discount", label: "Give discount on bills" },
      { key: "sales.payments", label: "Receive & record customer payments" },
      { key: "sales.profit", label: "See profit / margin", confidential: true },
    ],
  },
  {
    module: "dispatch",
    label: "Online Orders / Dispatch",
    icon: "📦",
    items: [
      { key: "dispatch.view", label: "View online orders board" },
      { key: "dispatch.manage", label: "Dispatch, deliver, review & cancel orders" },
    ],
  },
  {
    module: "products",
    label: "Products",
    icon: "💻",
    items: [
      { key: "products.view", label: "View products" },
      { key: "products.create", label: "Add products" },
      { key: "products.edit", label: "Edit products, categories & units" },
      { key: "products.delete", label: "Delete products" },
      { key: "products.cost", label: "See purchase (cost) price & stock value", confidential: true },
    ],
  },
  {
    module: "inventory",
    label: "Inventory",
    icon: "🏬",
    items: [
      { key: "inventory.view", label: "View stock levels & history" },
      { key: "inventory.adjust", label: "Adjust stock (count / damaged)" },
      { key: "inventory.transfer", label: "Transfer stock between branches" },
    ],
  },
  {
    module: "purchases",
    label: "Purchases",
    icon: "🛒",
    items: [
      { key: "purchases.view", label: "View purchase orders & bills", confidential: true },
      { key: "purchases.create", label: "Create purchase orders & bills" },
      { key: "purchases.edit", label: "Edit purchases" },
      { key: "purchases.delete", label: "Delete purchases" },
      { key: "purchases.payments", label: "Supplier payments", confidential: true },
    ],
  },
  {
    module: "suppliers",
    label: "Suppliers",
    icon: "🚚",
    items: [
      { key: "suppliers.view", label: "View suppliers" },
      { key: "suppliers.create", label: "Add suppliers" },
      { key: "suppliers.edit", label: "Edit suppliers" },
      { key: "suppliers.delete", label: "Delete suppliers" },
    ],
  },
  {
    module: "tickets",
    label: "Tickets / Support",
    icon: "🎫",
    items: [
      { key: "tickets.view", label: "View tickets" },
      { key: "tickets.manage", label: "Create, update & close tickets" },
    ],
  },
  {
    module: "whatsapp",
    label: "WhatsApp",
    icon: "💬",
    items: [
      { key: "whatsapp.view", label: "Open WhatsApp inbox" },
      { key: "whatsapp.send", label: "Send WhatsApp messages" },
      { key: "whatsapp.settings", label: "WhatsApp settings / connection", confidential: true },
    ],
  },
  {
    module: "expenses",
    label: "Expenses",
    icon: "💸",
    items: [
      { key: "expenses.view", label: "View expenses", confidential: true },
      { key: "expenses.create", label: "Add expenses" },
      { key: "expenses.edit", label: "Edit expenses" },
      { key: "expenses.delete", label: "Delete expenses" },
      { key: "expenses.approve", label: "Approve expenses" },
    ],
  },
  {
    module: "hr",
    label: "Employees / HR",
    icon: "🧑‍💼",
    items: [
      { key: "hr.view", label: "View employees", confidential: true },
      { key: "hr.manage", label: "Manage employees, attendance & payroll", confidential: true },
    ],
  },
  {
    module: "accounting",
    label: "Accounts",
    icon: "📒",
    items: [
      { key: "accounting.view", label: "View accounts, P&L, balance sheet", confidential: true },
      { key: "accounting.manage", label: "Post journal entries / manage accounts", confidential: true },
    ],
  },
  {
    module: "reports",
    label: "Reports",
    icon: "📊",
    items: [
      { key: "reports.leads", label: "Lead reports" },
      { key: "reports.sales", label: "Sales, purchase & inventory reports", confidential: true },
      { key: "reports.export", label: "Download / export reports", confidential: true },
    ],
  },
  {
    module: "admin",
    label: "Users & Settings",
    icon: "🔐",
    items: [
      { key: "users.view", label: "View team members" },
      { key: "users.manage", label: "Add / edit users and their access", confidential: true },
      { key: "roles.manage", label: "Create / edit roles", confidential: true },
      { key: "settings.manage", label: "Branches & company settings", confidential: true },
      { key: "audit.view", label: "View audit logs", confidential: true },
    ],
  },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
export const PERMISSION_LABEL: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, `${g.label}: ${i.label}`]))
);

/* Ready-made starting points for a new role / user */
export const ROLE_TEMPLATES: { name: string; description: string; keys: string[] }[] = [
  {
    name: "Sales Team",
    description: "Leads to bill: leads, customers, POS, online orders",
    keys: [
      "dashboard.view",
      "leads.view", "leads.create", "leads.edit", "leads.convert",
      "customers.view", "customers.create", "customers.edit", "customers.balance",
      "sales.view", "sales.create", "sales.payments",
      "dispatch.view",
      "products.view", "inventory.view",
      "tickets.view", "tickets.manage",
      "whatsapp.view", "whatsapp.send",
    ],
  },
  {
    name: "Sales Manager",
    description: "Everything sales + all leads, assigning, lead reports",
    keys: [
      "dashboard.view",
      "leads.view", "leads.view_all", "leads.create", "leads.edit", "leads.assign", "leads.convert", "leads.import",
      "customers.view", "customers.create", "customers.edit", "customers.balance",
      "sales.view", "sales.create", "sales.edit", "sales.discount", "sales.payments", "sales.exchange",
      "dispatch.view", "dispatch.manage",
      "products.view", "inventory.view",
      "tickets.view", "tickets.manage",
      "whatsapp.view", "whatsapp.send",
      "reports.leads", "users.view",
    ],
  },
  {
    name: "Inventory / Store",
    description: "Products, stock, purchases and dispatch",
    keys: [
      "dashboard.view",
      "products.view", "products.create", "products.edit", "products.cost",
      "inventory.view", "inventory.adjust", "inventory.transfer",
      "purchases.view", "purchases.create", "purchases.edit",
      "suppliers.view", "suppliers.create", "suppliers.edit",
      "dispatch.view", "dispatch.manage",
    ],
  },
  {
    name: "Dispatch",
    description: "Online orders: dispatch, delivery and reviews",
    keys: ["dashboard.view", "dispatch.view", "dispatch.manage", "customers.view", "products.view", "inventory.view"],
  },
  {
    name: "Accounts",
    description: "Payments, khata, purchases, expenses and accounts",
    keys: [
      "dashboard.view", "dashboard.financials",
      "customers.view", "customers.balance",
      "sales.view", "sales.payments", "sales.profit",
      "purchases.view", "purchases.payments", "suppliers.view",
      "products.view", "products.cost", "inventory.view",
      "expenses.view", "expenses.create", "expenses.edit", "expenses.approve",
      "accounting.view", "accounting.manage",
      "reports.sales", "reports.export",
    ],
  },
];

/* ============================================================
   ACCESS RULES — what each API call / page needs.
   A rule passes when the user has ANY of the listed keys.
   "*" = any signed-in user.  Not listed = Super Admin only.
============================================================ */
type Need = string[];
type ApiRule = { re: RegExp; GET?: Need; POST?: Need; PUT?: Need; DELETE?: Need; ALL?: Need };

const ANY = ["*"];
const crud = (view: Need, create: Need, edit: Need, del: Need) => ({ GET: view, POST: create, PUT: edit, DELETE: del });

/* order matters: first match wins */
export const API_RULES: ApiRule[] = [
  { re: /^\/api\/permissions/, GET: ["users.manage", "roles.manage"] },
  { re: /^\/api\/roles/, GET: ["users.view", "users.manage", "roles.manage"], ALL: ["roles.manage"] },
  { re: /^\/api\/users/, GET: ["users.view", "users.manage", "leads.view", "customers.view"], ALL: ["users.manage"] },
  { re: /^\/api\/branches/, GET: ANY, ALL: ["settings.manage"] },
  { re: /^\/api\/audit-logs/, GET: ["audit.view"] },

  { re: /^\/api\/leads\/export/, GET: ["leads.export"] },
  { re: /^\/api\/leads\/import/, POST: ["leads.import"] },
  { re: /^\/api\/leads\/[^/]+\/convert/, GET: ["leads.convert"], POST: ["leads.convert"] },
  { re: /^\/api\/leads\/check-phone/, GET: ["leads.view", "leads.create"] },
  { re: /^\/api\/leads\/follow-ups/, GET: ["leads.view"] },
  { re: /^\/api\/leads/, ...crud(["leads.view"], ["leads.create"], ["leads.edit"], ["leads.delete"]) },

  { re: /^\/api\/customers\/quick/, POST: ["customers.create", "sales.create"] },
  { re: /^\/api\/customers\/[^/]+\/ledger/, GET: ["customers.balance"] },
  {
    re: /^\/api\/customers/,
    ...crud(["customers.view", "sales.view", "sales.create", "sales.payments", "tickets.view", "dispatch.view"], ["customers.create"], ["customers.edit"], ["customers.delete"]),
  },
  { re: /^\/api\/contacts/, GET: ["customers.view"], ALL: ["customers.edit"] },
  { re: /^\/api\/customer-groups/, GET: ["customers.view"], ALL: ["customers.edit"] },
  { re: /^\/api\/customer-payments/, GET: ["sales.payments", "customers.balance"], ALL: ["sales.payments"] },

  { re: /^\/api\/invoices\/[^/]+\/print/, GET: ["sales.view", "sales.create"] },
  { re: /^\/api\/pos\//, GET: ["sales.create"] },
  { re: /^\/api\/invoices\/[^/]+\/cancel/, POST: ["sales.delete"] },
  { re: /^\/api\/exchanges/, GET: ["sales.view", "sales.create", "sales.exchange"], POST: ["sales.exchange"] },
  { re: /^\/api\/(invoices|quotations|sales-orders)/, ...crud(["sales.view"], ["sales.create"], ["sales.edit"], ["sales.delete"]) },
  { re: /^\/api\/dispatch/, GET: ["dispatch.view", "sales.create"], ALL: ["dispatch.manage"] },

  { re: /^\/api\/(product-categories|units)/, GET: ANY, ALL: ["products.create", "products.edit"] },
  {
    re: /^\/api\/products/,
    ...crud(
      ["products.view", "sales.create", "sales.view", "purchases.view", "purchases.create", "inventory.view", "leads.convert"],
      ["products.create"],
      ["products.edit"],
      ["products.delete"]
    ),
  },
  { re: /^\/api\/inventory\/moves/, GET: ["inventory.view"], POST: ["inventory.adjust"] },
  { re: /^\/api\/inventory/, GET: ["inventory.view"], ALL: ["inventory.adjust", "inventory.transfer"] },

  { re: /^\/api\/supplier-payments/, GET: ["purchases.payments"], ALL: ["purchases.payments"] },
  { re: /^\/api\/(purchase-orders|purchase-bills)/, ...crud(["purchases.view"], ["purchases.create"], ["purchases.edit"], ["purchases.delete"]) },
  {
    re: /^\/api\/suppliers/,
    ...crud(["suppliers.view", "purchases.view", "purchases.create", "purchases.payments"], ["suppliers.create"], ["suppliers.edit"], ["suppliers.delete"]),
  },

  { re: /^\/api\/reports\/leads/, GET: ["reports.leads"] },
  { re: /^\/api\/reports/, GET: ["reports.sales"] },

  { re: /^\/api\/tickets/, GET: ["tickets.view"], ALL: ["tickets.manage"] },
  { re: /^\/api\/team/, GET: ["hr.view"], ALL: ["hr.manage"] },
  { re: /^\/api\/expenses/, GET: ["expenses.view"], POST: ["expenses.create"], PUT: ["expenses.edit", "expenses.approve"], DELETE: ["expenses.delete"] },
  { re: /^\/api\/(accounting|accounts|journal)/, GET: ["accounting.view"], ALL: ["accounting.manage"] },
  { re: /^\/api\/whatsapp-settings/, ALL: ["whatsapp.settings"] },
  { re: /^\/api\/whatsapp/, GET: ["whatsapp.view"], ALL: ["whatsapp.send"] },
];

export function apiNeed(pathname: string, method: string): Need | null {
  const m = method.toUpperCase() === "PATCH" ? "PUT" : method.toUpperCase();
  for (const r of API_RULES) {
    if (!r.re.test(pathname)) continue;
    const need = (r as Record<string, unknown>)[m] as Need | undefined;
    if (need) return need;
    if (m === "GET" || m === "HEAD") return r.GET || null;
    return r.ALL || null;
  }
  return null; // not listed -> Super Admin only
}

/* Pages: first matching prefix wins */
export const PAGE_RULES: [string, Need][] = [
  ["/dashboard", ANY],
  ["/leads", ["leads.view"]],
  ["/customers", ["customers.view"]],
  ["/contacts", ["customers.view"]],
  ["/sales/customer-payments", ["sales.payments"]],
  ["/sales", ["sales.view"]],
  ["/print/invoice", ["sales.view", "sales.create"]],
  ["/exchange", ["sales.exchange"]],
  ["/pos", ["sales.create"]],
  ["/dispatch", ["dispatch.view"]],
  ["/products", ["products.view"]],
  ["/product-categories", ["products.view"]],
  ["/units", ["products.view"]],
  ["/inventory", ["inventory.view"]],
  ["/warehouses", ["inventory.view"]],
  ["/purchase", ["purchases.view"]],
  ["/supplier-payments", ["purchases.payments"]],
  ["/suppliers", ["suppliers.view"]],
  ["/reports/leads", ["reports.leads"]],
  ["/reports", ["reports.sales"]],
  ["/settings/users", ["users.view", "users.manage"]],
  ["/settings/roles", ["roles.manage"]],
  ["/settings/audit-logs", ["audit.view"]],
  ["/settings", ["settings.manage"]],
  ["/tickets", ["tickets.view"]],
  ["/team", ["hr.view"]],
  ["/employees", ["hr.view"]],
  ["/departments", ["hr.view"]],
  ["/attendance", ["hr.view"]],
  ["/leaves", ["hr.view"]],
  ["/payroll", ["hr.view"]],
  ["/expenses", ["expenses.view"]],
  ["/accounting", ["accounting.view"]],
  ["/whatsapp/settings", ["whatsapp.settings"]],
  ["/whatsapp", ["whatsapp.view"]],
];

export function pageNeed(pathname: string): Need | null {
  for (const [prefix, need] of PAGE_RULES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return need;
  }
  return null; // public / not protected (login, register, home)
}

export function allowed(need: Need | null, perms: Iterable<string>, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  if (!need) return false;
  if (need.includes("*")) return true;
  const set = perms instanceof Set ? (perms as Set<string>) : new Set(perms);
  return need.some((k) => set.has(k));
}

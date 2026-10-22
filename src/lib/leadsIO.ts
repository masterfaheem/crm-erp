/* ============================================================
   LEADS IMPORT / EXPORT HELPERS (server side)
============================================================ */
import {
  BUDGET_RANGES,
  LEAD_PRIORITY_LABELS,
  LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  LOST_REASONS,
  PAKISTAN_CITIES,
  PROFESSIONS,
  USE_CASES,
  BUDGET_LABELS,
  formatUseCases,
  leadSourceLabel,
  lostReasonText,
  professionText,
} from "@/lib/leadOptions";

/* Columns used for export AND as the import template (same order) */
export const LEAD_COLUMNS: { key: string; header: string; width: number }[] = [
  { key: "lead_number", header: "Lead #", width: 12 },
  { key: "name", header: "Name", width: 22 },
  { key: "whatsapp", header: "WhatsApp", width: 16 },
  { key: "phone", header: "Phone", width: 16 },
  { key: "city", header: "City", width: 16 },
  { key: "source", header: "Source", width: 16 },
  { key: "profession", header: "Profession", width: 14 },
  { key: "budget_range", header: "Budget Range", width: 14 },
  { key: "use_cases", header: "Use Case", width: 26 },
  { key: "requirement_note", header: "Requirement Note", width: 30 },
  { key: "status", header: "Status", width: 12 },
  { key: "priority", header: "Priority", width: 10 },
  { key: "follow_up_at", header: "Follow Up Date", width: 18 },
  { key: "follow_up_note", header: "Follow Up Note", width: 24 },
  { key: "lost_reason", header: "Lost Reason", width: 18 },
  { key: "description", header: "Description Note", width: 32 },
  { key: "delivery_name", header: "Delivery Name", width: 18 },
  { key: "delivery_phone", header: "Delivery Phone", width: 16 },
  { key: "delivery_phone2", header: "Delivery 2nd Phone", width: 16 },
  { key: "delivery_house", header: "House No", width: 12 },
  { key: "delivery_street", header: "Street / Road", width: 18 },
  { key: "delivery_area", header: "Sector / Block / Area", width: 20 },
  { key: "delivery_landmark", header: "Nearest Landmark", width: 20 },
  { key: "delivery_city", header: "Delivery City", width: 16 },
  { key: "assigned_name", header: "Assigned To", width: 16 },
  { key: "created_at", header: "Created At", width: 18 },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function fmtDate(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDateTime(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* DB row -> export row with human labels */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toExportRow(r: any): Record<string, string | number> {
  return {
    lead_number: r.lead_number || "",
    name: [r.first_name, r.last_name].filter(Boolean).join(" "),
    whatsapp: r.whatsapp || "",
    phone: r.phone || "",
    city: r.city || "",
    source: leadSourceLabel(r.source),
    profession: professionText(r.profession, r.profession_other),
    budget_range: r.budget_range ? BUDGET_LABELS[r.budget_range] || r.budget_range : "",
    use_cases: formatUseCases(r.use_cases, r.use_case_custom),
    requirement_note: r.requirement_note || "",
    status: LEAD_STATUS_LABELS[r.status] || r.status || "",
    priority: LEAD_PRIORITY_LABELS[r.priority] || r.priority || "",
    follow_up_at: r.follow_up_local ? String(r.follow_up_local).replace("T", " ") : "",
    follow_up_note: r.follow_up_note || "",
    lost_reason: lostReasonText(r.lost_reason, r.lost_reason_other),
    description: r.description || "",
    delivery_name: r.delivery_name || "",
    delivery_phone: r.delivery_phone || "",
    delivery_phone2: r.delivery_phone2 || "",
    delivery_house: r.delivery_house || "",
    delivery_street: r.delivery_street || "",
    delivery_area: r.delivery_area || "",
    delivery_landmark: r.delivery_landmark || "",
    delivery_city: r.delivery_city || "",
    assigned_name: r.assigned_name || "",
    created_at: fmtDateTime(r.created_at),
  };
}

/* ---------------- CSV ---------------- */
function csvCell(v: unknown, sep: string): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (sep === "\t") return s.replace(/[\t\r\n]+/g, " ");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toDelimited(
  rows: Record<string, unknown>[],
  sep: "," | "\t",
  columns = LEAD_COLUMNS
): string {
  const lines = [columns.map((c) => csvCell(c.header, sep)).join(sep)];
  for (const r of rows) {
    lines.push(columns.map((c) => csvCell(r[c.key], sep)).join(sep));
  }
  return lines.join("\r\n");
}

/* RFC-4180 CSV parser (handles quotes, commas & new lines in cells, BOM) */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  // auto-detect delimiter from first line
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const counts = {
    ",": (firstLine.match(/,/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
  };
  const sep = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] ||
    ",") as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/* ---------------- Import header mapping ---------------- */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<string, string[]> = {
  first_name: ["firstname", "first", "fname", "givenname"],
  full_name: ["name", "fullname", "customername", "leadname", "clientname", "contactname"],
  last_name: ["lastname", "last", "lname", "surname", "familyname"],
  company_name: ["company", "companyname", "business", "organization", "organisation", "shop"],
  designation: ["designation", "title", "jobtitle", "position"],
  phone: ["phone", "phonenumber", "phoneno", "mobile", "mobileno", "mobilenumber", "contact", "contactno", "contactnumber", "cell", "cellno", "number", "no"],
  alternate_phone: ["alternatephone", "altphone", "phone2", "secondaryphone", "otherphone", "alternatenumber"],
  whatsapp: ["whatsapp", "whatsappnumber", "whatsappno", "wa", "whatsappphone"],
  email: ["email", "emailaddress", "mail", "emailid"],
  source: ["source", "leadsource", "channel", "from"],
  city: ["city", "town", "location", "shehar"],
  profession: ["profession", "occupation", "job", "work"],
  budget_range: ["budgetrange", "budget", "budgetrs", "range", "pricerange"],
  use_cases: ["usecase", "usecases", "workload", "workloadusecase", "use", "purpose"],
  requirement_note: ["requirementnote", "requirement", "requirements", "specs", "specification"],
  status: ["status", "leadstatus", "stage"],
  priority: ["priority"],
  follow_up_at: ["followupdate", "followup", "followupat", "followupdatetime", "followuptime", "nextfollowup"],
  follow_up_note: ["followupnote"],
  lost_reason: ["lostreason", "reason", "lossreason"],
  assigned: ["assignedto", "assigned", "owner", "agent", "salesperson", "assignee"],
  estimated_value: ["estimatedvalue", "estimatedvaluers", "value", "amount", "dealvalue", "price"],
  address: ["address", "fulladdress"],
  description: ["descriptionnote", "notes", "note", "description", "remarks", "comments", "comment", "details"],
  delivery_name: ["deliveryname"],
  delivery_phone: ["deliveryphone", "deliveryphoneno"],
  delivery_phone2: ["delivery2ndphone", "deliveryphone2", "2ndphoneno", "2ndphone", "secondphone"],
  delivery_house: ["houseno", "house", "housenumber"],
  delivery_street: ["streetroad", "street", "streetno", "road", "roadname", "streetnoroadname"],
  delivery_area: ["sectorblockarea", "sector", "block", "area"],
  delivery_landmark: ["nearestlandmark", "landmark"],
  delivery_city: ["deliverycity"],
};

export function mapHeaders(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  const used = new Set<string>();
  headers.forEach((h, idx) => {
    const n = norm(h || "");
    if (!n) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (!used.has(field) && aliases.includes(n)) {
        map[idx] = field;
        used.add(field);
        return;
      }
    }
  });
  return map;
}

export function matchSource(v: string): string | null {
  const n = norm(v);
  if (!n) return null;
  const hit = LEAD_SOURCES.find((s) => norm(s.value) === n || norm(s.label) === n);
  if (hit) return hit.value;
  // common variations
  const extra: Record<string, string> = {
    fb: "facebook", facebookpage: "facebook", fbpage: "facebook",
    fbad: "facebook_ad", fbads: "facebook_ad", facebookads: "facebook_ad",
    insta: "instagram", ig: "instagram",
    ref: "reference", referral: "reference",
    wom: "word_of_mouth", wordofmouth: "word_of_mouth",
    repeatcustomer: "repeat",
    mf: "mf_follower", mffollowers: "mf_follower", follower: "mf_follower", sirfaheemfollower: "mf_follower",
    ad1: "ads_1", ad2: "ads_2", ad3: "ads_3",
  };
  return extra[n] || null;
}

export function matchStatus(v: string): string | null {
  const n = norm(v);
  if (!n) return null;
  for (const [k, label] of Object.entries(LEAD_STATUS_LABELS)) {
    if (norm(k) === n || norm(label) === n) return k;
  }
  return null;
}

export function matchPriority(v: string): string | null {
  const n = norm(v);
  if (!n) return null;
  for (const [k, label] of Object.entries(LEAD_PRIORITY_LABELS)) {
    if (norm(k) === n || norm(label) === n) return k;
  }
  return null;
}

export function matchCity(v: string): string {
  const t = v.trim();
  const n = norm(t);
  return PAKISTAN_CITIES.find((c) => norm(c) === n) || t;
}

/* Profession: label/value, anything else -> other + text */
export function matchProfession(v: string): { profession: string; other: string | null } {
  const n = norm(v);
  const extra: Record<string, string> = {
    business: "businessman", businessmen: "businessman", jobholder: "job_holder",
    job: "job_holder", employee: "job_holder", employed: "job_holder", students: "student",
  };
  const hit = PROFESSIONS.find((o) => norm(o.value) === n || norm(o.label) === n);
  if (hit) return { profession: hit.value, other: null };
  if (extra[n]) return { profession: extra[n], other: null };
  return { profession: "other", other: v.trim().slice(0, 100) };
}

/* Budget: "50-60", "50k-60k", "50,000 - 60,000" -> "50-60" */
export function matchBudget(v: unknown): string | null {
  const s = String(v ?? "").toLowerCase();
  if (!s.trim()) return null;
  const lakh = /lakh|lac/.test(s);
  const nums = (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((x) => Number(x.replace(/,/g, "")));
  if (!nums.length) return null;
  // value in thousands: 55000 -> 55, "55k" -> 55, "2.5 lakh" -> 250
  const k = (x: number) => (lakh ? Math.round(x * 100) : x >= 1000 ? Math.round(x / 1000) : x);
  if (nums.length >= 2) {
    const key = `${k(nums[0])}-${k(nums[1])}`;
    if (BUDGET_RANGES.some((b) => b.value === key)) return key;
  }
  // single number (or unknown range): pick the range that contains it
  const x = k(nums[0]);
  const hit = BUDGET_RANGES.find((b) => {
    const [lo, hi] = b.value.split("-").map(Number);
    return x >= lo && x < hi;
  });
  return hit ? hit.value : x >= 500 ? "300-500" : null;
}

/* Use cases: "Study, Graphic Design / Gaming" -> keys; unknown -> custom text */
export function matchUseCases(v: string): { use_cases: string[]; custom: string | null } {
  const parts = v.split(/[,;|/+&]+/).map((x) => x.trim()).filter(Boolean);
  const extra: Record<string, string> = {
    graphics: "graphic_design", graphicsdesign: "graphic_design", designing: "graphic_design",
    editing: "video_editing", videoedit: "video_editing", ecom: "ecommerce", ecomm: "ecommerce",
    webdevelopment: "web_dev", webdeveloper: "web_dev", development: "web_dev", coding: "programming",
    office: "office_use", autocad: "autocad_3d", "3d": "autocad_3d", studies: "study",
  };
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const p of parts) {
    const n = norm(p);
    const hit = USE_CASES.find((o) => norm(o.value) === n || norm(o.label) === n);
    const k = hit?.value || extra[n];
    if (k && k !== "custom") keys.push(k);
    else unknown.push(p);
  }
  if (unknown.length) keys.push("custom");
  return {
    use_cases: Array.from(new Set(keys)),
    custom: unknown.length ? unknown.join(", ").slice(0, 200) : null,
  };
}

export function matchLostReason(v: string): { lost_reason: string; other: string | null } {
  const n = norm(v);
  const hit = LOST_REASONS.find((o) => norm(o.value) === n || norm(o.label) === n);
  if (hit) return { lost_reason: hit.value, other: null };
  const extra: Record<string, string> = {
    budget: "budget_issue", lowbudget: "budget_issue", modelnotavailable: "model_not_available",
    notavailable: "model_not_available", expensive: "price_high", highprice: "price_high",
    condition: "condition_issue", notresponding: "not_responding", noresponse: "not_responding",
  };
  if (extra[n]) return { lost_reason: extra[n], other: null };
  return { lost_reason: "other", other: v.trim().slice(0, 200) };
}

/* "2026-10-25 14:30", "25/10/2026 2:30 pm", Excel date -> "YYYY-MM-DDTHH:MM" */
export function parseAnyDateTime(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Excel dates come in as UTC wall-clock
    return v.toISOString().slice(0, 16);
  }
  const s = String(v).trim();
  const date = parseAnyDate(s);
  if (!date) return null;
  const t = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  let h = t ? Number(t[1]) : 11;
  const m = t ? t[2] : "00";
  if (t?.[3]) {
    const pm = t[3].toLowerCase() === "pm";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return `${date}T${pad(h)}:${m}`;
}

/* Accepts Date, Excel serial, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY */
export function parseAnyDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return parseAnyDate(d);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}

export function parseMoney(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

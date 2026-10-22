/* ============================================================
   LEADS IMPORT / EXPORT HELPERS (server side)
============================================================ */
import {
  LEAD_PRIORITY_LABELS,
  LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  PAKISTAN_CITIES,
  leadSourceLabel,
} from "@/lib/leadOptions";

/* Columns used for export AND as the import template (same order) */
export const LEAD_COLUMNS: { key: string; header: string; width: number }[] = [
  { key: "lead_number", header: "Lead #", width: 12 },
  { key: "first_name", header: "First Name", width: 16 },
  { key: "last_name", header: "Last Name", width: 16 },
  { key: "company_name", header: "Company", width: 20 },
  { key: "designation", header: "Designation", width: 16 },
  { key: "phone", header: "Phone", width: 16 },
  { key: "alternate_phone", header: "Alternate Phone", width: 16 },
  { key: "whatsapp", header: "WhatsApp", width: 16 },
  { key: "email", header: "Email", width: 24 },
  { key: "source", header: "Source", width: 16 },
  { key: "city", header: "City", width: 16 },
  { key: "status", header: "Status", width: 12 },
  { key: "priority", header: "Priority", width: 10 },
  { key: "assigned_name", header: "Assigned To", width: 16 },
  { key: "estimated_value", header: "Estimated Value (Rs)", width: 16 },
  { key: "expected_close_date", header: "Expected Close Date", width: 16 },
  { key: "address", header: "Address", width: 28 },
  { key: "description", header: "Notes", width: 32 },
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
    first_name: r.first_name || "",
    last_name: r.last_name || "",
    company_name: r.company_name || "",
    designation: r.designation || "",
    phone: r.phone || "",
    alternate_phone: r.alternate_phone || "",
    whatsapp: r.whatsapp || "",
    email: r.email || "",
    source: leadSourceLabel(r.source),
    city: r.city || "",
    status: LEAD_STATUS_LABELS[r.status] || r.status || "",
    priority: LEAD_PRIORITY_LABELS[r.priority] || r.priority || "",
    assigned_name: r.assigned_name || "",
    estimated_value: Number(r.estimated_value || 0),
    expected_close_date: fmtDate(r.expected_close_date),
    address: r.address || "",
    description: r.description || "",
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
  designation: ["designation", "title", "jobtitle", "position", "profession", "role"],
  phone: ["phone", "phonenumber", "phoneno", "mobile", "mobileno", "mobilenumber", "contact", "contactno", "contactnumber", "cell", "cellno", "number", "no"],
  alternate_phone: ["alternatephone", "altphone", "phone2", "secondaryphone", "otherphone", "alternatenumber"],
  whatsapp: ["whatsapp", "whatsappnumber", "whatsappno", "wa", "whatsappphone"],
  email: ["email", "emailaddress", "mail", "emailid"],
  source: ["source", "leadsource", "channel", "from"],
  city: ["city", "town", "location", "shehar"],
  status: ["status", "leadstatus", "stage"],
  priority: ["priority"],
  assigned: ["assignedto", "assigned", "owner", "agent", "salesperson", "assignee"],
  estimated_value: ["estimatedvalue", "estimatedvaluers", "value", "amount", "budget", "dealvalue", "price"],
  expected_close_date: ["expectedclosedate", "closedate", "expectedclose", "followupdate"],
  address: ["address", "fulladdress"],
  description: ["notes", "note", "description", "remarks", "comments", "comment", "details", "requirement"],
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

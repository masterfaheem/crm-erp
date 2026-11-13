/* ============================================================
   QC / TESTING CHECKLIST — Operations confirms every point before
   an order is marked Ready, and picks who tested it.
   Safe on the client. Edit the list here only.
============================================================ */
export type QcResult = "pass" | "fail" | "na";

export const QC_ITEMS: { key: string; label: string }[] = [
  { key: "body", label: "Body / physical condition" },
  { key: "screen", label: "Screen (dead pixels, brightness)" },
  { key: "keyboard", label: "Keyboard — all keys" },
  { key: "touchpad", label: "Touchpad" },
  { key: "battery", label: "Battery health & backup" },
  { key: "charger", label: "Charger" },
  { key: "audio", label: "Speakers & mic" },
  { key: "webcam", label: "Webcam" },
  { key: "wireless", label: "WiFi & Bluetooth" },
  { key: "ports", label: "USB / HDMI / other ports" },
  { key: "specs", label: "RAM & SSD as per bill" },
  { key: "software", label: "Windows & drivers" },
  { key: "temperature", label: "Temperature / heating test" },
  { key: "serial", label: "Serial number matches bill" },
  { key: "sticker", label: "Warranty sticker applied" },
];

export type QcChecklist = Record<string, QcResult>;

/* keep only known keys / values */
export function cleanChecklist(v: unknown): QcChecklist {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: QcChecklist = {};
  for (const it of QC_ITEMS) {
    const r = String(o[it.key] ?? "");
    if (r === "pass" || r === "fail" || r === "na") out[it.key] = r;
  }
  return out;
}

/* null = complete and passed; otherwise the reason it can't be marked Ready */
export function checklistProblem(c: QcChecklist): string | null {
  const missing = QC_ITEMS.filter((it) => !c[it.key]);
  if (missing.length) return `Check every point first (${missing.length} left)`;
  const failed = QC_ITEMS.filter((it) => c[it.key] === "fail");
  if (failed.length) return `Failed: ${failed.map((f) => f.label).join(", ")} — fix it before marking Ready`;
  return null;
}

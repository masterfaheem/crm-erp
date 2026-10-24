/* ============================================================
   INVOICE BRANDING & TERMS — edit here only.
   Only confirmed details are listed; add the rest when confirmed.
============================================================ */
export const BRAND = {
  name: "TECHNO X LAPTOPS",
  tagline: "Laptop & Smart Devices",
  logo: "/technox-logo-invoice.png",
  phones: ["0322-4350505", "0328-4350505"], // 3rd number: add when confirmed
  website: "https://technox.pk",
  websiteLabel: "technox.pk",
  address: "Siddique Trade Center, Lahore",
  /* official social links — add when confirmed, e.g. { label: "Facebook", url: "https://..." } */
  social: [] as { label: string; url: string }[],
  thankYou: "Thank you for choosing Techno X Laptops. We appreciate your trust.",
};

/* Laptop warranty shown on every product line */
export const DEFAULT_ITEM_WARRANTY = "100 Days";

export const WARRANTY_TERMS: { title: string; text: string }[] = [
  { title: "Laptop Warranty", text: "100 days warranty, subject to applicable terms and conditions." },
  { title: "Battery Warranty", text: "1 hour battery time warranty, subject to the approved battery warranty policy." },
  { title: "Physical Damage", text: "Physical damage, broken screens, cracked bodies and damage caused by accidents or misuse are not covered." },
  { title: "Liquid Damage", text: "Liquid or water damage is not covered." },
  { title: "Burn / Dead Damage", text: "Burnt components, dead laptop, or damage from electrical misuse, short circuits or external power incidents are not covered." },
  { title: "Unauthorized Repair", text: "Unauthorized repair, tampering or modifications may void the warranty." },
  { title: "Warranty Verification", text: "Claims are verified using this invoice, the warranty sticker and the product serial number." },
  { title: "Exchange Policy", text: "7-day exchange policy, subject to Techno X exchange terms." },
];

/* 03XX / +92 / 92 -> 923XXXXXXXXX for wa.me links (null if not a valid PK mobile) */
export function waNumber(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (/^03\d{9}$/.test(d)) return "92" + d.slice(1);
  if (/^923\d{9}$/.test(d)) return d;
  if (/^3\d{9}$/.test(d)) return "92" + d;
  return null;
}
